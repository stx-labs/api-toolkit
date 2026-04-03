import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { BasePgStore, sqlTransactionContext } from '../../src/postgres/base-pg-store.js';
import { connectPostgres } from '../../src/postgres/connection.js';

class TestPgStore extends BasePgStore {
  static async connect(): Promise<TestPgStore> {
    const sql = await connectPostgres({ usageName: 'test' });
    return new TestPgStore(sql);
  }
}

describe('BasePgStore', () => {
  let db: TestPgStore;

  beforeEach(async () => {
    db = await TestPgStore.connect();
  });

  afterEach(async () => {
    await db.close();
  });

  it('bytea column serialization', async () => {
    const vectors = [
      { from: '0x0001', to: '0x0001' },
      { from: '0X0002', to: '0x0002' },
      { from: '0xFfF3', to: '0xfff3' },
      { from: Buffer.from('0004', 'hex'), to: '0x0004' },
      { from: new Uint16Array(new Uint8Array([0x00, 0x05]).buffer), to: '0x0005' },
      { from: '\\x0006', to: '0x0006' },
      { from: '\\xfFf7', to: '0xfff7' },
      { from: '\\x', to: '0x' },
      { from: '', to: '0x' },
      { from: Buffer.alloc(0), to: '0x' },
    ];
    await db.sqlWriteTransaction(async sql => {
      await sql`
        CREATE TEMPORARY TABLE bytea_testing(
          value bytea NOT NULL
        ) ON COMMIT DROP
      `;
      for (const v of vectors) {
        const query = await sql<{ value: string }[]>`
          insert into bytea_testing (value) values (${v.from})
          returning value
        `;
        assert.strictEqual(query[0].value, v.to);
      }
    });
    const badInputs: unknown[] = ['0x123', '1234', '0xnoop', new Date(), 1234];
    for (const input of badInputs) {
      const query = async () =>
        db.sql.begin(async sql => {
          await sql`
          CREATE TEMPORARY TABLE bytea_testing(
            value bytea NOT NULL
          ) ON COMMIT DROP
        `;
          return await sql`insert into bytea_testing (value) values (${input})`;
        });
      await assert.rejects(query, /./);
    }
  });

  it('postgres transaction connection integrity', async () => {
    const obj = db.sql;
    const dbName = obj.options.database;

    assert.strictEqual(sqlTransactionContext.getStore(), undefined);
    await db.sqlTransaction(async sql => {
      const newObj = sql;
      assert.notStrictEqual(obj, newObj);
      assert.deepStrictEqual(sqlTransactionContext.getStore()?.[dbName], newObj);

      await db.sqlTransaction(innerSql => {
        assert.strictEqual(newObj, innerSql);
      });

      assert.strictEqual(db.sql, newObj);
    });

    assert.strictEqual(sqlTransactionContext.getStore(), undefined);
    assert.strictEqual(db.sql, obj);
  });

  it('isConnected returns true when the connection is alive', async () => {
    const connected = await db.isConnected();
    assert.strictEqual(connected, true);
  });

  it('isConnected returns false when the connection is not alive', async () => {
    const failingSql = Object.assign(
      function sqlTag() {
        return Promise.reject(new Error('Connection lost'));
      },
      {}
    );
    Object.defineProperty(db, 'sql', {
      configurable: true,
      get: () => failingSql as typeof db.sql,
    });
    try {
      const connected = await db.isConnected();
      assert.strictEqual(connected, false);
    } finally {
      Reflect.deleteProperty(db, 'sql');
    }
  });
});
