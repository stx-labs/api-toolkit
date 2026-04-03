import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPostgres } from '../../src/postgres/connection.js';

function setTestEnvVars(
  envVars: Record<string, string | undefined>,
  use: () => Promise<void>
): Promise<void>;
function setTestEnvVars(envVars: Record<string, string | undefined>, use: () => void): void;
function setTestEnvVars(
  envVars: Record<string, string | undefined>,
  use: () => void | Promise<void>
): void | Promise<void> {
  const existing = Object.fromEntries(
    Object.keys(envVars)
      .filter(k => k in process.env)
      .map(k => [k, process.env[k]])
  );
  const added = Object.keys(envVars).filter(k => !(k in process.env));
  Object.entries(envVars).forEach(([k, v]) => {
    process.env[k] = v;
    if (v === undefined) {
      delete process.env[k];
    }
  });
  const restoreEnvVars = () => {
    added.forEach(k => delete process.env[k]);
    Object.entries(existing).forEach(([k, v]) => (process.env[k] = v));
  };
  let runFn: void | Promise<void> | undefined;
  try {
    runFn = use();
    if (runFn instanceof Promise) {
      return runFn.finally(() => restoreEnvVars());
    }
  } finally {
    if (!(runFn instanceof Promise)) {
      restoreEnvVars();
    }
  }
}

describe('postgres connection', () => {
  it('postgres env var config', () => {
    setTestEnvVars(
      {
        PGDATABASE: 'pg_db_db1',
        PGUSER: 'pg_user_user1',
        PGPASSWORD: 'pg_password_password1',
        PGHOST: 'pg_host_host1',
        PGPORT: '9876',
        PGSSLMODE: 'allow',
        PGAPPNAME: 'test-env-vars',
      },
      () => {
        const sql = getPostgres({ usageName: 'tests' });
        assert.strictEqual(sql.options.database, 'pg_db_db1');
        assert.strictEqual(sql.options.user, 'pg_user_user1');
        assert.strictEqual(sql.options.pass, 'pg_password_password1');
        assert.deepStrictEqual(sql.options.host, ['pg_host_host1']);
        assert.deepStrictEqual(sql.options.port, [9876]);
        assert.strictEqual(sql.options.ssl, 'allow');
        assert.strictEqual(sql.options.connection.application_name, 'test-env-vars:tests');
      }
    );
  });

  it('postgres uri config', () => {
    const uri =
      'postgresql://test_user:secret_password@database.server.com:3211/test_db?ssl=true&search_path=test_schema&application_name=test-conn-str';
    const sql = getPostgres({ usageName: 'tests', connectionArgs: uri });
    assert.strictEqual(sql.options.database, 'test_db');
    assert.strictEqual(sql.options.user, 'test_user');
    assert.strictEqual(sql.options.pass, 'secret_password');
    assert.deepStrictEqual(sql.options.host, ['database.server.com']);
    assert.deepStrictEqual(sql.options.port, [3211]);
    assert.strictEqual(sql.options.ssl, 'true');
    assert.strictEqual(sql.options.connection.search_path, 'test_schema');
    assert.strictEqual(sql.options.connection.application_name, 'test-conn-str:tests');
  });
});
