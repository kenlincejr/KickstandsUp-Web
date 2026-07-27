/**
 * Byte-parity port of C:\KickstandsUp\src\features\rides\daylight.ts (device
 * repo, KickstandsUp). Ported verbatim for trip-autopilot-spec-2026-07-26 §6.1
 * (web surface) / §9.3 (daylight.ts). No behavior changes — this file is pure,
 * offline, zero-dependency, and must stay byte-identical to the device source
 * unless that source changes first.
 *
 * NOAA solar position algorithm — pure, offline, zero API, zero dependencies.
 *
 * Autopilot's `darkPenalty` (trip-autopilot spec §4.6, §9.3) needs sunrise and
 * sunset at an arbitrary lat/lon on an arbitrary future date, evaluated inside
 * a synchronous DP loop. Nothing in the tree computes that today — a grep for
 * `sunrise|sunset|solar` across `src/` only turns up the per-ride NWS forecast
 * field, which is not evaluable off-schedule. This is that missing primitive.
 *
 * Algorithm: the NOAA Solar Calculator's published equations (geometric mean
 * longitude/anomaly of the sun, equation of time, solar declination, hour
 * angle), the same formulas behind NOAA's public spreadsheet. Two-pass
 * (the hour-angle estimate is refined once against its own result) keeps
 * accuracy within the ±2 minute target stated in the spec.
 *
 * `date`'s UTC calendar day (Y-M-D component) is the day evaluated — callers
 * that care about a specific local calendar day at the target coordinates
 * should pass a `Date` anchored near UTC noon for that day, so the ±12h of
 * timezone slop around a UTC-midnight boundary never flips the calendar date.
 *
 * Returns `null` for a boundary that does not occur that day (polar day —
 * `sunsetAt: null` — or polar night — both `null`). Callers must drop the
 * dependent penalty rather than guess (§4.6: "when solarEvents returns null
 * sunset, drop darkPenalty").
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function degToRad(deg: number) {
  return deg * DEG_TO_RAD;
}
function radToDeg(rad: number) {
  return rad * RAD_TO_DEG;
}

/** Julian day number at 0h UT for a UTC calendar date. */
function julianDayAtMidnightUTC(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

function julianCentury(jd: number) {
  return (jd - 2451545.0) / 36525.0;
}

function geomMeanLongSun(t: number) {
  let l0 = 280.46646 + t * (36000.76983 + t * 0.0003032);
  l0 %= 360;
  if (l0 < 0) l0 += 360;
  return l0;
}

function geomMeanAnomalySun(t: number) {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

function eccentricityEarthOrbit(t: number) {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

function sunEqOfCenter(t: number) {
  const m = degToRad(geomMeanAnomalySun(t));
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
}

function sunTrueLong(t: number) {
  return geomMeanLongSun(t) + sunEqOfCenter(t);
}

function sunApparentLong(t: number) {
  const omega = 125.04 - 1934.136 * t;
  return sunTrueLong(t) - 0.00569 - 0.00478 * Math.sin(degToRad(omega));
}

function meanObliquityOfEcliptic(t: number) {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  return 23 + (26 + seconds / 60) / 60;
}

function obliquityCorrection(t: number) {
  const omega = 125.04 - 1934.136 * t;
  return meanObliquityOfEcliptic(t) + 0.00256 * Math.cos(degToRad(omega));
}

function sunDeclination(t: number) {
  const e = degToRad(obliquityCorrection(t));
  const lambda = degToRad(sunApparentLong(t));
  return radToDeg(Math.asin(Math.sin(e) * Math.sin(lambda)));
}

function equationOfTimeMinutes(t: number) {
  const epsilon = degToRad(obliquityCorrection(t));
  const l0 = degToRad(geomMeanLongSun(t));
  const e = eccentricityEarthOrbit(t);
  const m = degToRad(geomMeanAnomalySun(t));

  let y = Math.tan(epsilon / 2);
  y *= y;

  const sin2l0 = Math.sin(2 * l0);
  const sinm = Math.sin(m);
  const cos2l0 = Math.cos(2 * l0);
  const sin4l0 = Math.sin(4 * l0);
  const sin2m = Math.sin(2 * m);

  const value =
    y * sin2l0 - 2 * e * sinm + 4 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m;
  return radToDeg(value) * 4;
}

/** Radians. `null` when the sun never crosses the horizon that day (polar). */
function hourAngle(latitude: number, solarDecDeg: number): number | null {
  const latRad = degToRad(latitude);
  const decRad = degToRad(solarDecDeg);
  const cosH =
    Math.cos(degToRad(90.833)) / (Math.cos(latRad) * Math.cos(decRad)) - Math.tan(latRad) * Math.tan(decRad);
  if (cosH < -1 || cosH > 1) return null;
  return Math.acos(cosH);
}

/** Minutes past 0h UT of `jdMidnight`, two-pass refined. `sign` +1 = sunrise, -1 = sunset. */
function eventMinutesUTC(jdMidnight: number, latitude: number, longitude: number, sign: 1 | -1): number | null {
  let t = julianCentury(jdMidnight);
  let eqTime = equationOfTimeMinutes(t);
  let dec = sunDeclination(t);
  let ha = hourAngle(latitude, dec);
  if (ha === null) return null;

  // Solar noon (UTC minutes) is `720 - 4*longitude - eqTime` (longitude
  // negative West); sunrise/sunset sit `4*hourAngleDegrees` minutes to either
  // side of it, so `delta = longitude + sign*hourAngleDeg` folds both into one
  // expression with `sign = +1` (sunrise, earlier) / `-1` (sunset, later).
  let delta = longitude + sign * radToDeg(ha);
  let timeUTC = 720 - 4 * delta - eqTime;

  // Refine once against the fractional day the first pass landed on.
  const refinedJD = jdMidnight + timeUTC / 1440;
  t = julianCentury(refinedJD);
  eqTime = equationOfTimeMinutes(t);
  dec = sunDeclination(t);
  ha = hourAngle(latitude, dec);
  if (ha === null) return null;

  delta = longitude + sign * radToDeg(ha);
  timeUTC = 720 - 4 * delta - eqTime;
  return timeUTC;
}

export type SolarEvents = {
  sunriseAt: string | null;
  sunsetAt: string | null;
};

/**
 * Sunrise and sunset, as absolute ISO instants, for the UTC calendar day of
 * `date` at (`latitude`, `longitude`). Either field is `null` when that
 * boundary does not occur that day (polar day/night) — never a guessed value.
 */
export function solarEvents(date: Date, latitude: number, longitude: number): SolarEvents {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Number.isNaN(date.getTime())) {
    return { sunriseAt: null, sunsetAt: null };
  }
  const clampedLat = Math.max(-89.9, Math.min(89.9, latitude));
  const jdMidnight = julianDayAtMidnightUTC(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());

  const midnightEpochMs = (jdMidnight - 2440587.5) * 86_400_000;
  const toIso = (minutesUTC: number | null) => {
    if (minutesUTC === null || !Number.isFinite(minutesUTC)) return null;
    return new Date(midnightEpochMs + minutesUTC * 60_000).toISOString();
  };

  return {
    sunriseAt: toIso(eventMinutesUTC(jdMidnight, clampedLat, longitude, 1)),
    sunsetAt: toIso(eventMinutesUTC(jdMidnight, clampedLat, longitude, -1)),
  };
}
