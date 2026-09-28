import { vi } from 'vitest';

declare const jsdom: { window: Window };

// Vitest's window aliases globalThis, where Node 26 shadows browser storage.
// Use the actual JSDOM window supplied by the test environment.
vi.stubGlobal('localStorage', jsdom.window.localStorage);
vi.stubGlobal('sessionStorage', jsdom.window.sessionStorage);
