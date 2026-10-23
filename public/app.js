const API = "https://data.vatsim.net/v3/vatsim-data.json";
const AIRPORT = "KMIA";
const KMIA = { lat: 25.7959, lon: -80.2870 };
const REFRESH_MS = 15000;
let arrivals = [];
let selectedCallsign = "";
let lastRatings = [];
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function distanceNm(lat, lon) {
  const toRad = n => n * Math.PI / 180;
  const dLat = toRad(lat - KMIA.lat), dLon = toRad(lon - KMIA.lon);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(KMIA.lat))*Math.cos(toRad(lat))*Math.sin(dLon/2)**2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function normAirport(s) { return String(s || "").trim().toUpperCase(); }
function parseAirportName(code) {
  const names = { KMIA:"Miami International", KATL:"Hartsfield-Jackson Atlanta", KDFW:"Dallas/Fort Worth", KJFK:"John F. Kennedy", KLAX:"Los Angeles International", KORD:"Chicago O'Hare", KIAH:"Houston Intercontinental", KFLL:"Fort Lauderdale-Hollywood", KTPA:"Tampa International", KCLT:"Charlotte Douglas", KMCO:"Orlando International", KBOS:"Boston Logan", KDEN:"Denver International", KSEA:"Seattle-Tacoma", KSFO:"San Francisco International" };
  return names[code] || "Departure airport";
}
function fmtAlt(feet) { return Number.isFinite(Number(feet)) ? `${Math.round(Number(feet)).toLocaleString()} ft` : "—"; }
function fmtSpeed(kts) { return Number.isFinite(Number(kts)) ? `${Math.round(Number(kts))} kt` : "—"; }
function fmtRange(nm) { return Number.isFinite(nm) ? `${Math.round(nm)} NM` : "—"; }

async function fetchArrivals() {
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) throw new Error(`VATSIM feed returned ${res.status}`);
    const data = await res.json();
    const pilots = Array.isArray(data.pilots) ? data.pilots : [];
    arrivals = pilots.map(p => {
      const fp = p.flight_plan || {};
      const dest = normAirport(fp.arrival);
      const nm = distanceNm(Number(p.latitude), Number(p.longitude));
      return {
        callsign: p.callsign || "UNKNOWN",
        aircraft: fp.aircraft_short || fp.aircraft_faa || fp.aircraft || "Aircraft type unavailable",
        origin: normAirport(fp.departure) || "----",
        destination: dest,
        altitude: Number(p.altitude),
        groundspeed: Number(p.groundspeed),
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        heading: Number(p.heading),
        distance: nm,
        flightRules: fp.flight_rules || "",
        route: fp.route || ""
      };
    }).filter(p => p.destination === AIRPORT && Number.isFinite(p.distance) && p.distance <= 150)
      .sort((a,b) => a.distance - b.distance);

    $("network-status").textContent = "LIVE DATA";
    $("arrival-count").textContent = `${arrivals.length} ARRIVAL${arrivals.length === 1 ? "" : "S"}`;
    $("updated").textContent = `UPDATED ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    renderQueue();
    refreshRatingFlightOptions();
    if (!arrivals.some(a => a.callsign === selectedCallsign)) {
      selectedCallsign = arrivals[0]?.callsign || "";
    }
    if (selectedCallsign) renderSelected();
    else renderEmptySelected();
    if (!arrivals.length) $("arrival-status").textContent = "No filed KMIA arrivals within 150 NM";
  } catch (err) {
    $("network-status").textContent = "FEED ERROR";
    $("arrival-status").textContent = "Unable to load VATSIM data; retrying automatically";
    $("queue-list").innerHTML = `<div class="empty">${escapeHtml(err.message)}. Check internet access / host proxy settings.</div>`;
  }
}
function renderQueue() {
  const list = $("queue-list");
  if (!arrivals.length) {
    list.innerHTML = '<div class="empty">No filed arrivals to KMIA within 150 NM. Traffic without a filed flight plan may not appear.</div>';
    return;
  }
  list.innerHTML = arrivals.slice(0, 8).map(p => `
    <button class="queue-item ${p.callsign === selectedCallsign ? "active" : ""}" data-callsign="${escapeHtml(p.callsign)}">
      <span><strong>${escapeHtml(p.callsign)}</strong><small>${escapeHtml(p.aircraft)} · ${escapeHtml(p.origin)} → KMIA</small></span>
      <span class="dist">${fmtRange(p.distance)}</span>
    </button>`).join("");
  list.querySelectorAll("[data-callsign]").forEach(btn => btn.addEventListener("click", () => {
    selectedCallsign = btn.dataset.callsign;
    renderQueue(); renderSelected();
  }));
}
function renderSelected() {
  const p = arrivals.find(a => a.callsign === selectedCallsign);
  if (!p) return renderEmptySelected();
  $("callsign").textContent = p.callsign;
  $("aircraft").textContent = p.aircraft;
  $("origin").textContent = p.origin;
  $("origin-name").textContent = parseAirportName(p.origin);
  $("altitude").textContent = fmtAlt(p.altitude);
  $("speed").textContent = fmtSpeed(p.groundspeed);
  $("range").textContent = fmtRange(p.distance);
  $("arrival-status").textContent = p.distance <= 10 ? "Near airport · monitor for landing" : p.distance <= 30 ? "Arrival area · approaching KMIA" : "Inbound · filed destination KMIA";
  $("rating-callsign").textContent = p.callsign;
  $("rating-aircraft").textContent = `${p.aircraft} · ${p.origin} → KMIA`;
  $("rating-flight").value = p.callsign;
}
function renderEmptySelected() {
  $("callsign").textContent = "NO ARRIVALS";
  $("aircraft").textContent = "Waiting for aircraft with KMIA as filed destination";
  $("origin").textContent = "----"; $("origin-name").textContent = "Departure airport";
  $("altitude").textContent = "—"; $("speed").textContent = "—"; $("range").textContent = "—";
  $("arrival-status").textContent = "Searching for filed arrivals to KMIA";
}
function refreshRatingFlightOptions() {
  const select = $("rating-flight");
  const old = select.value;
  select.innerHTML = '<option value="">Choose callsign…</option>' + arrivals.map(p =>
    `<option value="${escapeHtml(p.callsign)}">${escapeHtml(p.callsign)} — ${escapeHtml(p.aircraft)}</option>`).join("");
  if (arrivals.some(p => p.callsign === old)) select.value = old;
  else if (arrivals.some(p => p.callsign === selectedCallsign)) select.value = selectedCallsign;
}
function showToast(message) {
  const toast = $("toast"); toast.textContent = message; toast.style.display = "block";
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.style.display = "none", 2600);
}
function loadRatings() {
  try { lastRatings = JSON.parse(localStorage.getItem("kmiaLandingRatings") || "[]"); } catch { lastRatings = []; }
  renderRatings();
}
function renderRatings() {
  const latest = lastRatings[0];
  if (latest) {
    $("rating-callsign").textContent = latest.callsign;
    $("rating-aircraft").textContent = `${latest.aircraft} · ${latest.origin} → KMIA`;
    $("rating-score").innerHTML = `${latest.score}<small>/10</small>`;
    $("rating-note").textContent = `${latest.fpm === null ? "Touchdown rate not entered" : `${latest.fpm} FPM entered manually`} · ${latest.comment || "No comment"}`;
  }
  $("ratings-list").innerHTML = lastRatings.slice(0,3).map(r =>
    `<div class="rating-entry"><span>${escapeHtml(r.callsign)} · ${r.fpm === null ? "FPM n/a" : `${r.fpm} FPM`}</span><b>${r.score}/10</b></div>`).join("");
}
$("save-rating").addEventListener("click", () => {
  const callsign = $("rating-flight").value;
  const p = arrivals.find(a => a.callsign === callsign);
  if (!callsign) { showToast("Choose a flight first."); return; }
  const fpmText = $("fpm").value.trim();
  const fpm = fpmText === "" ? null : Number(fpmText);
  if (fpm !== null && (!Number.isFinite(fpm) || fpm < 0 || fpm > 2000)) { showToast("Enter a touchdown rate from 0 to 2000 FPM, or leave blank."); return; }
  const rating = {
    callsign, aircraft: p?.aircraft || "Unknown aircraft", origin: p?.origin || "----",
    score: Number($("score-select").value), fpm,
    comment: $("comment").value.trim(),
    timestamp: new Date().toISOString()
  };
  lastRatings.unshift(rating); lastRatings = lastRatings.slice(0, 20);
  try { localStorage.setItem("kmiaLandingRatings", JSON.stringify(lastRatings)); } catch {}
  renderRatings();
  $("fpm").value = ""; $("comment").value = "";
  showToast("Manual landing rating published on this browser.");
});
$("rating-flight").addEventListener("change", () => {
  const p = arrivals.find(a => a.callsign === $("rating-flight").value);
  if (p) {
    $("rating-callsign").textContent = p.callsign;
    $("rating-aircraft").textContent = `${p.aircraft} · ${p.origin} → KMIA`;
  }
});

async function fetchWeather() {
  try {
    const res = await fetch("https://aviationweather.gov/api/data/metar?ids=KMIA&format=json", {cache:"no-store"});
    if (!res.ok) throw new Error("Weather source unavailable");
    const data = await res.json();
    const m = Array.isArray(data) ? data[0] : data;
    if (!m) throw new Error("No METAR");
    const raw = m.rawOb || m.raw_text || m.raw || "";
    const temp = m.temp != null ? `${m.temp}°C` : "";
    const wind = m.wdir != null ? `${m.wdir === "VRB" ? "VRB" : m.wdir}°/${m.wspd ?? "?"} kt` : "";
    $("weather").textContent = [raw || "METAR available", temp, wind].filter(Boolean).join(" · ");
  } catch {
    $("weather").textContent = "METAR unavailable — check source / CORS";
  }
}
async function fetchAtis() {
  // VATSIM public data feed does not include a dependable, dedicated KMIA ATIS text field.
  // This optional public endpoint is best-effort and may be blocked by CORS or change.
  try {
    const res = await fetch("https://data.vatsim.net/v3/vatsim-data.json", {cache:"no-store"});
    const data = await res.json();
    const atis = (data.controllers || []).filter(c =>
      String(c.callsign || "").toUpperCase().startsWith("KMIA_ATIS")
    );
    if (atis.length) {
      $("atis").textContent = atis.map(c => c.callsign).join(" / ") + " online";
    } else {
      $("atis").textContent = "No KMIA ATIS station found";
    }
  } catch {
    $("atis").textContent = "ATIS status unavailable";
  }
}

// Separate clean stream page (/), private rating page (/controls), and layout editor (/layout).
const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
const isControlsPage = currentPath === "/controls";
const isLayoutPage = currentPath === "/layout";
if (isControlsPage) {
  document.body.classList.add("controls-page");
  const h = $("controls-only-header"); if (h) h.hidden = false;
  const toolbar = $("layout-toolbar"); if (toolbar) toolbar.hidden = true;
} else if (isLayoutPage) {
  document.body.classList.add("layout-page");
  const form = document.querySelector(".rating-controls"); if (form) form.hidden = true;
} else {
  document.body.classList.add("stream-page");
  // The stream stays clean; arrange panels on /layout instead.
  const toolbar = $("layout-toolbar"); if (toolbar) toolbar.hidden = true;
  const form = document.querySelector(".rating-controls"); if (form) form.hidden = true;
}

loadRatings();
fetchArrivals();
fetchWeather();
fetchAtis();
setInterval(fetchArrivals, REFRESH_MS);
setInterval(fetchWeather, 5 * 60 * 1000);
setInterval(fetchAtis, 60 * 1000);

// Overlay layout editor: drag major panels, scale them, and persist layout locally.
(function initLayoutEditor(){
  const groups = [
    {el: document.querySelector('.topbar'), key:'topbar', label:'HEADER'},
    {el: document.querySelector('.left-stack'), key:'traffic', label:'TRAFFIC'},
    {el: document.querySelector('.bottom-right'), key:'rating-weather', label:'RATING / AIRPORT'}
  ].filter(x=>x.el);
  const toggle = document.getElementById('layout-toggle');
  const controls = document.getElementById('layout-controls');
  const scale = document.getElementById('layout-scale');
  const reset = document.getElementById('layout-reset');
  if(!toggle || !controls || !scale || !reset) return;
  const defaultLayout = {
    topbar:{left:48,top:34}, traffic:{left:48,top:142}, 'rating-weather':{right:48,bottom:72}, scale:82
  };
  let saved={};
  try{saved=JSON.parse(localStorage.getItem('kmiaOverlayLayout')||'{}')}catch{}
  function apply(){
    groups.forEach(g=>{
      const p=saved[g.key]||defaultLayout[g.key];
      g.el.style.left=p.left!==undefined?p.left+'px':'';
      g.el.style.top=p.top!==undefined?p.top+'px':'';
      g.el.style.right=p.right!==undefined?p.right+'px':'';
      g.el.style.bottom=p.bottom!==undefined?p.bottom+'px':'';
      g.el.dataset.dragLabel=g.label;
    });
    const n=Number(saved.scale??defaultLayout.scale); scale.value=n;
    document.querySelector('.left-stack').style.transform=`scale(${n/100})`;
    document.querySelector('.bottom-right').style.transform=`scale(${n/100})`;
    document.querySelector('.topbar').style.transform=`scale(${n/100})`;
  }
  function persist(){try{localStorage.setItem('kmiaOverlayLayout',JSON.stringify(saved))}catch{}}
  apply();
  toggle.addEventListener('click',()=>{
    const active=document.body.classList.toggle('layout-edit');
    controls.hidden=!active;
    toggle.textContent=active?'✓ Finish arranging':'⚙ Arrange overlay';
  });
  scale.addEventListener('input',()=>{saved.scale=Number(scale.value);apply();persist()});
  reset.addEventListener('click',()=>{saved={};apply();persist()});
  groups.forEach(g=>{
    let dragging=false,startX=0,startY=0,baseX=0,baseY=0;
    g.el.addEventListener('pointerdown',e=>{
      if(!document.body.classList.contains('layout-edit')||e.target.closest('button,input,select,textarea,label'))return;
      dragging=true;startX=e.clientX;startY=e.clientY;
      const r=g.el.getBoundingClientRect();
      baseX=r.left;baseY=r.top;
      g.el.setPointerCapture?.(e.pointerId);e.preventDefault();
    });
    g.el.addEventListener('pointermove',e=>{
      if(!dragging)return;
      const ratio=(saved.scale??defaultLayout.scale)/100;
      const x=Math.max(0,Math.min(1920-g.el.offsetWidth*ratio,baseX+(e.clientX-startX)));
      const y=Math.max(0,Math.min(1080-g.el.offsetHeight*ratio,baseY+(e.clientY-startY)));
      g.el.style.left=(x/ratio)+'px';g.el.style.top=(y/ratio)+'px';g.el.style.right='auto';g.el.style.bottom='auto';
    });
    const stop=()=>{if(!dragging)return;dragging=false;const ratio=(saved.scale??defaultLayout.scale)/100;const r=g.el.getBoundingClientRect();saved[g.key]={left:Math.round(r.left/ratio),top:Math.round(r.top/ratio)};persist()};
    g.el.addEventListener('pointerup',stop);g.el.addEventListener('pointercancel',stop);
  });
})();

// Keep the stream display updated when ratings are entered on /controls in another tab/browser context.
window.addEventListener("storage", event => {
  if (event.key === "kmiaLandingRatings") { loadRatings(); }
  if (event.key === "kmiaOverlayLayout") { try { location.reload(); } catch {} }
});
