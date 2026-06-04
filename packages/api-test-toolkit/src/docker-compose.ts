import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import * as net from 'node:net';

/**
 * A readiness probe polled after `docker compose up` returns. Each probe is
 * retried until it succeeds or the shared readiness deadline is hit.
 */
export type DockerComposeReadiness =
  | {
      type: 'port';
      /** Host to connect to (default: "127.0.0.1") */
      host?: string;
      /** TCP port that must accept a connection */
      port: number;
      /** Human-readable label for log output */
      label?: string;
    }
  | {
      type: 'http';
      /** URL to poll (e.g. "http://127.0.0.1:20443/v2/info") */
      url: string;
      /** Status code that signals readiness (default: any 2xx) */
      expectStatus?: number;
      /** Human-readable label for log output */
      label?: string;
    };

export interface DockerComposeTestConfig {
  /** Project name passed to `docker compose -p` to isolate this stack. */
  projectName: string;
  /** Absolute path to the docker compose file. */
  composeFile: string;
  /** Working directory for build contexts (default: the compose file's dir). */
  cwd?: string;
  /** Extra env vars merged over `process.env` for compose `${VAR}` interpolation. */
  env?: Record<string, string>;
  /** Build images during `up` (default: true). */
  build?: boolean;
  /** Readiness probes polled after `up` returns. */
  waitFor?: DockerComposeReadiness[];
  /** Stream the compose child's stdio to the parent process (default: true). */
  inheritStdio?: boolean;
  /** Timeout for the `up` (and build) step in ms (default: 45 min). */
  upTimeoutMs?: number;
  /** Combined timeout for all readiness probes in ms (default: 15 min). */
  readyTimeoutMs?: number;
  /** Timeout for the `down` step in ms (default: 5 min). */
  downTimeoutMs?: number;
}

const DEFAULTS = {
  host: '127.0.0.1',
  upTimeoutMs: 45 * 60_000,
  readyTimeoutMs: 15 * 60_000,
  downTimeoutMs: 5 * 60_000,
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCompose(
  config: DockerComposeTestConfig,
  args: string[],
  opts: { timeoutMs: number; heartbeatLabel?: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cwd = config.cwd ?? dirname(config.composeFile);
    const fullArgs = ['compose', '-p', config.projectName, '-f', config.composeFile, ...args];
    // When stdio is not inherited, run the compose CLI quietly: capture its
    // output and only surface it if the command fails. This keeps the console
    // focused on the test runner instead of verbose build/up/down logs.
    const capture = config.inheritStdio === false;
    process.stdout.write(`[testenv] docker ${fullArgs.join(' ')}\n`);
    const child = spawn('docker', fullArgs, {
      cwd,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      // Inherit the shell env so compose `${VAR:-default}` interpolation works,
      // with explicit overrides taking precedence.
      env: { ...process.env, ...config.env },
    });

    let captured = '';
    if (capture) {
      const collect = (chunk: Buffer | string) => {
        captured += chunk.toString();
        // Keep only the tail so a long build doesn't balloon memory.
        if (captured.length > 100_000) captured = captured.slice(-100_000);
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
    }

    // Periodic liveness line so a long-running step (image build, slow boot)
    // doesn't look frozen while output is suppressed.
    const startedAt = Date.now();
    const heartbeat = opts.heartbeatLabel
      ? setInterval(() => {
          const elapsed = Math.round((Date.now() - startedAt) / 1000);
          process.stdout.write(`[testenv] ${opts.heartbeatLabel} … (${elapsed}s)\n`);
        }, 15_000)
      : undefined;

    const timer =
      opts.timeoutMs > 0
        ? setTimeout(() => {
            child.kill('SIGKILL');
            reject(
              new Error(`docker compose ${args.join(' ')} timed out after ${opts.timeoutMs}ms`)
            );
          }, opts.timeoutMs)
        : undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
    };
    child.on('error', err => {
      cleanup();
      reject(err);
    });
    child.on('exit', code => {
      cleanup();
      if (code === 0) {
        resolve();
      } else {
        const tail = capture
          ? `\n--- docker compose output (tail) ---\n${captured.slice(-8_000)}`
          : '';
        reject(new Error(`docker compose ${args.join(' ')} exited with code ${code}${tail}`));
      }
    });
  });
}

function tryConnect(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection(port, host);
    socket.setTimeout(1_000);
    socket.on('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

async function tryHttp(url: string, expectStatus?: number): Promise<boolean> {
  try {
    const res = await fetch(url);
    return expectStatus ? res.status === expectStatus : res.ok;
  } catch {
    return false;
  }
}

async function waitForProbe(probe: DockerComposeReadiness, deadline: number): Promise<void> {
  const label =
    probe.label ??
    (probe.type === 'port' ? `${probe.host ?? DEFAULTS.host}:${probe.port}` : probe.url);
  const startedAt = Date.now();
  let lastBeat = startedAt;
  while (true) {
    const ok =
      probe.type === 'port'
        ? await tryConnect(probe.host ?? DEFAULTS.host, probe.port)
        : await tryHttp(probe.url, probe.expectStatus);
    if (ok) {
      process.stdout.write(`[testenv] ${label} ready\n`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    // Liveness line every ~15s so a slow boot doesn't look frozen.
    const now = Date.now();
    if (now - lastBeat >= 15_000) {
      process.stdout.write(
        `[testenv] waiting for ${label} … (${Math.round((now - startedAt) / 1000)}s)\n`
      );
      lastBeat = now;
    }
    await sleep(probe.type === 'port' ? 500 : 2_000);
  }
}

/**
 * Build (optional) and start a `docker compose` stack detached, then block until
 * every configured readiness probe passes. Use for multi-service test
 * environments that need image builds and an inter-service network — things the
 * single-image {@link dockerTestUp} cannot provide.
 */
export async function dockerComposeTestUp(args: {
  config: DockerComposeTestConfig;
}): Promise<void> {
  const { config } = args;
  const build = config.build !== false;
  const upArgs = ['up', ...(build ? ['--build'] : []), '-d', '--remove-orphans'];
  await runCompose(config, upArgs, {
    timeoutMs: config.upTimeoutMs ?? DEFAULTS.upTimeoutMs,
    heartbeatLabel:
      config.inheritStdio === false
        ? `${build ? 'building & ' : ''}starting ${config.projectName}`
        : undefined,
  });

  if (config.waitFor?.length) {
    const deadline = Date.now() + (config.readyTimeoutMs ?? DEFAULTS.readyTimeoutMs);
    for (const probe of config.waitFor) {
      await waitForProbe(probe, deadline);
    }
  }
  process.stdout.write(`[testenv] compose project ${config.projectName} ready\n`);
}

/** Stop and remove a compose stack along with its named volumes. */
export async function dockerComposeTestDown(args: {
  config: DockerComposeTestConfig;
}): Promise<void> {
  const { config } = args;
  await runCompose(config, ['down', '--volumes', '--remove-orphans', '--timeout', '1'], {
    timeoutMs: config.downTimeoutMs ?? DEFAULTS.downTimeoutMs,
  });
  process.stdout.write(`[testenv] compose project ${config.projectName} removed\n`);
}

/**
 * Tail compose logs. `argv` mirrors a CLI: pass `-f`/`--follow` to stream, and
 * any non-flag args are treated as service names to filter by.
 */
export async function dockerComposeTestLogs(args: {
  config: DockerComposeTestConfig;
  argv: string[];
}): Promise<void> {
  const { config, argv } = args;
  const follow = argv.includes('-f') || argv.includes('--follow');
  const services = argv.filter(a => !a.startsWith('-'));
  await runCompose(config, ['logs', ...(follow ? ['-f'] : []), '--tail', '200', ...services], {
    // No timeout when following an open log stream.
    timeoutMs: follow ? 0 : 60_000,
  });
}
