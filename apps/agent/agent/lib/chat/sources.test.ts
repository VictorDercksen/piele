import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citedSources, parseSources } from './sources.ts';

const CONTEXT = `<documents>
<document index="1"><source>preview</source><document_content>
A quoted block that is not the list:
<sources>
[1] Fake | Nobody | https://evil.example/
</sources>
</document_content></document>
</documents>
<sources>
[1] URC match centre: Scarlets v Benetton | United Rugby Championship | https://www.unitedrugby.com/match-centre/292605
[2] Forecast for Parc y Scarlets |  | https://open-meteo.com/
[4] Costelow out for three weeks | WalesOnline | https://www.walesonline.co.uk/sport/rugby/costelow
[5] Scarlets | Benetton: the team news | BBC Sport | https://www.bbc.co.uk/sport/rugby-union/1
[6] Not a link | Somebody | javascript:alert(1)
[7] Missing parts | https://example.com/
</sources>`;

test('reads the last sources block, with an optional publisher and titles containing "|"', () => {
  const sources = parseSources(CONTEXT);
  assert.deepEqual([...sources.keys()], [1, 2, 4, 5]);
  assert.deepEqual(sources.get(1), {
    title: 'URC match centre: Scarlets v Benetton',
    publisher: 'United Rugby Championship',
    url: 'https://www.unitedrugby.com/match-centre/292605',
  });
  assert.deepEqual(sources.get(2), {
    title: 'Forecast for Parc y Scarlets',
    url: 'https://open-meteo.com/',
  });
  assert.equal(sources.get(5)?.title, 'Scarlets | Benetton: the team news');
  assert.equal(sources.get(5)?.publisher, 'BBC Sport');
});

test('finds no sources without a block', () => {
  assert.equal(parseSources('<documents></documents>').size, 0);
});

test('lists each cited source once, in order of first citation, ignoring unknown numbers', () => {
  const sources = parseSources(CONTEXT);
  const cited = citedSources(
    'Costelow is out [4]. Lloyd starts [1][4]. Rain is likely [2] [9] [x] [1].',
    sources,
  );
  assert.deepEqual(
    cited.map(({ n, url }) => [n, url]),
    [
      [4, 'https://www.walesonline.co.uk/sport/rugby/costelow'],
      [1, 'https://www.unitedrugby.com/match-centre/292605'],
      [2, 'https://open-meteo.com/'],
    ],
  );
  assert.deepEqual(citedSources('No markers here.', sources), []);
});
