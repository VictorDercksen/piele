/** What the browser offers for Web Push. Pure checks, so specs can pass their own globals. */

export interface PushGlobals {
  readonly navigator: Navigator;
  readonly window: Window;
}

function browserGlobals(): PushGlobals | null {
  return typeof window === 'undefined' ? null : { navigator, window };
}

/** Service workers, the Push API and notifications are all there. */
export function pushSupported(globals = browserGlobals()): boolean {
  if (!globals) return false;
  return (
    'serviceWorker' in globals.navigator &&
    'PushManager' in globals.window &&
    'Notification' in globals.window
  );
}

/** Opened from the Home Screen (or as an installed app) rather than in a browser tab. */
export function standalone(globals = browserGlobals()): boolean {
  if (!globals) return false;
  const iosStandalone = (globals.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    iosStandalone === true ||
    globals.window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

/** An iPhone or iPad, including iPads that report a desktop Mac. */
export function appleMobile(globals = browserGlobals()): boolean {
  if (!globals) return false;
  const { userAgent, maxTouchPoints } = globals.navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** The API's base64url VAPID public key as the bytes `PushManager.subscribe` expects. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded =
    base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
