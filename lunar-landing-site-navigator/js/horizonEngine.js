/**
 * horizonEngine.js
 * Airless lunar horizon interpolation, solar power fraction,
 * Direct-to-Earth (DTE) evaluation, and optimal window finder.
 */

const SOLAR_ANGULAR_DIAMETER_DEG = 0.53;
const SOLAR_SEMIDIAMETER_DEG = SOLAR_ANGULAR_DIAMETER_DEG / 2;

export function normalizeAzimuth(az) {
  return ((Number(az) % 360) + 360) % 360;
}

/**
 * Formats an exact UTC timestamp from metadata.start_utc + offsetHours.
 */
export function formatUtcFromStart(startUtcStr = "2026-12-01 00:00", offsetHours = 0) {
  const clean = String(startUtcStr).replace(" ", "T").replace("Z", "");
  const baseMs = Date.parse(`${clean}:00Z`.replace(":00:00Z", ":00Z"));
  if (Number.isNaN(baseMs)) return `Hour +${offsetHours}`;

  const d = new Date(baseMs + offsetHours * 3600 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

export function getHorizonElevation(azimuthDeg, horizonProfile) {
  const az = normalizeAzimuth(azimuthDeg);
  if (!horizonProfile) return 0;

  if (Array.isArray(horizonProfile) && typeof horizonProfile[0] === "number") {
    const n = horizonProfile.length;
    if (n === 0) return 0;
    const step = 360 / n;
    const exactIdx = az / step;
    const i0 = Math.floor(exactIdx) % n;
    const i1 = (i0 + 1) % n;
    const frac = exactIdx - Math.floor(exactIdx);
    const v0 = Number(horizonProfile[i0]) || 0;
    const v1 = Number(horizonProfile[i1]) || 0;
    return Number((v0 + (v1 - v0) * frac).toFixed(2));
  }

  if (Array.isArray(horizonProfile) && typeof horizonProfile[0] === "object") {
    const sorted = [...horizonProfile].sort((a, b) => a.az - b.az);
    const n = sorted.length;
    if (n === 0) return 0;

    for (let i = 0; i < n; i++) {
      const curr = sorted[i];
      const next = sorted[(i + 1) % n];
      const nextAz = i === n - 1 ? next.az + 360 : next.az;
      const queryAz = az < sorted[0].az ? az + 360 : az;

      if (queryAz >= curr.az && queryAz <= nextAz) {
        const span = nextAz - curr.az || 1;
        const frac = (queryAz - curr.az) / span;
        return Number((curr.el + (next.el - curr.el) * frac).toFixed(2));
      }
    }
    return Number(sorted[0].el) || 0;
  }

  if (typeof horizonProfile === "object") {
    const keys = Object.keys(horizonProfile)
      .map(Number)
      .filter((k) => !Number.isNaN(k))
      .sort((a, b) => a - b);

    if (keys.length === 0) return 0;
    const points = keys.map((k) => ({ az: k, el: Number(horizonProfile[k]) || 0 }));
    return getHorizonElevation(az, points);
  }

  return 0;
}

function checkSunStatus(epoch, profile) {
  const az = normalizeAzimuth(epoch.sun_az ?? epoch.sunAz ?? 0);
  const el = Number(epoch.sun_el ?? epoch.sunEl ?? -5);
  const horizonEl = getHorizonElevation(az, profile);

  const visible = el > horizonEl;
  let powerPct = 0;

  if (el >= horizonEl + SOLAR_SEMIDIAMETER_DEG) {
    powerPct = 100;
  } else if (el > horizonEl - SOLAR_SEMIDIAMETER_DEG) {
    const illuminatedFraction =
      (el - (horizonEl - SOLAR_SEMIDIAMETER_DEG)) / SOLAR_ANGULAR_DIAMETER_DEG;
    powerPct = Math.round(Math.max(0, Math.min(1, illuminatedFraction)) * 100);
  }

  return { az, el, horizonEl, visible, powerPct };
}

function checkEarthStatus(epoch, profile) {
  const az = normalizeAzimuth(epoch.earth_az ?? epoch.earthAz ?? 0);
  const el = Number(epoch.earth_el ?? epoch.earthEl ?? -5);
  const horizonEl = getHorizonElevation(az, profile);
  const dteConnected = el > horizonEl;

  return { az, el, horizonEl, dteConnected };
}

export function evaluateEpoch(site, epochIdx, startUtcStr = "2026-12-01 00:00") {
  const timeline = site.timeline || [];
  const safeIdx = Math.max(0, Math.min(epochIdx, timeline.length - 1));
  const current = timeline[safeIdx] || {};
  const profile = site.horizon_profile_deg || site.horizonProfile || [];

  const sun = checkSunStatus(current, profile);
  const earth = checkEarthStatus(current, profile);

  let sunHoursToTransition = null;
  for (let i = safeIdx + 1; i < timeline.length; i++) {
    const futureSun = checkSunStatus(timeline[i], profile);
    if (futureSun.visible !== sun.visible) {
      sunHoursToTransition = i - safeIdx;
      break;
    }
  }

  let earthHoursToTransition = null;
  for (let i = safeIdx + 1; i < timeline.length; i++) {
    const futureEarth = checkEarthStatus(timeline[i], profile);
    if (futureEarth.dteConnected !== earth.dteConnected) {
      earthHoursToTransition = i - safeIdx;
      break;
    }
  }

  const timestamp =
    current.timestamp ||
    current.utc ||
    current.datetime ||
    current.time ||
    formatUtcFromStart(startUtcStr, safeIdx);

  return {
    timestamp,
    sun: {
      ...sun,
      hoursToTransition: sunHoursToTransition
    },
    earth: {
      ...earth,
      hoursToTransition: earthHoursToTransition
    }
  };
}

/**
 * Scans the full timeline to find the longest continuous window where
 * BOTH Solar Power and Earth DTE link are active simultaneously.
 */
export function findOptimalWindow(site, startUtcStr = "2026-12-01 00:00") {
  const timeline = site.timeline || [];
  const profile = site.horizon_profile_deg || site.horizonProfile || [];

  let totalOptimalHours = 0;
  let totalSunHours = 0;
  let totalDteHours = 0;

  let bestBoth = { startIdx: 0, endIdx: 0, durationHours: 0 };
  let currBoth = null;

  let bestSun = { startIdx: 0, endIdx: 0, durationHours: 0 };
  let currSun = null;

  for (let i = 0; i < timeline.length; i++) {
    const sun = checkSunStatus(timeline[i], profile);
    const earth = checkEarthStatus(timeline[i], profile);
    const isBoth = sun.visible && earth.dteConnected;

    if (sun.visible) totalSunHours++;
    if (earth.dteConnected) totalDteHours++;
    if (isBoth) totalOptimalHours++;

    if (isBoth) {
      if (!currBoth) currBoth = { startIdx: i, endIdx: i, durationHours: 1 };
      else {
        currBoth.endIdx = i;
        currBoth.durationHours++;
      }
      if (currBoth.durationHours > bestBoth.durationHours) {
        bestBoth = { ...currBoth };
      }
    } else {
      currBoth = null;
    }

    if (sun.visible) {
      if (!currSun) currSun = { startIdx: i, endIdx: i, durationHours: 1 };
      else {
        currSun.endIdx = i;
        currSun.durationHours++;
      }
      if (currSun.durationHours > bestSun.durationHours) {
        bestSun = { ...currSun };
      }
    } else {
      currSun = null;
    }
  }

  const chosen = bestBoth.durationHours > 0 ? bestBoth : bestSun;
  const mode = bestBoth.durationHours > 0 ? "BOTH" : "SOLAR_ONLY";

  return {
    mode,
    bestWindow: {
      ...chosen,
      startUtc: formatUtcFromStart(startUtcStr, chosen.startIdx),
      endUtc: formatUtcFromStart(startUtcStr, chosen.endIdx)
    },
    totalOptimalHours,
    totalSunHours,
    totalDteHours,
    totalHours: timeline.length
  };
}