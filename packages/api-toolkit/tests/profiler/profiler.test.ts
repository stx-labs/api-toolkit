import type { FastifyInstance } from 'fastify';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildProfilerServer } from '../../src/profiler/server.js';
import { timeout } from '../../src/helpers/time.js';

describe('CPU profiler', () => {
  let fastify: FastifyInstance;

  before(async () => {
    fastify = await buildProfilerServer();
  });

  after(async () => {
    await fastify.close();
  });

  it('CPU profiler snapshot bad duration', async () => {
    const query1 = await fastify.inject({
      method: 'GET',
      url: `/profile/cpu?duration=-100`,
    });
    assert.strictEqual(query1.statusCode, 400);
  });

  it('generate CPU profiler snapshot', async () => {
    const duration = 0.25;
    const query1 = await fastify.inject({
      method: 'GET',
      url: `/profile/cpu?duration=${duration}`,
    });
    assert.strictEqual(query1.statusCode, 200);
    assert.strictEqual(query1.headers['content-type'], 'application/json; charset=utf-8');
    let cpuProfileBody: unknown;
    assert.doesNotThrow(() => {
      cpuProfileBody = query1.json();
    });
    assert.ok(cpuProfileBody && typeof cpuProfileBody === 'object');
    const body = cpuProfileBody as Record<string, unknown>;
    assert.ok(Array.isArray(body.nodes));
    assert.ok(Array.isArray(body.samples));
    assert.ok(Array.isArray(body.timeDeltas));
    assert.strictEqual(typeof body.startTime, 'number');
    assert.strictEqual(typeof body.endTime, 'number');
  });

  it('cancel CPU profiler snapshot', async () => {
    const duration = 150;
    const promise = fastify.inject({
      method: 'GET',
      url: `/profile/cpu?duration=${duration}`,
    });
    await timeout(200);
    const endQuery = await fastify.inject({
      method: 'GET',
      url: `/profile/cancel`,
    });
    assert.strictEqual(endQuery.statusCode, 200);
    const result = await promise;
    assert.strictEqual(result.statusCode, 500);
  });
});
