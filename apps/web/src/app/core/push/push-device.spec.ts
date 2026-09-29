import { appleMobile, applicationServerKey, pushSupported, standalone } from './push-device';

function globals(
  navigator: Partial<Navigator> & { standalone?: boolean },
  window: Partial<Window> = {},
): { navigator: Navigator; window: Window } {
  return { navigator: navigator as Navigator, window: window as Window };
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';

describe('push-device', () => {
  it('needs service workers, the Push API and notifications', () => {
    const full = globals({ serviceWorker: {} as ServiceWorkerContainer }, {
      PushManager: class {},
      Notification: class {},
    } as unknown as Window);
    expect(pushSupported(full)).toBe(true);
    expect(pushSupported(globals({}, { Notification: class {} } as unknown as Window))).toBe(false);
    expect(pushSupported(null)).toBe(false);
  });

  it('knows an iPhone or an iPad that reports a Mac, and not Android or a desktop Mac', () => {
    expect(appleMobile(globals({ userAgent: IPHONE, maxTouchPoints: 5 }))).toBe(true);
    expect(appleMobile(globals({ userAgent: MAC, maxTouchPoints: 5 }))).toBe(true);
    expect(appleMobile(globals({ userAgent: MAC, maxTouchPoints: 0 }))).toBe(false);
    expect(appleMobile(globals({ userAgent: ANDROID, maxTouchPoints: 5 }))).toBe(false);
  });

  it('knows the Home Screen app from a browser tab', () => {
    const tab = { matchMedia: () => ({ matches: false }) } as unknown as Window;
    const app = { matchMedia: () => ({ matches: true }) } as unknown as Window;
    expect(standalone(globals({}, tab))).toBe(false);
    expect(standalone(globals({}, app))).toBe(true);
    expect(standalone(globals({ standalone: true }, tab))).toBe(true);
  });

  it('decodes the base64url VAPID key', () => {
    expect(Array.from(applicationServerKey('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
    expect(
      applicationServerKey(
        'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
      ),
    ).toHaveLength(65);
  });
});
