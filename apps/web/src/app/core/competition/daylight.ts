const DAY_MS = 86_400_000;
const RADIANS = Math.PI / 180;

/**
 * Whether the sun is above the horizon at a place and UTC instant, from NOAA's general
 * solar position approximation (within a few minutes of sunrise and sunset).
 */
export function sunIsUp(latitude: number, longitude: number, instantMs: number): boolean {
  const date = new Date(instantMs);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const year = (2 * Math.PI * (instantMs - yearStart)) / (365 * DAY_MS);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(year) -
      0.032077 * Math.sin(year) -
      0.014615 * Math.cos(2 * year) -
      0.040849 * Math.sin(2 * year));
  const declination =
    0.006918 -
    0.399912 * Math.cos(year) +
    0.070257 * Math.sin(year) -
    0.006758 * Math.cos(2 * year) +
    0.000907 * Math.sin(2 * year) -
    0.002697 * Math.cos(3 * year) +
    0.00148 * Math.sin(3 * year);
  const utcMinutes = ((instantMs - yearStart) % DAY_MS) / 60_000;
  const solarMinutes = utcMinutes + equationOfTime + 4 * longitude;
  const hourAngle = (solarMinutes / 4 - 180) * RADIANS;
  const lat = latitude * RADIANS;
  // The cosine of the solar zenith angle, which is the sine of the sun's elevation.
  const sineOfElevation =
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  return sineOfElevation > 0;
}
