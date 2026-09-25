import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedUrl } from './allowlist.ts';

test('allows listed domains and their subdomains over http(s)', () => {
  assert.equal(isAllowedUrl('https://www.unitedrugby.com/news/x'), true);
  assert.equal(isAllowedUrl('https://unitedrugby.com/'), true);
  assert.equal(isAllowedUrl('http://www.bbc.co.uk/sport/rugby-union'), true);
  assert.equal(isAllowedUrl('https://WWW.RTE.IE./sport'), true);
  for (const url of [
    'https://www.rugbyworld.com/news',
    'https://www.sarugbymag.co.za/stormers/',
    'https://www.irishmirror.ie/sport/rugby/',
    'https://www.stuff.co.nz/sport/rugby',
    'https://www.smh.com.au/sport/rugby-union',
    'https://www.theguardian.com/sport/rugby-union',
    'https://www.thetimes.com/sport/rugby-union',
  ]) {
    assert.equal(isAllowedUrl(url), true, url);
  }
});

test('rejects other hosts, look-alikes, other schemes and credentials', () => {
  assert.equal(isAllowedUrl('https://example.org/'), false);
  assert.equal(isAllowedUrl('https://unitedrugby.com.evil.test/'), false);
  assert.equal(isAllowedUrl('https://notunitedrugby.com/'), false);
  assert.equal(isAllowedUrl('ftp://unitedrugby.com/'), false);
  assert.equal(isAllowedUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedUrl('https://user:pass@unitedrugby.com/'), false);
  assert.equal(isAllowedUrl('not a url'), false);
});
