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
        offRouteThresh: 100,
        immobileThresh: 5,
        logInterval: 10,
        soundAlert: true,
        browserNotif: false,
        simMode: false,
        showRadii: true,
        showTraces: true,
        showWaypoints: true,
        showPilotTraces: true
    },
    renderListTimeout: null
};

// Automated test helper
if (new URLSearchParams(window.location.search).get('test') === 'true') {
    window.isAutomatedTest = true;
    console.log("Automated test mode ENABLED");
}

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
            
            const wpLabel = `${wp.name}${wp.type ? ' [' + wp.type + ']' : ''}`;
            console.log("Rendering WP:", wpLabel, "Type:", wp.type);

            // Validation Circle (Physical boundary)
            const validationCircle = L.circle([wp.lat, wp.lng], {
                color, fillColor: color, fillOpacity: 0.1, radius: wp.validationRadius, weight: 2
            }).bindTooltip(wpLabel, { permanent: true, direction: 'top' });

            // Opening Circle (Visibility boundary)
            const openingCircle = L.circle([wp.lat, wp.lng], {
                color, fillColor: 'transparent', dashArray: '5, 10', radius: wp.openingRadius, weight: 1, interactive: false
            });

            if (state.settings.showWaypoints !== false) {
                validationCircle.addTo(gpxInfo.wpLayer);
                openingCircle.addTo(gpxInfo.wpLayer);
            }
            
            gpxInfo.layers.push(validationCircle, openingCircle);
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
    const { id, name, lat, lng, color, avatar, lastMoved, stopped } = data;
    let { displaySpeed, history, hidden } = data;

    // Load existing participant data if available
    const existingP = state.participants.get(id);
    if (existingP) {
        history = history || existingP.data.history || [];
        hidden = (hidden !== undefined) ? hidden : (existingP.data.hidden !== undefined ? existingP.data.hidden : false);
    } else {
        history = history || [];
        hidden = (hidden !== undefined) ? hidden : false;
    }

    // Update history
    const now = Date.now();
    const lastPoint = history.length > 0 ? history[history.length - 1] : null;
    
    // Only add to history if moved significantly or first point
    if (!lastPoint || haversineDistance(lastPoint, { lat, lng }) > 2) {
        history.push({ lat, lng, ts: now });
        if (history.length > 100) history.shift(); // Limit history size
    }

    // Calculate speed if missing and we have enough history
    if (displaySpeed === undefined || displaySpeed === null) {
        if (history.length >= 2) {
            const p1 = history[history.length - 2];
            const p2 = history[history.length - 1];
            const dist = haversineDistance(p1, p2);
            const timeDiff = (p2.ts - p1.ts) / 1000; // seconds
            if (timeDiff > 0) {
                displaySpeed = Math.round((dist / timeDiff) * 3.6);
            } else {
                displaySpeed = 0;
            }
        } else {
            displaySpeed = 0;
        }
    }

    const participantData = { 
        ...data, 
        lat, lng, 
        displaySpeed, 
        lastMoved: lastMoved || now, 
        stopped, 
        history, 
        hidden 
    };

    // Check alerts
    if (state.alertEngine && state.routePoints.length > 0) {
        state.alertEngine.check(participantData, state.routePoints);
    }

    const status = state.alertEngine ? state.alertEngine.getWorstStatus(id) : 'ok';
    participantData.status = status;

    if (existingP) {
        // Update existing marker
        existingP.data = participantData;
        
        if (hidden) {
            if (state.map.hasLayer(existingP.marker)) state.map.removeLayer(existingP.marker);
            if (existingP.trail && state.map.hasLayer(existingP.trail)) state.map.removeLayer(existingP.trail);
        } else {
            existingP.marker.setLatLng([lat, lng]);
            if (!state.map.hasLayer(existingP.marker)) existingP.marker.addTo(state.map);
            updateMarkerStyle(existingP, status);
        }
    } else {
        // Create new marker
        const { marker, el } = createParticipantMarker({ id, lat, lng, color, avatar, name });
        marker.bindPopup(() => buildPopup(state.participants.get(id)?.data || participantData), {
            closeButton: false, className: 'p-popup'
        });
        
        if (!hidden) marker.addTo(state.map);
        
        marker.on('click', () => focusParticipant(id));
        state.participants.set(id, {
            marker, el,
            data: participantData
        });
    }

    // Performance: Throttle re-rendering the list
    if (!state.renderListTimeout) {
        state.renderListTimeout = setTimeout(() => {
            renderParticipantList();
            updateStats();
            updatePilotTraces();
            state.renderListTimeout = null;
        }, 1000); // Max once per second
    }
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
        const { id, name, avatar, color, displaySpeed, lastMoved, status, hidden } = data;
        const sinceMin = lastMoved ? Math.round((Date.now() - lastMoved) / 60000) : '?';
        const statusLabel = status === 'immobile' ? '🔴 Immobile'
            : status === 'off_route' ? '⚠️ Hors trace'
                : '✅ En route';
        const statusClass = status === 'immobile' ? 'immobile'
            : status === 'off_route' ? 'off-route'
                : 'ok';

        const card = document.createElement('div');
        card.className = `participant-card${state.focusedId === id ? ' focused' : ''}${status !== 'ok' ? ' alert-' + status : ''}${hidden ? ' hidden-pilot' : ''}`;
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
      <div class="p-status ${statusClass}">${statusLabel}</div>
      <div class="p-actions">
        <button class="btn-icon-v" onclick="event.stopPropagation(); window.toggleParticipantVisibility('${id}')" title="${hidden ? 'Afficher' : 'Masquer'}">${hidden ? '👁️‍🗨️' : '👁️'}</button>
        <button class="btn-icon-del-pilot" onclick="event.stopPropagation(); window.confirmDeletePilot('${id}', '${name.replace(/'/g, "\\'")}')" title="Supprimer ce pilote">🗑️</button>
      </div>`;
        card.addEventListener('click', () => focusParticipant(id));
        container.appendChild(card);
    });
}

window.toggleParticipantVisibility = function(id) {
    const p = state.participants.get(id);
    if (p) {
        p.data.hidden = !p.data.hidden;
        updateParticipant(p.data);
    }
};

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
    updateStats();
    document.getElementById('sim-badge').classList.remove('visible');
    document.getElementById('btn-sim').classList.remove('active');
}

/* ── WebSocket (Live mode) ──────────────────────────────────────────────────── */
function connectWS(url) {
    if (state.ws) { state.ws.close(); state.ws = null; }
    console.log('[WS] Tentative de connexion à :', url);
    try {
        state.ws = new WebSocket(url);
        state.ws.onmessage = (e) => {
            console.log('[WS] Message reçu :', e.data);
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'position') {
                    console.log('[WS] Position reçue pour :', msg.participant.name);
                    updateParticipant(msg.participant);
                }
                if (msg.type === 'participants' || msg.type === 'init') {
                    console.log('[WS] Init avec', msg.participants.length, 'participants');
                    msg.participants.forEach(p => updateParticipant(p));
                }
                if (msg.type === 'participant_added') {
                    console.log('[WS] Participante ajouté :', msg.participant.name);
                    updateParticipant(msg.participant);
                }
            } catch (err) {
                console.error('[WS] Erreur parsing message :', err);
            }
        };
        state.ws.onopen = () => {
            console.log('[WS] Connecté !');
            showToast('Connecté au serveur', 'success');
            state.wsUrl = url;
        };
        state.ws.onerror = (err) => { 
            console.error('[WS] Erreur WebSocket :', err);
        };
        state.ws.onclose = () => {
            console.warn('[WS] Connexion fermée. Reconnexion dans 5s...');
            // Reconnect after 5s silently
            setTimeout(() => { if (state.wsUrl) connectWS(state.wsUrl); }, 5000);
        };
    } catch (err) {
        console.error('[WS] Erreur lors de la création du WebSocket :', err);
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
    const logSlider = document.getElementById('s-log-interval');
    if (logSlider) {
        logSlider.value = state.settings.logInterval || 10;
        document.getElementById('s-log-interval-val').textContent = logSlider.value + ' s';
        logSlider.oninput = () => { document.getElementById('s-log-interval-val').textContent = logSlider.value + ' s'; };
    }

    document.getElementById('s-sound').checked = state.settings.soundAlert;
    document.getElementById('s-notif').checked = state.settings.browserNotif;
    document.getElementById('s-simmode').checked = state.settings.simMode;
    document.getElementById('s-show-radii').checked = state.settings.showRadii !== false;
}

function collectSettings() {
    state.settings.offRouteThresh = parseInt(document.getElementById('s-offroute').value);
    state.settings.immobileThresh = parseInt(document.getElementById('s-immobile').value);
    state.settings.logInterval = parseInt(document.getElementById('s-log-interval').value);
    state.settings.soundAlert = document.getElementById('s-sound').checked;
    state.settings.browserNotif = document.getElementById('s-notif').checked;
    state.settings.simMode = document.getElementById('s-simmode').checked;
    state.settings.showRadii = document.getElementById('s-show-radii').checked;

    if (state.alertEngine) {
        state.alertEngine.updateSettings({
            offRouteThresh: state.settings.offRouteThresh,
            immobileThresh: state.settings.immobileThresh
        });
    }
    
    // Send settings to server
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            immobile_threshold: state.settings.immobileThresh,
            log_interval: state.settings.logInterval
        })
    }).catch(console.error);

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

    // Sidebar toggles
    document.getElementById('toggle-traces').onchange = (e) => {
        state.loadedGpx.forEach(g => {
            g.layers.forEach(l => {
                if (e.target.checked) l.addTo(state.map);
                else state.map.removeLayer(l);
            });
        });
    };
    document.getElementById('toggle-waypoints').onchange = (e) => {
        state.loadedGpx.forEach(g => {
            if (e.target.checked) g.wpLayer.addTo(state.map);
            else state.map.removeLayer(g.wpLayer);
        });
    };
    document.getElementById('toggle-radii').onchange = (e) => {
        state.settings.showRadii = e.target.checked;
        state.loadedGpx.forEach(g => {
            g.layers.forEach(l => {
                if (l instanceof L.Circle && l.options.dashArray === '5,5') {
                    if (e.target.checked) l.addTo(g.wpLayer);
                    else g.wpLayer.removeLayer(l);
                }
            });
        });
    };
    document.getElementById('toggle-pilot-traces').onchange = (e) => {
        state.settings.showPilotTraces = e.target.checked;
        updatePilotTraces();
    };

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
    const tRadii = document.getElementById('toggle-radii');
    if(tRadii) tRadii.addEventListener('change', (e) => {
        state.settings.showRadii = e.target.checked;
        for (const gpx of state.loadedGpx.values()) {
            gpx.layers.forEach(l => {
                if (l instanceof L.Circle) {
                    if (e.target.checked && state.settings.showWaypoints) state.map.addLayer(l);
                    else state.map.removeLayer(l);
                }
            });
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
    const offrouteSlider = document.getElementById('s-offroute');
    if (offrouteSlider) {
        offrouteSlider.addEventListener('input', (e) => {
            const valEl = document.getElementById('s-offroute-val');
            if (valEl) valEl.textContent = e.target.value + ' m';
        });
    }

    const immobileSlider = document.getElementById('s-immobile');
    if (immobileSlider) {
        immobileSlider.addEventListener('input', (e) => {
            const valEl = document.getElementById('s-immobile-val');
            if (valEl) valEl.textContent = e.target.value + ' min';
        });
    }

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
            return `<div class="gpx-item">
                <input type="checkbox" onchange="window.toggleLibraryGPX('${g.id}', this.checked)" ${isLoaded ? 'checked' : ''}>
                <span class="gpx-name" title="Cliquez pour centrer" onclick="window.centerOnGPX('${g.id}')">🗺️ ${g.name}</span>
                <button class="btn-icon-del" onclick="window.confirmDeleteGPX('${g.id}', '${g.name.replace(/'/g, "\\'")}')" title="Supprimer définitivement">🗑️</button>
            </div>`;
        }).join('');
    } catch(e) {}
}

window.centerOnGPX = function(id) {
    const gpx = state.loadedGpx.get(parseInt(id) || id);
    if (gpx) {
        const bounds = L.latLngBounds([]);
        gpx.layers.forEach(l => {
            if (l.getBounds) bounds.extend(l.getBounds());
            else if (l.getLatLng) bounds.extend(l.getLatLng());
        });
        if (bounds.isValid()) {
            state.map.fitBounds(bounds, { padding: [40, 40] });
        }
    } else {
        showToast('Chargez d\'abord la trace pour centrer', 'info');
    }
}

window.toggleLibraryGPX = async function(id, checked) {
    if (checked) {
        await loadGPXFromServer(id);
    } else {
        unloadGPX(parseInt(id));
    }
    fetchGPXLibrary();
}

window.confirmDeleteGPX = function(id, name) {
    // Check if we are in an automated test environment
    if (window.isAutomatedTest || confirm(`Supprimer définitivement la trace "${name}" ?`)) {
        deleteGPXFromServer(id);
    }
}

async function deleteGPXFromServer(id) {
    try {
        const res = await fetch('/api/gpx/' + id, { method: 'DELETE' });
        if (res.ok) {
            unloadGPX(parseInt(id));
            fetchGPXLibrary();
            showToast('Trace supprimée', 'success');
        }
    } catch(e) { showToast('Erreur suppression', 'error'); }
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

window.confirmDeletePilot = function(id, name) {
    if (window.isAutomatedTest || confirm(`Supprimer le pilote "${name}" de cette session ?`)) {
        console.log("ConfirmPilotDelete for:", id);
        deleteParticipantFromServer(id.toString());
    }
}

async function deleteParticipantFromServer(id) {
    try {
        console.log("Deleting participant from server or local:", id);
        const res = await fetch('/api/participants/' + id, { method: 'DELETE' });
        if (res.ok || res.status === 404) {
            // Remove locally even if 404 (might be a simulation pilot)
            console.log(res.ok ? "Server deletion OK" : "Pilot not on server (404), removing locally");
            removeParticipant(id);
            if (state.simulation) {
                // Also remove from simulation engine if applicable
                state.simulation.participants = state.simulation.participants.filter(p => p.id !== id);
            }
            showToast('Pilote supprimé', 'success');
        } else {
            console.error("Deletion failed for:", id, "Status:", res.status);
            showToast('Erreur suppression', 'error');
        }
    } catch(e) { 
        console.error("Delete pilot error:", e);
        showToast('Erreur suppression', 'error'); 
    }
}

function removeParticipant(id) {
    const p = state.participants.get(id);
    if (p) {
        state.map.removeLayer(p.marker);
        if (p.trail) state.map.removeLayer(p.trail);
        state.participants.delete(id);
        renderParticipantList();
        updateStats();
    }
}

function updatePilotTraces() {
    if (!state.settings || !state.settings.showPilotTraces) {
        state.participants.forEach(p => {
            if (p.trail) { state.map.removeLayer(p.trail); p.trail = null; }
        });
        return;
    }
    
    state.participants.forEach((p, id) => {
        if (p.data.history && p.data.history.length > 1) {
            const latlngs = p.data.history.map(h => [h.lat, h.lng]);
            if (!p.trail) {
                p.trail = L.polyline(latlngs, {
                    color: p.data.color || '#3b82f6', weight: 2, opacity: 0.6, dashArray: '5, 5'
                }).addTo(state.map);
            } else {
                p.trail.setLatLngs(latlngs);
            }
        }
    });
}
