import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync, execSync } from 'child_process';
import * as assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getServerVersion } from '../../src/server-version/index.js';
import { isDebugging } from '../../src/helpers/is-debugging.js';

const scriptFilePath = path.resolve('bin/api-toolkit-git-info.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '.tmp'));

describe('getServerVersion does not throw when debugging', () => {
  let debuggingEnabled: boolean;
  let originalEnv: string | undefined;

  before(() => {
    debuggingEnabled = isDebugging();
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'prod';
  });

  after(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('getServerVersion does not throw when debugging', () => {
    if (!debuggingEnabled) {
      console.log(`Skipping test because debugging is not enabled.`);
      return;
    }
    const version = getServerVersion();
    assert.strictEqual(version.branch, 'debugging');
  });
});

describe('git info script', () => {
  it('error when git repo data not available', () => {
    const result = spawnSync(`node "${scriptFilePath}"`, {
      cwd: tempDir,
      shell: true,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 1);
    assert.ok(result.stderr.includes('not a git repository'));
  });

  it('error when no git tags found', () => {
    execSync(
      'git init && git config user.name test && git config user.email test && git config commit.gpgsign false && git commit --allow-empty -n -m test',
      { cwd: tempDir }
    );
    const result = spawnSync(`node "${scriptFilePath}"`, {
      cwd: tempDir,
      shell: true,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 1);
    assert.ok(result.stderr.includes('no tag found'));
  });

  it('generates get info file correctly', () => {
    execSync(
      'git init && git config user.name test && git config user.email test && git config commit.gpgsign false && git commit --allow-empty -n -m test && git tag v1.2.3 && git branch -m my_branch',
      { cwd: tempDir }
    );
    const result = spawnSync(`node "${scriptFilePath}"`, {
      cwd: tempDir,
      shell: true,
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0);
    const gitInfoFilePath = path.join(tempDir, '.git-info');
    assert.ok(fs.existsSync(gitInfoFilePath));
    const gitInfoContent = fs.readFileSync(gitInfoFilePath, { encoding: 'utf8' });
    const gitInfoParts = gitInfoContent.split('\n');
    assert.strictEqual(gitInfoParts[0], 'my_branch');
    assert.ok(gitInfoParts[1]);
    assert.strictEqual(gitInfoParts[2], 'v1.2.3');
  });
});
