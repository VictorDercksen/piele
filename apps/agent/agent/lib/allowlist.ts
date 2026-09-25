/**
 * Sites the researcher may fetch and the preview may cite: URC and club channels, and
 * rugby news outlets in the URC's countries. A host matches a listed domain or any of
 * its subdomains. Extend the list deliberately; search results elsewhere stay uncited.
 * Subscription-only outlets (The Times, the Irish Times, the Sydney Morning Herald, the
 * Herald) are left out: the researcher cannot read them.
 */
export const ALLOWED_DOMAINS: readonly string[] = [
  // Competition and clubs
  'unitedrugby.com',
  'open-meteo.com',
  'benettonrugby.it',
  'bullsrugby.co.za',
  'cardiffrugby.wales',
  'connachtrugby.ie',
  'dragons.wales',
  'edinburghrugby.org',
  'glasgowwarriors.org',
  'leinsterrugby.ie',
  'lionsrugby.co.za',
  'munsterrugby.ie',
  'ospreysrugby.com',
  'scarlets.wales',
  'sharksrugby.co.za',
  'thestormers.com',
  'ulsterrugby.com',
  'zebreparma.it',
  // News: general
  'bbc.co.uk',
  'bbc.com',
  'planetrugby.com',
  'rugbypass.com',
  'rugbyworld.com',
  'ruck.co.uk',
  // News: South Africa
  'news24.com',
  'sarugby.co.za',
  'sarugbymag.co.za',
  'supersport.com',
  // News: Wales
  'walesonline.co.uk',
  // News: Scotland
  'scotsman.com',
  // News: Ireland
  'independent.ie',
  'irishexaminer.com',
  'irishmirror.ie',
  'rte.ie',
  'the42.ie',
  // News: Italy
  'onrugby.it',
  // News: New Zealand (Stuff, including Rugby Heaven)
  'stuff.co.nz',
  // News: England
  'theguardian.com',
];

/** True for an http(s) URL on an allowed domain. */
export function isAllowedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
