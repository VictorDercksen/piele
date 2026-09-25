/**
 * Sites the researcher may fetch and the preview may cite: URC and club channels, and
 * rugby news outlets in the URC's countries. A host matches a listed domain or any of
 * its subdomains. Extend the list deliberately; search results elsewhere stay uncited.
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
  // News
  'bbc.co.uk',
  'bbc.com',
  'rte.ie',
  'irishtimes.com',
  'independent.ie',
  'the42.ie',
  'irishexaminer.com',
  'walesonline.co.uk',
  'heraldscotland.com',
  'scotsman.com',
  'news24.com',
  'supersport.com',
  'sarugby.co.za',
  'planetrugby.com',
  'rugbypass.com',
  'ruck.co.uk',
  'onrugby.it',
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
