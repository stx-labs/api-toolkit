import * as events from 'node:events';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { timeout, waiter } from '../../src/helpers/time.js';

describe('Helper tests', () => {
  it('timeout function should not cause memory leak by accumulating abort listeners on abort', async () => {
    const controller = new AbortController();
    const { signal } = controller;

    const countListeners = () => events.getEventListeners(signal, 'abort').length;

    assert.strictEqual(countListeners(), 0);

    for (let i = 0; i < 100; i++) {
      try {
        const sleepPromise = timeout(1000, signal);
        controller.abort();
        await sleepPromise;
      } catch (err: unknown) {
        assert.match(String(err), /aborted/i);
      }

      assert.ok(countListeners() <= 1);
    }

    assert.strictEqual(countListeners(), 0);
  });

  it('timeout function should not cause memory leak by accumulating abort listeners on successful completion', async () => {
    const controller = new AbortController();
    const { signal } = controller;

    const countListeners = () => events.getEventListeners(signal, 'abort').length;

    assert.strictEqual(countListeners(), 0);

    for (let i = 0; i < 100; i++) {
      await timeout(2, signal);
      assert.strictEqual(countListeners(), 0);
    }

    assert.strictEqual(countListeners(), 0);
  });

  it('waiter is resolved', async () => {
    const myWaiter = waiter();
    myWaiter.resolve();
    await myWaiter;
    assert.strictEqual(myWaiter.isFinished, true);
    assert.strictEqual(myWaiter.isRejected, false);
    assert.strictEqual(myWaiter.isResolved, true);
  });

  it('waiter is resolved with value', async () => {
    const myWaiter = waiter<string>();
    const value = 'my resolve result';
    myWaiter.resolve(value);
    const result = await myWaiter;
    assert.strictEqual(result, value);
    assert.strictEqual(myWaiter.isFinished, true);
    assert.strictEqual(myWaiter.isRejected, false);
    assert.strictEqual(myWaiter.isResolved, true);
  });

  it('waiter is finished (ensure finish alias works)', async () => {
    const myWaiter = waiter();
    myWaiter.finish();
    await myWaiter;
    assert.strictEqual(myWaiter.isFinished, true);
    assert.strictEqual(myWaiter.isRejected, false);
    assert.strictEqual(myWaiter.isResolved, true);
  });

  it('waiter is rejected', async () => {
    const myWaiter = waiter();
    const error = new Error('Waiter was rejected');
    myWaiter.reject(error);
    await assert.rejects(async () => {
      await myWaiter;
    }, error);
    assert.strictEqual(myWaiter.isFinished, true);
    assert.strictEqual(myWaiter.isRejected, true);
    assert.strictEqual(myWaiter.isResolved, false);
  });

  it('waiter is rejected with error type', async () => {
    class MyError extends Error {
      override readonly name = 'MyError';
    }
    const myWaiter = waiter<void, MyError>();
    const error = new MyError('MyError test instance');
    myWaiter.reject(error);
    await assert.rejects(async () => {
      await myWaiter;
    }, error);
    assert.strictEqual(myWaiter.isFinished, true);
    assert.strictEqual(myWaiter.isRejected, true);
    assert.strictEqual(myWaiter.isResolved, false);
  });
});
