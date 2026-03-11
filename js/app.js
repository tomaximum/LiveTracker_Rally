// ─── Main Application ─────────────────────────────────────────────────────────
'use strict';

/* ── State ─────────────────────────────────────────────────────────────────── */
const state = {
    map: null,
    routePoints: [],        // [{lat,lng}] merged from all loaded GPX
    waypoints: [],          // [{lat,lng,name,validationRadius,openingRadius}] merged
    routeLayer: null,       // kept for backward compat (demo GPX)
    loadedGpx: new Map(),   // gpxId -> { id, name, routePoints, waypoints, layers:[], wpLayer }
    participants: new Map(), // id → { ...data, marker, markerEl }
    focusedId: null,
    simMode: false,
    ws: null,
    wsUrl: '',
    alertEngine: null,
    simulation: null,
    alertLog: [],           // [{...alert}]
    settings: {
        offRouteThresh: 200,  // metres
        immobileThresh: 5,    // minutes
        telegramToken: '',
        simMode: true,
        soundAlert: false,
        browserNotif: false,
        showTraces: true,
        showWaypoints: true
    }
};

/* ── Settings persistence ──────────────────────────────────────────────────── */
function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem('livetrack-settings') || '{}');
        state.settings = { ...state.settings, ...s };
    } catch { }
}
function saveSettings() {
    localStorage.setItem('livetrack-settings', JSON.stringify(state.settings));
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initMap();
    initAlertEngine();
    initUI();
    applySettings();

    // Try Auto connect to local WS
    if (state.settings.wsUrl) {
        connectWS(state.settings.wsUrl);
    } else {
        // default for standalone
        connectWS('ws://127.0.0.1:3000');
    }

    // Auto-start simulation if enabled and no GPX (show demo immediately)
    if (state.settings.simMode) {
        setTimeout(() => {
            loadDemoGPX();
        }, 600);
    }
});

/* ── Map Initialization ─────────────────────────────────────────────────────── */
function initMap() {
    state.map = L.map('leaflet-map', {
        center: [46.603354, 1.888334],
        zoom: 6,
        zoomControl: true,
        attributionControl: true
    });

    const osmLayer = L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap', maxZoom: 19 }
    );

    const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: '© Esri World Imagery', maxZoom: 19 }
    );

    const topoLayer = L.tileLayer(
        'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenTopoMap', maxZoom: 17 }
    );

    osmLayer.addTo(state.map);

    state.layers = { osm: osmLayer, satellite: satelliteLayer, topo: topoLayer };
    state.activeLayer = 'osm';

    // Layer switch buttons
    document.querySelectorAll('.map-ctrl-btn[data-layer]').forEach(btn => {
        btn.addEventListener('click', () => {
            const layerKey = btn.dataset.layer;
            if (layerKey === state.activeLayer) return;
            state.map.removeLayer(state.layers[state.activeLayer]);
            state.layers[layerKey].addTo(state.map);
            state.activeLayer = layerKey;
            document.querySelectorAll('.map-ctrl-btn[data-layer]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

/* ── GPX Handling ───────────────────────────────────────────────────────────── */

function rebuildGlobalRoute() {
    state.routePoints = [];
    state.waypoints = [];
    for (const gpx of state.loadedGpx.values()) {
        state.routePoints.push(...gpx.routePoints);
        state.waypoints.push(...gpx.waypoints);
    }
    updateRouteStats(state.routePoints);
    if (state.simulation) state.simulation.setRoute(state.routePoints);
}

function loadGPX(xmlText, filename, gpxId = null) {
    try {
        const parsed = parseGPX(xmlText);
        const points = parsed.route || [];
        const waypoints = parsed.waypoints || [];
        
        if (points.length < 2 && waypoints.length === 0) throw new Error('GPX invalide ou vide');

        const id = gpxId !== null ? gpxId : Date.now();
        if (state.loadedGpx.has(id)) return; // Already loaded (avoid double-add)

        const gpxInfo = {
            id, name: filename,
            routePoints: points,
            waypoints: waypoints,
            layers: [],
            wpLayer: L.layerGroup()
        };

        if (points.length >= 2) {
            const latlngs = points.map(p => [p.lat, p.lng]);

            const shadowLayer = L.polyline(latlngs, {
                color: 'rgba(245,158,11,0.25)', weight: 10, lineCap: 'round', lineJoin: 'round'
            });
            const mainLayer = L.polyline(latlngs, {
                color: '#f59e0b', weight: 4, lineCap: 'round', lineJoin: 'round'
            });

            if (state.settings.showTraces !== false) {
                shadowLayer.addTo(state.map);
                mainLayer.addTo(state.map);
            }
            gpxInfo.layers.push(shadowLayer, mainLayer);
            state.map.fitBounds(mainLayer.getBounds(), { padding: [40, 40] });

            // Start/end markers
            L.marker(latlngs[0], { icon: createWaypointIcon('🏁', '#10b981') })
                .bindTooltip('Départ', { permanent: false }).addTo(state.map);
            L.marker(latlngs[latlngs.length - 1], { icon: createWaypointIcon('🏁', '#ef4444') })
                .bindTooltip('Arrivée', { permanent: false }).addTo(state.map);

        } else if (waypoints.length > 0) {
            const bounds = L.latLngBounds(waypoints.map(w => [w.lat, w.lng]));
            state.map.fitBounds(bounds, { padding: [40, 40] });
        }

        // Draw OpenRally waypoints
        waypoints.forEach(wp => {
            const isStartEnd = wp.name === 'ASS' || wp.name === 'DSS';
            const color = isStartEnd ? '#10b981' : '#3b82f6';
            
            L.circle([wp.lat, wp.lng], {
                color, fillColor: color, fillOpacity: 0.1, radius: wp.validationRadius, weight: 2
            }).bindTooltip(wp.name, { permanent: true, direction: 'top' }).addTo(gpxInfo.wpLayer);

            L.circle([wp.lat, wp.lng], {
                color, fillColor: 'transparent', radius: wp.openingRadius, weight: 1, dashArray: '5,5'
            }).addTo(gpxInfo.wpLayer);
        });

        if (state.settings.showWaypoints !== false) {
            gpxInfo.wpLayer.addTo(state.map);
        }

        state.loadedGpx.set(id, gpxInfo);
        rebuildGlobalRoute();

        // Update drop zone UI
        const dropEl = document.getElementById('gpx-drop');
        if (dropEl) {
            dropEl.classList.add('loaded');
            dropEl.querySelector('.drop-icon').textContent = '✅';
            dropEl.querySelector('.drop-text').textContent = filename || 'Trace chargée';
            dropEl.querySelector('.drop-hint').textContent = `${points.length} pts, ${waypoints.length} WPs`;
        }

        showToast(`${filename} chargée — ${points.length} pts, ${waypoints.length} WPs`, 'success');

    } catch (err) {
        showToast('Erreur GPX : ' + err.message, 'error');
    }
}

function unloadGPX(id) {
    const gpx = state.loadedGpx.get(id);
    if (!gpx) return;
    gpx.layers.forEach(l => state.map.removeLayer(l));
    state.map.removeLayer(gpx.wpLayer);
    state.loadedGpx.delete(id);
    rebuildGlobalRoute();
}

function updateRouteStats(points) {
    let totalDist = 0;
    let minEle = Infinity, maxEle = -Infinity;
    for (let i = 1; i < points.length; i++) {
        totalDist += haversineDistance(points[i - 1], points[i]);
        if (points[i].ele !== undefined) {
            minEle = Math.min(minEle, points[i].ele);
            maxEle = Math.max(maxEle, points[i].ele);
        }
    }
    document.getElementById('stat-dist').textContent =
        totalDist > 1000 ? (totalDist / 1000).toFixed(1) + ' km' : Math.round(totalDist) + ' m';
    document.getElementById('stat-ele').textContent =
        (minEle !== Infinity && maxEle !== -Infinity)
            ? Math.round(maxEle - minEle) + ' m'
            : '—';
}

function createWaypointIcon(emoji, color) {
    return L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:50%;border:3px solid ${color};
           background:#1a2235;display:flex;align-items:center;justify-content:center;
           font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.5)">${emoji}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

/* ── Demo GPX (Col de Turini, a classic rally route) ──────────────────────── */
function loadDemoGPX() {
    // Generate a synthetic rally-style GPX (Sisteron area)
    const startLat = 44.197, startLng = 5.937;
    const points = generateSyntheticRoute(startLat, startLng, 80, 120);
    state.routePoints = points;

    if (state.routeLayer) state.map.removeLayer(state.routeLayer);
    const latlngs = points.map(p => [p.lat, p.lng]);

    L.polyline(latlngs, { color: 'rgba(245,158,11,0.25)', weight: 10, lineCap: 'round' }).addTo(state.map);
    state.routeLayer = L.polyline(latlngs, { color: '#f59e0b', weight: 4, lineCap: 'round' }).addTo(state.map);

    L.marker(latlngs[0], { icon: createWaypointIcon('🏁', '#10b981') }).addTo(state.map);
    L.marker(latlngs[latlngs.length - 1], { icon: createWaypointIcon('🏁', '#ef4444') }).addTo(state.map);

    state.map.fitBounds(state.routeLayer.getBounds(), { padding: [60, 60] });
    updateRouteStats(points);

    const dropEl = document.getElementById('gpx-drop');
    dropEl.classList.add('loaded');
    dropEl.querySelector('.drop-icon').textContent = '🗺️';
    dropEl.querySelector('.drop-text').textContent = 'Trace démo — Alpes du Sud';
    dropEl.querySelector('.drop-hint').textContent = `${points.length} points · mode simulation`;

    // Start simulation
    startSimulation();
}

function generateSyntheticRoute(startLat, startLng, numPoints, segmentMetres) {
    const pts = [{ lat: startLat, lng: startLng, ele: 550 }];
    let lat = startLat, lng = startLng;
    let headingDeg = 45 + Math.random() * 90; // general NE direction
    let ele = 550;

    for (let i = 1; i < numPoints; i++) {
        // Random turn ±25°
        headingDeg += (Math.random() - 0.5) * 50;
        const headingRad = headingDeg * Math.PI / 180;
        const cosLat = Math.cos(lat * Math.PI / 180);
        const dLat = (segmentMetres * Math.cos(headingRad)) / 111319;
        const dLng = (segmentMetres * Math.sin(headingRad)) / (111319 * cosLat);
        lat = lat + dLat;
        lng = lng + dLng;
        ele += (Math.random() - 0.4) * 30;
        pts.push({ lat, lng, ele: Math.max(200, Math.round(ele)) });
    }
    return pts;
}

/* ── Participant Rendering ──────────────────────────────────────────────────── */
function updateParticipant(data) {
    const { id, name, lat, lng, color, avatar, displaySpeed, lastMoved, stopped } = data;

    // Check alerts
    if (state.alertEngine && state.routePoints.length > 0) {
        state.alertEngine.check(data, state.routePoints);
    }

    const status = state.alertEngine ? state.alertEngine.getWorstStatus(id) : 'ok';

    if (state.participants.has(id)) {
        // Update existing marker
        const p = state.participants.get(id);
        p.marker.setLatLng([lat, lng]);
        p.data = { ...p.data, lat, lng, displaySpeed, lastMoved, stopped, status };
        updateMarkerStyle(p, status);
    } else {
        // Create new marker
        const { marker, el } = createParticipantMarker({ id, lat, lng, color, avatar, name });
        marker.bindPopup(() => buildPopup(state.participants.get(id)?.data || data), {
            closeButton: false, className: 'p-popup'
        });
        marker.addTo(state.map);
        marker.on('click', () => focusParticipant(id));
        state.participants.set(id, {
            marker, el,
            data: { id, name, lat, lng, color, avatar, displaySpeed, lastMoved, stopped, status }
        });
    }

    renderParticipantList();
    updateStats();
}

function createParticipantMarker({ id, lat, lng, color, avatar, name }) {
    const el = document.createElement('div');
    el.className = 'p-marker-dot pulse';
    el.style.borderColor = color;
    el.style.setProperty('color', color);
    el.innerHTML = avatar;

    const icon = L.divIcon({
        className: '',
        html: el.outerHTML,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
    const marker = L.marker([lat, lng], { icon, title: name });
    return { marker, el };
}

function updateMarkerStyle(p, status) {
    const color = status === 'immobile' ? '#ef4444'
        : status === 'off_route' ? '#f59e0b'
            : p.data.color;

    const el = p.marker.getElement();
    if (el) {
        el.style.borderColor = color;
        el.style.color = color;
    }
}

function buildPopup(data) {
    if (!data) return '';
    const { name, displaySpeed, lastMoved, lat, lng, status } = data;
    const sinceMin = lastMoved ? Math.round((Date.now() - lastMoved) / 60000) : '?';
    const statusLabel = status === 'immobile' ? '🔴 Immobile'
        : status === 'off_route' ? '⚠️ Hors trace'
            : '✅ OK';
    return `<div class="popup-name">${data.avatar || '🏍️'} ${name}</div>
    <div class="popup-row"><span>Vitesse</span><span class="popup-val">${displaySpeed ?? '—'} km/h</span></div>
    <div class="popup-row"><span>Statut</span><span class="popup-val">${statusLabel}</span></div>
    <div class="popup-row"><span>Dernière MAJ</span><span class="popup-val">il y a ${sinceMin} min</span></div>
    <div class="popup-row"><span>Position</span><span class="popup-val">${lat?.toFixed(4)}, ${lng?.toFixed(4)}</span></div>`;
}

function focusParticipant(id) {
    state.focusedId = id;
    const p = state.participants.get(id);
    if (p) {
        state.map.setView([p.data.lat, p.data.lng], 14, { animate: true });
        p.marker.openPopup();
    }
    renderParticipantList();
}

/* ── Participant List UI ────────────────────────────────────────────────────── */
function renderParticipantList() {
    const container = document.getElementById('participants-list');
    const parts = [...state.participants.values()];

    if (parts.length === 0) {
        container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📡</div>
      <div>En attente de participants…<br>Activez la simulation ou connectez le bot.</div>
    </div>`;
        return;
    }

    container.innerHTML = '';
    parts.forEach(({ data, marker }) => {
        const { id, name, avatar, color, displaySpeed, lastMoved, status } = data;
        const sinceMin = lastMoved ? Math.round((Date.now() - lastMoved) / 60000) : '?';
        const statusLabel = status === 'immobile' ? '🔴 Immobile'
            : status === 'off_route' ? '⚠️ Hors trace'
                : '✅ En route';
        const statusClass = status === 'immobile' ? 'immobile'
            : status === 'off_route' ? 'off-route'
                : 'ok';

        const card = document.createElement('div');
        card.className = `participant-card${state.focusedId === id ? ' focused' : ''}${status !== 'ok' ? ' alert-' + status : ''}`;
        card.innerHTML = `
      <div class="p-avatar" style="background:${color}22;border-color:${color}">
        ${avatar || '🏍️'}
      </div>
      <div class="p-info">
        <div class="p-name">${name}</div>
        <div class="p-meta">
          <span class="p-speed">${displaySpeed ?? '—'} km/h</span>
          <span class="p-time">MAJ ${sinceMin}min</span>
        </div>
      </div>
      <div class="p-status ${statusClass}">${statusLabel}</div>`;
        card.addEventListener('click', () => focusParticipant(id));
        container.appendChild(card);
    });
}

/* ── Stats ──────────────────────────────────────────────────────────────────── */
function updateStats() {
    const parts = [...state.participants.values()];
    document.getElementById('stat-pilots').textContent = parts.length;

    const alertCount = parts.filter(p => p.data.status !== 'ok').length;
    document.getElementById('stat-alerts').textContent = alertCount;

    // Alert badge
    const badge = document.getElementById('alert-badge');
    if (alertCount > 0) { badge.style.display = 'inline'; badge.textContent = alertCount; }
    else badge.style.display = 'none';
}

/* ── Alert Engine ────────────────────────────────────────────────────────────── */
function initAlertEngine() {
    state.alertEngine = new AlertEngine({
        offRouteThresh: state.settings.offRouteThresh,
        immobileThresh: state.settings.immobileThresh
    });

    state.alertEngine.onAlert = (alert) => {
        addAlertToLog(alert);
        showToast(alert.message, alert.type === AlertType.IMMOBILE ? 'error' : 'warn');
        if (state.settings.soundAlert) playAlertSound();
        if (state.settings.browserNotif) sendBrowserNotif(alert.message);
    };

    state.alertEngine.onResolve = (alert) => {
        addAlertToLog(alert);
    };
}

function addAlertToLog(alert) {
    state.alertLog.unshift(alert);
    if (state.alertLog.length > 50) state.alertLog.pop();
    renderAlertList();
}

function renderAlertList() {
    const list = document.getElementById('alerts-list');
    if (state.alertLog.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:10px 0"><div>Aucune alerte</div></div>';
        return;
    }
    list.innerHTML = state.alertLog.slice(0, 15).map(a => {
        const t = new Date(a.ts);
        const ts = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `<div class="alert-item type-${a.type}">
      <div class="alert-ts">${ts}</div>
      <div>${a.message}</div>
    </div>`;
    }).join('');
}

/* ── Simulation ─────────────────────────────────────────────────────────────── */
function startSimulation() {
    if (state.simulation) { state.simulation.stop(); }
    state.simulation = new SimulationEngine();

    if (state.routePoints.length > 0) {
        state.simulation.setRoute(state.routePoints);
    }

    state.simulation.onUpdate = (participants) => {
        participants.forEach(p => updateParticipant(p));
    };

    state.simulation.start();
    document.getElementById('sim-badge').classList.add('visible');
    document.getElementById('btn-sim').classList.add('active');
}

function stopSimulation() {
    if (state.simulation) {
        state.simulation.stop();
        state.simulation = null;
    }
    // Clear participant markers and alerts
    state.participants.forEach(p => state.map.removeLayer(p.marker));
    state.participants.clear();
    state.alertLog = [];
    if (state.alertEngine && typeof state.alertEngine.clearAll === 'function') {
        state.alertEngine.clearAll();
    }
    renderAlertList();
    renderParticipantList();
    document.getElementById('sim-badge').classList.remove('visible');
    document.getElementById('btn-sim').classList.remove('active');
}

/* ── WebSocket (Live mode) ──────────────────────────────────────────────────── */
function connectWS(url) {
    if (state.ws) { state.ws.close(); state.ws = null; }
    try {
        state.ws = new WebSocket(url);
        state.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'position') updateParticipant(msg.participant);
                if (msg.type === 'participants' || msg.type === 'init') {
                    msg.participants.forEach(p => updateParticipant(p));
                }
                if (msg.type === 'participant_added') updateParticipant(msg.participant);
            } catch { }
        };
        state.ws.onopen = () => {
            showToast('Connecté au serveur', 'success');
            state.wsUrl = url;
        };
        state.ws.onerror = () => { };
        state.ws.onclose = () => {
            // Reconnect after 5s silently
            setTimeout(() => { if (state.wsUrl) connectWS(state.wsUrl); }, 5000);
        };
    } catch (err) {
        // silent
    }
}

/* ── Toast ──────────────────────────────────────────────────────────────────── */
function showToast(msg, type = 'success', subMsg = '') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
    el.innerHTML = `<div class="toast-msg">${msg}</div>${subMsg ? `<div class="toast-sub">${subMsg}</div>` : ''}`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 4000);
}

/* ── Sound & Browser Notifications ─────────────────────────────────────────── */
function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch { }
}

function sendBrowserNotif(msg) {
    if (Notification.permission === 'granted') {
        new Notification('🚨 LiveTrack Rally', { body: msg, icon: '' });
    }
}

/* ── Settings ───────────────────────────────────────────────────────────────── */
function applySettings() {
    // Sliders
    const orSlider = document.getElementById('s-offroute');
    const immSlider = document.getElementById('s-immobile');
    orSlider.value = state.settings.offRouteThresh;
    immSlider.value = state.settings.immobileThresh;
    document.getElementById('s-offroute-val').textContent = state.settings.offRouteThresh + ' m';
    document.getElementById('s-immobile-val').textContent = state.settings.immobileThresh + ' min';

    document.getElementById('s-sound').checked = state.settings.soundAlert;
    document.getElementById('s-notif').checked = state.settings.browserNotif;
    document.getElementById('s-simmode').checked = state.settings.simMode;
}

function collectSettings() {
    state.settings.offRouteThresh = parseInt(document.getElementById('s-offroute').value);
    state.settings.immobileThresh = parseInt(document.getElementById('s-immobile').value);
    state.settings.soundAlert = document.getElementById('s-sound').checked;
    state.settings.browserNotif = document.getElementById('s-notif').checked;
    state.settings.simMode = document.getElementById('s-simmode').checked;

    if (state.alertEngine) {
        state.alertEngine.updateSettings({
            offRouteThresh: state.settings.offRouteThresh,
            immobileThresh: state.settings.immobileThresh
        });
    }
    if (state.settings.browserNotif && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    saveSettings();
    showToast('Paramètres enregistrés', 'success');
    closeSettingsModal();
}

/* ── UI Event Setup ─────────────────────────────────────────────────────────── */
function initUI() {
    // GPX drop zone
    const dropZone = document.getElementById('gpx-drop');
    const fileInput = document.getElementById('gpx-file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { uploadGPX(file.name, ev.target.result); };
        reader.readAsText(file);
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { uploadGPX(file.name, ev.target.result); };
        reader.readAsText(file);
    });

    // Trace / Waypoint toggles
    const tTraces = document.getElementById('toggle-traces');
    if(tTraces) tTraces.addEventListener('change', (e) => {
        state.settings.showTraces = e.target.checked;
        for (const gpx of state.loadedGpx.values()) {
            gpx.layers.forEach(l => {
                if (e.target.checked) state.map.addLayer(l);
                else state.map.removeLayer(l);
            });
        }
    });
    const tWps = document.getElementById('toggle-waypoints');
    if(tWps) tWps.addEventListener('change', (e) => {
        state.settings.showWaypoints = e.target.checked;
        for (const gpx of state.loadedGpx.values()) {
            if (e.target.checked) state.map.addLayer(gpx.wpLayer);
            else state.map.removeLayer(gpx.wpLayer);
        }
    });

    fetchGPXLibrary();

    // Settings modal
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-overlay')) closeSettingsModal();
    });
    document.getElementById('btn-modal-save').addEventListener('click', collectSettings);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeSettingsModal);

    // Participants modal
    document.getElementById('btn-add-pilot').addEventListener('click', openPilotsModal);
    document.getElementById('modal-pilots-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-pilots-overlay')) closePilotsModal();
    });
    document.getElementById('btn-pilots-close').addEventListener('click', closePilotsModal);

    // Add manual pilot
    document.getElementById('btn-save-pilot').addEventListener('click', () => {
        const name = document.getElementById('new-pilot-name').value.trim();
        const avatar = document.getElementById('new-pilot-icon').value;
        if (!name) return;

        // Pick random color
        const colors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#14b8a6"];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const id = 'manual_' + Date.now();
        // Assuming initial location near trace or center
        let lat = state.map.getCenter().lat;
        let lng = state.map.getCenter().lng;
        if (state.routePoints.length > 0) {
            lat = state.routePoints[0].lat;
            lng = state.routePoints[0].lng;
        }

        const p = { id, name, lat, lng, avatar, color, source: 'manual' };
        updateParticipant(p);

        // Broadcast to server if connected
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'add_participant', participant: p }));
        }

        document.getElementById('new-pilot-name').value = '';
        showToast(`Pilote ${name} ajouté`);
    });

    // Simulation toggle
    document.getElementById('btn-sim').addEventListener('click', () => {
        if (state.simulation) {
            stopSimulation();
        } else {
            state.settings.simMode = true;
            loadDemoGPX();
        }
    });

    // Center on route
    document.getElementById('btn-fit').addEventListener('click', () => {
        if (state.routeLayer) state.map.fitBounds(state.routeLayer.getBounds(), { padding: [40, 40] });
    });

    // Slider live update
    document.getElementById('s-offroute').addEventListener('input', (e) => {
        document.getElementById('s-offroute-val').textContent = e.target.value + ' m';
    });
    document.getElementById('s-immobile').addEventListener('input', (e) => {
        document.getElementById('s-immobile-val').textContent = e.target.value + ' min';
    });

    // Refresh participant list periodically (time since last update)
    setInterval(renderParticipantList, 30000);
    renderAlertList();
}

function openSettingsModal() {
    applySettings();
    document.getElementById('modal-overlay').classList.add('open');
}
function closeSettingsModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}

/* ── Telegram Bot Fetching & QR Logic ───────────────────────────────────────── */
let qrCode = null;

async function openPilotsModal() {
    document.getElementById('modal-pilots-overlay').classList.add('open');

    // Try to generate QR code if we have a token or the server is running
    if (state.settings.telegramToken) {
        fetchBotInfo(state.settings.telegramToken);
    } else {
        // Try via API endpoint if standalone app
        try {
            const res = await fetch('/api/token');
            const data = await res.json();
            if (data.token) {
                fetchBotInfo(data.token);
                return;
            }
        } catch (e) { }

        document.getElementById('qr-placeholder').style.display = 'flex';
        document.getElementById('qr-placeholder').textContent = 'Assurez-vous d\'avoir configuré le fichier telegram_token.txt avec le token.';
    }
}

async function fetchBotInfo(token) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (data.ok && data.result.username) {
            const link = `https://t.me/${data.result.username}`;

            document.getElementById('qr-code-img').style.display = 'none';
            document.getElementById('qr-placeholder').style.display = 'none';

            const box = document.getElementById('qr-code-box');
            box.innerHTML = '';
            qrCode = new QRCode(box, {
                text: link,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            console.error("fetchBotInfo logic failed. Telegram API response:", data);
            throw new Error();
        }
    } catch (e) {
        console.error("fetchBotInfo Error:", e);
        document.getElementById('qr-placeholder').style.display = 'flex';
        document.getElementById('qr-placeholder').textContent = 'Token invalide ou erreur réseau.';
    }
}

function closePilotsModal() {
    document.getElementById('modal-pilots-overlay').classList.remove('open');
}

/* ── GPX Library API ────────────────────────────────────────────────────────── */
async function fetchGPXLibrary() {
    try {
        const res = await fetch('/api/gpx');
        const list = await res.json();
        const container = document.getElementById('gpx-library-list');
        if (!container) return;
        if (list.length === 0) {
            container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">Aucune trace sauvée</div>';
            return;
        }
        container.innerHTML = list.map(g => {
            const isLoaded = state.loadedGpx.has(g.id);
            return `<label style="display:flex;align-items:center;gap:6px;padding:4px 6px;font-size:12px;border-bottom:1px solid var(--border);cursor:pointer;">
                <input type="checkbox" onchange="window.toggleLibraryGPX(${g.id}, this.checked)" ${isLoaded ? 'checked' : ''}>
                🗺️ ${g.name}
            </label>`;
        }).join('');
    } catch(e) {}
}

window.toggleLibraryGPX = async function(id, checked) {
    if (checked) {
        await loadGPXFromServer(id);
    } else {
        unloadGPX(id);
    }
    fetchGPXLibrary();
}

async function loadGPXFromServer(id) {
    try {
        const res = await fetch('/api/gpx/' + id);
        if (res.ok) {
            const data = await res.json();
            loadGPX(data.data, data.name, id);
        }
    } catch(e) {}
}

function uploadGPX(name, data) {
    fetch('/api/gpx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, data })
    })
    .then(res => res.json())
    .then(resData => {
        loadGPX(data, name, resData.id);
        fetchGPXLibrary();
    })
    .catch(console.error);
}
