import { getHorizonElevation, evaluateEpoch, findOptimalWindow } from "./horizonEngine.js";

let lunarData = null;
let playTimer = null;

const els = {
  badge: document.getElementById("dataSourceBadge"),
  playBtn: document.getElementById("playPauseBtn"),
  speedSelect: document.getElementById("speedSelect"),
  syncCheck: document.getElementById("syncTimeCheck"),
  optBtn: document.getElementById("findOptimalBtn"),
  compareBtn: document.getElementById("compareToggleBtn"),
  workspace: document.getElementById("workspaceGrid"),
  selectA: document.getElementById("siteSelectA"),
  selectB: document.getElementById("siteSelectB"),
  notesA: document.getElementById("siteNotesA"),
  notesB: document.getElementById("siteNotesB"),
  optBannerA: document.getElementById("optBannerA"),
  optBannerB: document.getElementById("optBannerB"),
  sliderA: document.getElementById("epochSliderA"),
  sliderB: document.getElementById("epochSliderB"),
  tsA: document.getElementById("timestampDisplayA"),
  tsB: document.getElementById("timestampDisplayB"),
  hrA: document.getElementById("hourIndexA"),
  hrB: document.getElementById("hourIndexB"),
  maxHrA: document.getElementById("maxHourA"),
  maxHrB: document.getElementById("maxHourB"),
  canvasA: document.getElementById("horizonCanvasA"),
  canvasB: document.getElementById("horizonCanvasB"),
  metricsA: document.getElementById("metricsA"),
  metricsB: document.getElementById("metricsB"),
  polarCanvas: document.getElementById("polarMapCanvas"),
  customLat: document.getElementById("customLat"),
  customLon: document.getElementById("customLon"),
  customElev: document.getElementById("customElev"),
  customBtn: document.getElementById("customEvalBtn"),
  customResult: document.getElementById("customResult")
};

async function loadLunarDataset() {
  const candidates = ["./data/lunar_data.json", "./data/lunarData.json"];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      if (res.ok) return await res.json();
    } catch (_) {
      // Try next filename
    }
  }
  throw new Error("Could not load lunar_data.json from /data/");
}

async function init() {
  try {
    lunarData = await loadLunarDataset();
    const startUtc = lunarData.metadata?.start_utc || "2026-12-01 00:00";
    const stopUtc = lunarData.metadata?.stop_utc || "2026-12-31 00:00";
    els.badge.textContent = `JPL Horizons Ephemeris Loaded (${startUtc} → ${stopUtc})`;
  } catch (err) {
    els.badge.textContent = "Run scripts/fetch_horizons.py to generate /data/lunar_data.json";
    els.badge.style.color = "#f87171";
    console.error(err);
    return;
  }

  const siteEntries = Object.entries(lunarData.sites || {});
  const siteList = siteEntries.map(([key, site]) => ({
    ...site,
    id: site.id || key
  }));

  siteList.forEach((site) => {
    const lonLabel = site.lon_180 !== undefined ? site.lon_180 : site.lon_360;
    const label = `${site.name} (${site.lat}°, ${lonLabel}°)`;
    els.selectA.add(new Option(label, site.id));
    els.selectB.add(new Option(label, site.id));
  });

  const ids = siteList.map((s) => s.id);
  els.selectA.value = ids.includes("mons-mouton") ? "mons-mouton" : ids[0];
  els.selectB.value = ids.includes("shackleton-rim")
    ? "shackleton-rim"
    : ids[1] || ids[0];

  const maxIdx = Math.max(0, (siteList[0]?.timeline?.length || 1) - 1);
  els.sliderA.max = maxIdx;
  els.sliderB.max = maxIdx;
  els.maxHrA.textContent = maxIdx;
  els.maxHrB.textContent = maxIdx;

  bindEvents();
  renderAll();
}

function bindEvents() {
  els.selectA.addEventListener("change", () => {
    els.optBannerA.classList.add("hidden");
    renderAll();
  });
  els.selectB.addEventListener("change", () => {
    els.optBannerB.classList.add("hidden");
    renderAll();
  });

  els.sliderA.addEventListener("input", () => {
    if (els.syncCheck.checked) {
      els.sliderB.value = els.sliderA.value;
    }
    renderAll();
  });

  els.sliderB.addEventListener("input", () => {
    if (els.syncCheck.checked) {
      els.sliderA.value = els.sliderB.value;
    }
    renderAll();
  });

  els.compareBtn.addEventListener("click", () => {
    els.workspace.classList.toggle("compare-active");
  });

  els.optBtn.addEventListener("click", jumpToOptimalWindows);
  els.playBtn.addEventListener("click", togglePlayback);
  els.customBtn.addEventListener("click", evaluateCustomCoordinates);
}

function formatDuration(hours) {
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return days > 0 ? `${days}d ${rem}h` : `${rem}h`;
}

function jumpToOptimalWindows() {
  if (playTimer) togglePlayback();

  const startUtc = lunarData.metadata?.start_utc || "2026-12-01 00:00";
  const siteA = getSiteById(els.selectA.value);
  const siteB = getSiteById(els.selectB.value);

  const resA = findOptimalWindow(siteA, startUtc);
  const resB = findOptimalWindow(siteB, startUtc);

  // Uncheck sync so each site can jump independently to its peak operational date
  if (resA.bestWindow.startIdx !== resB.bestWindow.startIdx) {
    els.syncCheck.checked = false;
  }

  els.sliderA.value = resA.bestWindow.startIdx;
  els.sliderB.value = resB.bestWindow.startIdx;

  updateOptBanner(els.optBannerA, resA);
  updateOptBanner(els.optBannerB, resB);

  renderAll();
}

function updateOptBanner(bannerEl, res) {
  const pctBoth = Math.round((res.totalOptimalHours / res.totalHours) * 100);
  const pctSun = Math.round((res.totalSunHours / res.totalHours) * 100);
  const pctDte = Math.round((res.totalDteHours / res.totalHours) * 100);
  const label =
    res.mode === "BOTH"
      ? "Peak Simultaneous Power + DTE Window"
      : "Peak Solar Window (Earth Blocked All Month)";

  bannerEl.classList.remove("hidden");
  bannerEl.innerHTML = `
    <strong>★ ${label}:</strong> ${res.bestWindow.startUtc} → ${res.bestWindow.endUtc}
    (<strong>${formatDuration(res.bestWindow.durationHours)}</strong> continuous)<br/>
    Monthly Duty Cycle: <strong>${pctBoth}% Both</strong> | ${pctSun}% Sun | ${pctDte}% Earth DTE
  `;
}

function togglePlayback() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    els.playBtn.textContent = "▶ Play Lunar Cycle";
    return;
  }

  els.playBtn.textContent = "⏸ Pause Simulation";
  playTimer = setInterval(() => {
    const step = Number(els.speedSelect.value);
    const max = Number(els.sliderA.max);
    const nextA = (Number(els.sliderA.value) + step) % (max + 1);
    els.sliderA.value = nextA;

    if (els.syncCheck.checked) {
      els.sliderB.value = nextA;
    } else {
      els.sliderB.value = (Number(els.sliderB.value) + step) % (max + 1);
    }
    renderAll();
  }, 180);
}

function formatCountdown(hours, isCurrentlyActive, activeLabel, inactiveLabel) {
  if (hours === null) {
    return isCurrentlyActive
      ? `Continuous (>30 days ${activeLabel})`
      : `Continuous (>30 days ${inactiveLabel})`;
  }
  const timeStr = formatDuration(hours);
  return isCurrentlyActive
    ? `${timeStr} until ${inactiveLabel}`
    : `${timeStr} until ${activeLabel}`;
}

function getSiteById(siteId) {
  if (lunarData.sites[siteId]) return { id: siteId, ...lunarData.sites[siteId] };
  const found = Object.entries(lunarData.sites).find(([k, v]) => (v.id || k) === siteId);
  return found ? { id: found[0], ...found[1] } : null;
}

function renderScenario(siteId, epochIdx, notesEl, tsEl, hrEl, canvasEl, metricsEl) {
  const site = getSiteById(siteId);
  if (!site) return;

  const startUtc = lunarData.metadata?.start_utc || "2026-12-01 00:00";
  const evalData = evaluateEpoch(site, epochIdx, startUtc);

  notesEl.textContent = `${site.region || "Lunar Surface"} | Elev: ${site.elevation_km ?? 0} km — ${site.notes || ""}`;
  tsEl.textContent = evalData.timestamp;
  hrEl.textContent = epochIdx;

  drawHorizonPanorama(canvasEl, site, evalData);

  const sunStatusClass = evalData.sun.visible ? "status-ok" : "status-bad";
  const dteStatusClass = evalData.earth.dteConnected ? "status-ok" : "status-bad";

  metricsEl.innerHTML = `
    <div class="metric-card">
      <div class="metric-title">Solar Elevation &amp; Power</div>
      <div class="metric-value ${sunStatusClass}">
        ${evalData.sun.visible ? `${evalData.sun.el.toFixed(2)}° (${evalData.sun.powerPct}% Power)` : `Shadowed (${evalData.sun.el.toFixed(2)}°)`}
      </div>
      <div class="metric-sub">Azimuth: ${evalData.sun.az.toFixed(1)}° | Terrain Mask: ${evalData.sun.horizonEl}°</div>
    </div>

    <div class="metric-card">
      <div class="metric-title">Solar Operational Window</div>
      <div class="metric-value ${evalData.sun.visible ? "status-warn" : "status-bad"}">
        ${formatCountdown(evalData.sun.hoursToTransition, evalData.sun.visible, "Sunrise", "Sunset")}
      </div>
      <div class="metric-sub">Airless lunar horizon (0° atmospheric refraction)</div>
    </div>

    <div class="metric-card">
      <div class="metric-title">Direct-to-Earth (DTE) Link</div>
      <div class="metric-value ${dteStatusClass}">
        ${evalData.earth.dteConnected ? `CONNECTED (${evalData.earth.el.toFixed(2)}°)` : `BLOCKED (${evalData.earth.el.toFixed(2)}°)`}
      </div>
      <div class="metric-sub">Earth Azimuth: ${evalData.earth.az.toFixed(1)}° | Terrain Mask: ${evalData.earth.horizonEl}°</div>
    </div>

    <div class="metric-card">
      <div class="metric-title">Comms Window Countdown</div>
      <div class="metric-value ${evalData.earth.dteConnected ? "status-ok" : "status-warn"}">
        ${formatCountdown(evalData.earth.hoursToTransition, evalData.earth.dteConnected, "Earthrise", "Earthset")}
      </div>
      <div class="metric-sub">Includes Earth libration wobble near horizon</div>
    </div>
  `;
}

function drawHorizonPanorama(canvas, site, evalData) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const isEquatorial = Math.abs(Number(site.lat)) < 45;
  const minEl = -8;
  const maxEl = isEquatorial ? 90 : 18;
  const elToY = (el) => h - ((el - minEl) / (maxEl - minEl)) * h;
  const azToX = (az) => (az / 360) * w;

  ctx.fillStyle = "#060a12";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#64748b";

  const stepEl = isEquatorial ? 15 : 4;
  for (let el = -4; el <= maxEl; el += stepEl) {
    const y = elToY(el);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${el}°`, 6, y - 3);
  }

  const yZero = elToY(0);
  ctx.strokeStyle = "#334155";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, yZero);
  ctx.lineTo(w, yZero);
  ctx.stroke();
  ctx.setLineDash([]);

  const cardinals = [
    { az: 0, label: "N (0°)" },
    { az: 90, label: "E (90°)" },
    { az: 180, label: "S (180°)" },
    { az: 270, label: "W (270°)" },
    { az: 360, label: "N (360°)" }
  ];
  cardinals.forEach((c) => {
    const x = azToX(c.az);
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(c.label, Math.min(x + 4, w - 42), 14);
  });

  const profile = site.horizon_profile_deg || site.horizonProfile || [];
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let az = 0; az <= 360; az += 2) {
    const terrainEl = getHorizonElevation(az, profile);
    ctx.lineTo(azToX(az), elToY(terrainEl));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = "#1e2536";
  ctx.fill();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const sunX = azToX(evalData.sun.az);
  const sunY = elToY(evalData.sun.el);
  ctx.beginPath();
  ctx.arc(sunX, sunY, 9, 0, Math.PI * 2);
  ctx.fillStyle = evalData.sun.visible ? "#fbbf24" : "rgba(251, 191, 36, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "#fef08a";
  ctx.stroke();
  ctx.fillStyle = "#fde047";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText(`SUN ${evalData.sun.el.toFixed(1)}°`, Math.min(sunX + 12, w - 70), Math.max(sunY + 4, 24));

  const earthX = azToX(evalData.earth.az);
  const earthY = elToY(evalData.earth.el);
  ctx.beginPath();
  ctx.arc(earthX, earthY, 8, 0, Math.PI * 2);
  ctx.fillStyle = evalData.earth.dteConnected ? "#38bdf8" : "rgba(56, 189, 248, 0.35)";
  ctx.fill();
  ctx.strokeStyle = "#bae6fd";
  ctx.stroke();
  ctx.fillStyle = "#7dd3fc";
  ctx.fillText(`EARTH ${evalData.earth.el.toFixed(1)}°`, Math.min(earthX + 12, w - 82), Math.max(earthY + 4, 38));
}

function drawPolarMap(epochIdx) {
  const ctx = els.polarCanvas.getContext("2d");
  const w = els.polarCanvas.width;
  const h = els.polarCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxRadius = w / 2 - 22;
  const maxColat = 6.5;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#090e1a";
  ctx.fillRect(0, 0, w, h);

  [2, 4, 6].forEach((colat) => {
    const r = (colat / maxColat) * maxRadius;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#1e293b";
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.font = "10px sans-serif";
    ctx.fillText(`-${90 - colat}°`, cx + 4, cy - r + 11);
  });

  ctx.strokeStyle = "#1e293b";
  ctx.beginPath();
  ctx.moveTo(cx, 10);
  ctx.lineTo(cx, h - 10);
  ctx.moveTo(10, cy);
  ctx.lineTo(w - 10, cy);
  ctx.stroke();

  const startUtc = lunarData.metadata?.start_utc || "2026-12-01 00:00";

  Object.entries(lunarData.sites).forEach(([key, rawSite]) => {
    const site = { id: rawSite.id || key, ...rawSite };
    if (Number(site.lat) > -80) return;

    const colat = 90 + Number(site.lat);
    const r = (colat / maxColat) * maxRadius;
    const lon360 = site.lon_360 !== undefined ? Number(site.lon_360) : ((Number(site.lon_180) % 360) + 360) % 360;
    const theta = (lon360 * Math.PI) / 180;
    const x = cx + r * Math.sin(theta);
    const y = cy + r * Math.cos(theta);

    const status = evaluateEpoch(site, epochIdx, startUtc);
    let color = "#f87171";
    if (status.sun.visible && status.earth.dteConnected) color = "#34d399";
    else if (status.sun.visible) color = "#fbbf24";
    else if (status.earth.dteConnected) color = "#38bdf8";

    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (site.id === els.selectA.value || site.id === els.selectB.value) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px sans-serif";
    ctx.fillText(site.name.split(" ")[0], x + 8, y + 4);
  });
}

function evaluateCustomCoordinates() {
  const lat = parseFloat(els.customLat.value);
  const lon = parseFloat(els.customLon.value);
  const elev = parseFloat(els.customElev.value);

  if (Number.isNaN(lat) || Number.isNaN(lon) || Number.isNaN(elev) || lat < -90 || lat > 90) {
    els.customResult.innerHTML = `<span class="status-bad">Please enter valid lunar coordinates (Latitude -90° to +90°).</span>`;
    return;
  }

  const normLon = ((lon % 360) + 360) % 360;
  const epochIdx = Number(els.sliderA.value);
  const refSite = getSiteById("malapert-massif") || Object.values(lunarData.sites)[0];
  const refEpoch = refSite.timeline[epochIdx] || {};
  const refSunEl = Number(refEpoch.sun_el ?? refEpoch.sunEl ?? 0);
  const refLon = refSite.lon_360 !== undefined ? Number(refSite.lon_360) : 0;

  const R_MOON = 1737.4;
  const horizonDipDeg =
    elev > 0
      ? -(Math.acos(R_MOON / (R_MOON + elev)) * 180) / Math.PI
      : 0.4;

  const latRad = (lat * Math.PI) / 180;
  const lonDiffRad = ((normLon - refLon) * Math.PI) / 180;
  const subSolarLatRad = ((refSunEl + 4) * Math.PI) / 180;
  const estSunEl =
    (Math.asin(
      Math.sin(latRad) * Math.sin(subSolarLatRad) +
        Math.cos(latRad) * Math.cos(subSolarLatRad) * Math.cos(lonDiffRad)
    ) *
      180) /
    Math.PI;

  const estEarthEl =
    (Math.asin(Math.cos(latRad) * Math.cos((normLon * Math.PI) / 180)) * 180) /
    Math.PI;

  const sunOk = estSunEl > horizonDipDeg;
  const dteOk = estEarthEl > horizonDipDeg;

  els.customResult.innerHTML = `
    <strong>Custom Coordinate Assessment (${lat.toFixed(2)}°, ${normLon.toFixed(2)}° E, ${elev} km):</strong><br/>
    • Geometric Spherical Horizon Dip: <strong>${horizonDipDeg.toFixed(2)}°</strong> (Airless vacuum)<br/>
    • Estimated Solar Elevation: <strong class="${sunOk ? "status-ok" : "status-bad"}">${estSunEl.toFixed(2)}° (${sunOk ? "Illuminated" : "Below Horizon"})</strong><br/>
    • Estimated Earth Elevation (DTE): <strong class="${dteOk ? "status-ok" : "status-bad"}">${estEarthEl.toFixed(2)}° (${dteOk ? "Direct Link Available" : "Far-Side / Blocked"})</strong>
  `;
}

function renderAll() {
  const idxA = Number(els.sliderA.value);
  const idxB = Number(els.sliderB.value);

  renderScenario(els.selectA.value, idxA, els.notesA, els.tsA, els.hrA, els.canvasA, els.metricsA);
  renderScenario(els.selectB.value, idxB, els.notesB, els.tsB, els.hrB, els.canvasB, els.metricsB);
  drawPolarMap(idxA);
}

init();