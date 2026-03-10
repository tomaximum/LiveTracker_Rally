// ─── Main Application ─────────────────────────────────────────────────────────
'use strict';

/* ── State ─────────────────────────────────────────────────────────────────── */
const state = {
    map: null,
    routePoints: [],        // [{lat,lng}] parsed from GPX
    routeLayer: null,       // Leaflet polyline
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
        browserNotif: false
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
function loadGPX(xmlText, filename) {
    try {
        const points = parseGPX(xmlText);
        if (points.length < 2) throw new Error('GPX trop court (moins de 2 points)');

        state.routePoints = points;

        // Remove old layer
        if (state.routeLayer) state.map.removeLayer(state.routeLayer);

        // Draw route with shadow effect (glow)
        const latlngs = points.map(p => [p.lat, p.lng]);

        // Glow / shadow polyline behind
        L.polyline(latlngs, {
            color: 'rgba(245,158,11,0.25)',
            weight: 10,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(state.map);

        // Main route line
        state.routeLayer = L.polyline(latlngs, {
            color: '#f59e0b',
            weight: 4,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: null
        }).addTo(state.map);

        // Start/end markers
        L.marker(latlngs[0], { icon: createWaypointIcon('🏁', '#10b981') })
            .bindTooltip('Départ', { permanent: false }).addTo(state.map);
        L.marker(latlngs[latlngs.length - 1], { icon: createWaypointIcon('🏁', '#ef4444') })
            .bindTooltip('Arrivée', { permanent: false }).addTo(state.map);

        // Fit map
        state.map.fitBounds(state.routeLayer.getBounds(), { padding: [40, 40] });

        // Update GPX drop zone
        const dropEl = document.getElementById('gpx-drop');
        dropEl.classList.add('loaded');
        dropEl.querySelector('.drop-icon').textContent = '✅';
        dropEl.querySelector('.drop-text').textContent = filename || 'Trace chargée';
        dropEl.querySelector('.drop-hint').textContent = `${points.length} points GPS`;

        // Update stats
        updateRouteStats(points);

        // If simulation running, update route
        if (state.simulation) {
            state.simulation.setRoute(points);
        }

        showToast(`Trace GPX chargée — ${points.length} pts`, 'success');

    } catch (err) {
        showToast('Erreur GPX : ' + err.message, 'error');
    }
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
    // Clear participant markers
    state.participants.forEach(p => state.map.removeLayer(p.marker));
    state.participants.clear();
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
                if (msg.type === 'participants') msg.participants.forEach(p => updateParticipant(p));
            } catch { }
        };
        state.ws.onopen = () => showToast('Connecté au serveur', 'success');
        state.ws.onerror = () => showToast('Erreur de connexion WebSocket', 'error');
        state.ws.onclose = () => {
            showToast('Déconnecté du serveur', 'warn');
            // Reconnect after 5s
            setTimeout(() => { if (state.wsUrl) connectWS(state.wsUrl); }, 5000);
        };
        state.wsUrl = url;
    } catch (err) {
        showToast('URL WebSocket invalide', 'error');
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

    document.getElementById('s-ws-url').value = state.wsUrl || '';
    document.getElementById('s-token').value = state.settings.telegramToken || '';
    document.getElementById('s-sound').checked = state.settings.soundAlert;
    document.getElementById('s-notif').checked = state.settings.browserNotif;
    document.getElementById('s-simmode').checked = state.settings.simMode;
}

function collectSettings() {
    state.settings.offRouteThresh = parseInt(document.getElementById('s-offroute').value);
    state.settings.immobileThresh = parseInt(document.getElementById('s-immobile').value);
    state.settings.telegramToken = document.getElementById('s-token').value;
    state.settings.soundAlert = document.getElementById('s-sound').checked;
    state.settings.browserNotif = document.getElementById('s-notif').checked;
    state.settings.simMode = document.getElementById('s-simmode').checked;
    const wsUrl = document.getElementById('s-ws-url').value.trim();

    if (state.alertEngine) {
        state.alertEngine.updateSettings({
            offRouteThresh: state.settings.offRouteThresh,
            immobileThresh: state.settings.immobileThresh
        });
    }
    if (wsUrl && wsUrl !== state.wsUrl) connectWS(wsUrl);
    if (state.settings.browserNotif && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    saveSettings();
    showToast('Paramètres enregistrés', 'success');
    closeModal();
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
        reader.onload = (ev) => loadGPX(ev.target.result, file.name);
        reader.readAsText(file);
    });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => loadGPX(ev.target.result, file.name);
        reader.readAsText(file);
    });

    // Settings modal
    document.getElementById('btn-settings').addEventListener('click', openModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-overlay')) closeModal();
    });
    document.getElementById('btn-modal-save').addEventListener('click', collectSettings);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);

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

function openModal() {
    applySettings();
    document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}
