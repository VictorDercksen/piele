import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INTERNATIONALS_OUTPUT_SCHEMA,
  MAX_INTERNATIONALS,
  UNIONS,
  internationals,
  playerKey,
} from './internationals.ts';

// The keys of UNIONS in apps/api/app/chat/glossary.py, in order.
const API_UNIONS = [
  'South Africa',
  'New Zealand',
  'Australia',
  'Argentina',
  'France',
  'Italy',
  'Ireland',
  'Wales',
  'Scotland',
  'England',
  'Georgia',
  'Fiji',
  'Samoa',
  'Tonga',
  'Japan',
  'United States',
  'Canada',
  'Uruguay',
  'Portugal',
  'Spain',
  'Romania',
  'Namibia',
  'Chile',
  'Germany',
  'Netherlands',
  'Hong Kong China',
  'Zimbabwe',
  'Kenya',
];

const item = {
  name: 'Evan Roos',
  union: 'South Africa',
  caps: 40,
  capsAsOf: '2026-09-12',
  lastTestOn: '2026-09-12',
  url: 'https://www.sarugby.co.za/news/x',
  title: 'Springbok squad',
  publisher: 'SA Rugby',
};

test('the researcher schema offers exactly the API unions', () => {
  assert.deepEqual([...UNIONS], API_UNIONS);
  assert.deepEqual(INTERNATIONALS_OUTPUT_SCHEMA.items.properties.union.enum, API_UNIONS);
  assert.equal(INTERNATIONALS_OUTPUT_SCHEMA.maxItems, MAX_INTERNATIONALS);
  assert.deepEqual(INTERNATIONALS_OUTPUT_SCHEMA.items.required, ['name', 'union', 'url', 'title']);
});

test('save_preview passes valid internationals through unchanged', () => {
  const minimal = { name: 'Salmaan Moerat', union: 'South Africa', url: 'https://www.unitedrugby.com/', title: 'Team news' };
  assert.deepEqual(internationals.parse([item, minimal]), [item, minimal]);
  assert.equal(internationals.parse(undefined), undefined);
});

test('save_preview drops items the API would refuse and caps the list', () => {
  const bad = [
    { ...item, union: 'Atlantis' },
    { ...item, caps: 0 },
    { ...item, lastTestOn: '12 September' },
    { ...item, lastTestOn: '2026-02-31' },
    { ...item, capsAsOf: '2026-13-01' },
    { ...item, title: '   ' },
    { ...item, name: 'Tab\tName' },
    { ...item, url: 'ftp://example.org' },
    { ...item, url: 'https://exa mple.org' },
    { ...item, url: 'http:///x' },
    { ...item, url: 'https:///' },
    { ...item, url: 'https://?q=1' },
    { ...item, url: 'https://#top' },
    { ...item, url: 'https://' },
    { ...item, lastTestOn: '0000-01-01' },
    { ...item, capsAsOf: '0000-12-31' },
    'nope',
  ];
  assert.deepEqual(internationals.parse([bad[0], item, ...bad.slice(1)]), [item]);
  assert.equal(internationals.parse(Array.from({ length: 40 }, () => item))?.length, MAX_INTERNATIONALS);
});

test('save_preview keeps URLs with a host and dates from year 1', () => {
  const kept = [
    { ...item, url: 'HTTPS://Example.org' },
    { ...item, url: 'http://example.org:8080/a?b=1#c' },
    { ...item, url: 'https://user@example.org/' },
    { ...item, lastTestOn: '0001-01-01', capsAsOf: '0001-01-01' },
  ];
  assert.deepEqual(internationals.parse(kept), kept);
});

test('player keys ignore accents, case and spacing like the API', () => {
  assert.equal(playerKey('  Cobus  Reinach '), 'cobus reinach');
  assert.equal(playerKey('Jean-Luc du Preez'), 'jean-luc du preez');
  assert.equal(playerKey('Ruán Nortjé'), 'ruan nortje');
  assert.equal(playerKey("Jack O'Donoghue"), "jack o'donoghue");
});
