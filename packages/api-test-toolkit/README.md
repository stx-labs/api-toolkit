# @stacks/api-test-toolkit

Test utilities for integration tests that need Docker-managed dependencies (for example Postgres).

## Installation

```bash
npm install -D @stacks/api-test-toolkit
```

This package expects Docker to be available on the machine running tests.

## Quick Start

Use the toolkit in your test global setup/teardown hooks.

```ts
import type { DockerTestContainerConfig } from '@stacks/api-test-toolkit';
import { dockerTestDown, dockerTestUp } from '@stacks/api-test-toolkit';

const postgres: DockerTestContainerConfig = {
  image: 'postgres:17',
  name: 'my-api-test-postgres',
  ports: [{ host: 5432, container: 5432 }],
  env: ['POSTGRES_USER=postgres', 'POSTGRES_PASSWORD=postgres', 'POSTGRES_DB=postgres'],
};

export async function globalSetup() {
  await dockerTestUp({ config: postgres });
}

export async function globalTeardown() {
  await dockerTestDown({ config: postgres });
}
```

## API

### `dockerTestUp({ config })`

Creates (or starts) the container and waits until it is reachable on TCP by default.

- Pulls image if missing
- Reuses an existing container with the same name
- Waits for readiness unless `waitForReady` is set to `false`

### `dockerTestDown({ config })`

Stops and removes the container if it exists.

- No-op if the container is already absent

### `dockerTestLogs({ config, argv })`

Streams or prints recent container logs.

- Follows logs by default
- Use `argv: ['--once']` to print once and exit
- `-f` / `--follow` force streaming mode

## `DockerTestContainerConfig`

Required fields:

- `image`: Docker image name (example: `postgres:17`)
- `name`: Docker container name
- `ports`: host/container port mapping array

Common optional fields:

- `host`: bind address (default: `127.0.0.1`)
- `waitPort`: host-side port to probe for readiness
- `waitForReady`: disable readiness check when set to `false`
- `env`: environment variables (`KEY=value`)
- `entrypoint`, `command`
- `volumes`: mount strings in `host:container` format
- `extraHosts`: `hostname:ip` entries
- `healthcheck`: shell command passed as Docker `CMD-SHELL`
- `restartPolicy`: `no | always | on-failure | unless-stopped`
- `labels`
- `timeoutMs`: readiness timeout (default: `120000`)

## Docker client environment

By default, Docker is accessed through:

- `DOCKER_SOCKET_PATH` (defaults to `/var/run/docker.sock`)

If `DOCKER_HOST` is set, it is used instead.

## Notes

- Prefer `import type` for TypeScript-only symbols:
  - `import type { DockerTestContainerConfig } from '@stacks/api-test-toolkit'`
- Container names should be unique per test suite to avoid clashes.

## License

Apache 2.0
