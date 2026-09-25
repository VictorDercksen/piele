import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasAgentToken, parseRunRequest } from './run-request.ts';

const TOKEN = 'x'.repeat(40);

test('accepts only the agent token as a bearer', () => {
  assert.equal(hasAgentToken(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(hasAgentToken(`Bearer ${TOKEN}y`, TOKEN), false);
  assert.equal(hasAgentToken(`Basic ${TOKEN}`, TOKEN), false);
  assert.equal(hasAgentToken(null, TOKEN), false);
  assert.equal(hasAgentToken(`Bearer ${TOKEN}`, undefined), false);
  assert.equal(hasAgentToken('Bearer ', ''), false);
});

test('reads an empty body, one fixture, or a forced fixture', () => {
  assert.deepEqual(parseRunRequest(''), {});
  assert.deepEqual(parseRunRequest('{}'), {});
  assert.deepEqual(parseRunRequest('{"fixtureId":"292584"}'), { fixtureId: '292584' });
  assert.deepEqual(parseRunRequest('{"fixtureId":"292584","force":true}'), { fixtureId: '292584', force: true });
});

test('rejects other shapes', () => {
  for (const text of ['nope', '[]', 'null', '{"force":true}', '{"fixtureId":292584}', '{"fixtureId":"a1"}', '{"force":"yes","fixtureId":"1"}', '{"extra":1}']) {
    assert.equal(parseRunRequest(text), null, text);
  }
});
