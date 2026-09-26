/**
 * Reads a localStorage value that was kept under an older key before the product was
 * renamed from Piele to The Pavilion. When only the older key holds a value, it moves to
 * the new key once. Callers still validate what comes back. Throws when storage is
 * unavailable, like localStorage itself.
 */
export function readRenamedKey(key: string, legacyKey: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy === null) return null;
  try {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
  } catch {
    // Moving the value is a convenience; the caller still gets it this time.
  }
  return legacy;
}
