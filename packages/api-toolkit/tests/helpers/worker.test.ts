import * as assert from 'node:assert/strict';
import * as os from 'node:os';
import { after, before, describe, it } from 'node:test';
import { WorkerThreadManager } from '../../src/helpers/worker-thread-manager.js';
import * as workerModule from './my-worker.js';
import workerModuleDefaultExport from './my-worker-export-default.js';
import { MyCustomError } from './my-worker.js';
import { addKnownErrorConstructor } from '../../src/helpers/serialize-error.js';
import { stopwatch } from '../../src/helpers/time.js';
import { anyString, assertShape } from '../assert-shape.js';

it('worker module with default exports', async () => {
  const workerManager = await WorkerThreadManager.init(workerModuleDefaultExport, {
    workerCount: 2,
  });
  const res = await workerManager.exec(1, 1);
  assert.strictEqual(res, '1');
  await workerManager.close();
});

describe('Worker tests', () => {
  let workerManager: Awaited<ReturnType<typeof initWorkerManager>>;
  const workerCount = Math.min(4, os.cpus().length);
  const cpuPeggedTimeMs = 500;

  function initWorkerManager() {
    return WorkerThreadManager.init(workerModule, { workerCount });
  }

  before(async () => {
    addKnownErrorConstructor(MyCustomError);
    console.time('worker manager init');
    const manager = await initWorkerManager();
    console.timeEnd('worker manager init');
    workerManager = manager;
  });

  after(async () => {
    await workerManager.close();
  });

  it('run tasks with workers', async () => {
    const watch = stopwatch();
    const taskPromises = Array.from({ length: workerCount }, async (_, i) => {
      console.time(`task ${i}`);
      const res = await workerManager.exec(i, cpuPeggedTimeMs);
      console.timeEnd(`task ${i}`);
      return res;
    });

    assert.strictEqual(workerManager.busyWorkerCount, workerCount);
    assert.strictEqual(workerManager.idleWorkerCount, 0);

    const results = await Promise.allSettled(taskPromises);

    assert.ok(watch.getElapsed() < cpuPeggedTimeMs * 1.75);

    for (let i = 0; i < workerCount; i++) {
      const result = results[i];
      assert.strictEqual(result.status, 'fulfilled');
      if (result.status === 'fulfilled') {
        assert.strictEqual(result.value, i.toString());
      }
    }
  });

  it('worker task throws with non-Error value', async () => {
    const [res] = await Promise.allSettled([workerManager.exec(3333, 1)]);
    assert.strictEqual(res.status, 'rejected');
    if (res.status === 'rejected') {
      assert.strictEqual(res.reason, 'boom');
    }
  });

  it('worker task throws error', async () => {
    const [res] = await Promise.allSettled([workerManager.exec(2222, 1)]);
    assert.strictEqual(res.status, 'rejected');
    if (res.status === 'rejected') {
      assert.ok(res.reason instanceof MyCustomError);
      assertShape(res.reason, {
        name: 'MyCustomError',
        message: 'Error at req',
        code: 123,
        stack: anyString,
        randoProp: {
          foo: 'bar',
          baz: 123,
          aggregate: [
            {
              name: 'Error',
              message: 'Error in aggregate 1',
              inner1code: 123,
              stack: anyString,
            },
            {
              name: 'MyCustomError',
              message: 'Error in aggregate 2',
              stack: anyString,
            },
          ],
          sourceError: {
            name: 'MyCustomError',
            message: 'Source error',
            sourceErrorInfo: {
              code: 44,
            },
            stack: anyString,
          },
        },
      });
    }
  });

  it('worker task serializes AggregateError', async () => {
    const [res] = await Promise.allSettled([workerManager.exec(4444, 1)]);
    assert.strictEqual(res.status, 'rejected');
    if (res.status === 'rejected') {
      assert.ok(res.reason instanceof AggregateError);
      assertShape(res.reason, {
        name: 'AggregateError',
        message: 'My aggregate error message',
        stack: anyString,
        cause: 'foo',
        errors: [
          {
            name: 'Error',
            message: 'Error1 in aggregate 1',
            inner1code: 123,
            stack: anyString,
          },
          {
            name: 'TypeError',
            message: 'Error2 in aggregate 2',
            stack: anyString,
          },
        ],
      });
    }
  });

  it('worker task serializes DOMException (AbortError)', async () => {
    const [res] = await Promise.allSettled([workerManager.exec(5555, 1)]);
    assert.strictEqual(res.status, 'rejected');
    if (res.status === 'rejected') {
      assert.ok(res.reason instanceof DOMException);
      assert.strictEqual(res.reason.constructor, DOMException);
      assertShape(res.reason, {
        name: 'AbortError',
        message: 'This operation was aborted',
        stack: anyString,
      });
    }
  });

  it('run tasks on main thread', async () => {
    const watch = stopwatch();
    const results = await Promise.allSettled(
      Array.from({ length: workerCount }, (_, i) => {
        return Promise.resolve().then(() => workerModule.processTask(i, cpuPeggedTimeMs));
      })
    );

    assert.ok(watch.getElapsed() >= workerCount * cpuPeggedTimeMs);

    for (let i = 0; i < workerCount; i++) {
      const result = results[i];
      assert.strictEqual(result.status, 'fulfilled');
      if (result.status === 'fulfilled') {
        assert.strictEqual(result.value, i.toString());
      }
    }
  });

  it('Run more tasks than CPUs', async () => {
    const watch = stopwatch();
    const taskCount = workerManager.workerCount * 3;
    const taskTime = 50;
    const taskPromises = Array.from({ length: taskCount }, async (_, i) => {
      console.time(`task ${i}`);
      const res = await workerManager.exec(i, taskTime);
      console.timeEnd(`task ${i}`);
      return res;
    });

    assert.strictEqual(workerManager.busyWorkerCount, workerCount);
    assert.strictEqual(workerManager.idleWorkerCount, 0);
    assert.strictEqual(workerManager.queuedJobCount, taskCount - workerCount);

    const results = await Promise.allSettled(taskPromises);

    assert.ok(
      watch.getElapsed() < Math.ceil(taskCount / workerManager.workerCount) * taskTime * 1.5
    );

    for (let i = 0; i < taskPromises.length; i++) {
      const result = results[i];
      assert.strictEqual(result.status, 'fulfilled');
      if (result.status === 'fulfilled') {
        assert.strictEqual(result.value, i.toString());
      }
    }
  });
});
