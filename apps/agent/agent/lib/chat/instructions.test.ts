import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAT_INSTRUCTIONS } from './instructions.ts';

test('the prompt names the form, internationals and names documents', () => {
  for (const word of ['form', 'internationals', 'names document']) {
    assert.ok(CHAT_INSTRUCTIONS.includes(word), word);
  }
});

test('the prompt keeps the internationals boundary', () => {
  assert.match(CHAT_INSTRUCTIONS, /not recorded as an international in the documents/);
  assert.match(CHAT_INSTRUCTIONS, /never "uncapped"/);
  assert.match(CHAT_INSTRUCTIONS, /within the eight weeks before kickoff/);
  assert.doesNotMatch(CHAT_INSTRUCTIONS, /general rugby history/);
});

