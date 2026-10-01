import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RECHECK_AFTER_DAYS, researcherRequest, type RequestState } from './fixture-inputs.ts';

const NOW = new Date('2026-10-01T12:00:00Z');

const state: RequestState = {
  kickoffUtc: '2026-10-03T14:00:00Z',
  venue: 'Hive Stadium',
  generatedAt: '2026-10-01T12:00:00Z',
  home: {
    club: { name: 'Edinburgh Rugby' },
    teamsheet: {
      starters: [{ number: 1, name: 'Pierre Schoeman', position: 'Prop' }],
      replacements: [{ number: 16, name: 'Ewan Ashman', position: 'Hooker' }],
    },
    features: { restDays: 7 },
    internationals: [],
  },
  away: {
    club: { name: 'DHL Stormers' },
    teamsheet: {
      starters: [
        { number: 8, name: 'Evan Roos', position: 'Number 8' },
        { number: 4, name: 'Ruán Nortjé', position: 'Lock' },
        { number: 5, name: 'Salmaan Moerat', position: 'Lock' },
      ],
      replacements: [],
    },
    features: { restDays: 7 },
    internationals: [
      // Fresh record, accent differs from the teamsheet.
      { name: 'Ruan Nortje', union: 'South Africa', caps: 20, capsAsOf: '2026-09-12', lastTestOn: '2026-09-12', checkedAt: '2026-09-20T09:00:00Z', origin: 'researcher' },
      // Checked more than 30 days ago.
      { name: 'Salmaan Moerat', union: 'South Africa', caps: 30, capsAsOf: '2026-07-01', lastTestOn: '2026-07-01', checkedAt: '2026-08-15T09:00:00Z', origin: 'researcher' },
      // Not in the selection, so not passed on.
      { name: 'Someone Else', union: 'Fiji', caps: null, capsAsOf: null, lastTestOn: null, checkedAt: '2026-09-20T09:00:00Z', origin: 'operator' },
    ],
  },
};

function body(text: string): any {
  const [lead, ...json] = text.split('\n');
  assert.match(lead, /^Research this team/);
  return JSON.parse(json.join('\n'));
}

test('the request names the sides, the selection and the features', () => {
  const request = body(researcherRequest(state, 'away', NOW));
  assert.equal(request.team, 'DHL Stormers');
  assert.equal(request.opponent, 'Edinburgh Rugby');
  assert.equal(request.venue, 'Hive Stadium');
  assert.equal(request.startingXV.length, 3);
  assert.deepEqual(request.features, { restDays: 7 });
});

test('the request passes the known internationals of selected players, marking old checks', () => {
  assert.equal(RECHECK_AFTER_DAYS, 30);
  const request = body(researcherRequest(state, 'away', NOW));
  assert.deepEqual(
    request.knownInternationals.map((record: any) => [record.name, record.union, record.recheck]),
    [
      ['Ruan Nortje', 'South Africa', false],
      ['Salmaan Moerat', 'South Africa', true],
    ],
  );
  assert.equal(request.knownInternationals[0].lastTestOn, '2026-09-12');
  assert.deepEqual(request.selectedWithoutInternationalRecord, ['Evan Roos']);
});

test('a side with no records lists its whole selection as unchecked', () => {
  const request = body(researcherRequest(state, 'home', NOW));
  assert.deepEqual(request.knownInternationals, []);
  assert.deepEqual(request.selectedWithoutInternationalRecord, ['Pierre Schoeman', 'Ewan Ashman']);
});

test('a state without teamsheets or internationals still builds a request', () => {
  const request = body(researcherRequest({ home: { club: { name: 'A' } }, away: { club: { name: 'B' } } }, 'home', NOW));
  assert.equal(request.team, 'A');
  assert.deepEqual(request.knownInternationals, []);
  assert.deepEqual(request.startingXV, []);
});
