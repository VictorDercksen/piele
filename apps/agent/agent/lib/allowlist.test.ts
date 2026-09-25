import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedUrl } from './allowlist.ts';

test('allows listed domains and their subdomains over http(s)', () => {
  assert.equal(isAllowedUrl('https://www.unitedrugby.com/news/x'), true);
  assert.equal(isAllowedUrl('https://unitedrugby.com/'), true);
  assert.equal(isAllowedUrl('http://www.bbc.co.uk/sport/rugby-union'), true);
  assert.equal(isAllowedUrl('https://WWW.RTE.IE./sport'), true);
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
