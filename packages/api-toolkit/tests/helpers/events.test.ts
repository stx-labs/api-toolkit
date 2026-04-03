/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { EventEmitter } from 'node:events';
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { onceWhen } from '../../src/helpers/events.js';

describe('onceWhen tests', () => {
  it('should resolve when event is emitted and predicate matches', async () => {
    const emitter = new EventEmitter<{
      myTestEvent: [eventNumber: number, msg: string];
    }>();

    setTimeout(() => {
      for (let i = 0; i <= 5; i++) {
        emitter.emit('myTestEvent', i, `Message ${i}`);
      }
    }, 10);

    const [eventNumber, msg] = await onceWhen(emitter, 'myTestEvent', (eventNumber, msg) => {
      return eventNumber === 5;
    });
    assert.strictEqual(eventNumber, 5);
    assert.strictEqual(msg, 'Message 5');

    assert.deepStrictEqual(emitter.eventNames(), []);
  });

  it('should reject if aborted immediately', async () => {
    const emitter = new EventEmitter<{
      myTestEvent: [eventNumber: number];
    }>();
    const controller = new AbortController();
    const abortReason = new Error('Test aborted');
    controller.abort(abortReason);
    await assert.rejects(
      () => onceWhen(emitter, 'myTestEvent', () => true, { signal: controller.signal }),
      abortReason
    );

    assert.deepStrictEqual(emitter.eventNames(), []);
  });

  it('should reject if aborted before event is emitted', async () => {
    const emitter = new EventEmitter<{
      myTestEvent: [eventNumber: number];
    }>();
    const controller = new AbortController();
    const abortReason = new Error('Test aborted');
    setTimeout(() => {
      for (let i = 0; i <= 5; i++) {
        emitter.emit('myTestEvent', i);
        if (i === 3) {
          controller.abort(abortReason);
        }
      }
    }, 10);

    let lastEventNumberSeen = 0;
    await assert.rejects(
      () =>
        onceWhen(
          emitter,
          'myTestEvent',
          eventNumber => {
            lastEventNumberSeen = eventNumber;
            return false;
          },
          { signal: controller.signal }
        ),
      abortReason
    );

    assert.strictEqual(lastEventNumberSeen, 3);

    assert.deepStrictEqual(emitter.eventNames(), []);
  });

  it('should resolve if event is emitted before abort', async () => {
    const emitter = new EventEmitter<{
      myTestEvent: [eventNumber: number];
    }>();
    const controller = new AbortController();

    setTimeout(() => {
      for (let i = 0; i <= 5; i++) {
        emitter.emit('myTestEvent', i);
      }
      controller.abort();
    }, 10);

    const [eventNumber] = await onceWhen(emitter, 'myTestEvent', eventNumber => eventNumber === 5, {
      signal: controller.signal,
    });
    assert.strictEqual(eventNumber, 5);

    assert.deepStrictEqual(emitter.eventNames(), []);
  });

  it('should reject if predict function throws', async () => {
    const emitter = new EventEmitter<{
      myTestEvent: [eventNumber: number];
    }>();
    setTimeout(() => {
      for (let i = 0; i <= 5; i++) {
        emitter.emit('myTestEvent', i);
      }
    }, 10);

    let lastEventNumberSeen = 0;
    const predictFunctionError = new Error('Predict function error');
    await assert.rejects(
      () =>
        onceWhen(emitter, 'myTestEvent', eventNumber => {
          lastEventNumberSeen = eventNumber;
          if (eventNumber === 3) {
            throw predictFunctionError;
          }
          return false;
        }),
      predictFunctionError
    );
    assert.strictEqual(lastEventNumberSeen, 3);

    assert.deepStrictEqual(emitter.eventNames(), []);
  });

  it('abort signal test', async () => {
    const emitter = new EventEmitter<{ myEvent: [id: number, msg: string] }>();
    const signal = AbortSignal.timeout(10);
    setTimeout(() => emitter.emit('myEvent', 1, 'Hello'), 1000);
    const whenPromise = onceWhen(emitter, 'myEvent', id => id === 1, { signal });
    await assert.rejects(whenPromise, signal.reason);
  });
});
