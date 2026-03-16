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
    alertEngine: null,
    alertLog: [],           // [{...alert}]
    settings: {
        offRouteThresh: 100,
        immobileThresh: 5,
        logInterval: 10,
        soundAlert: true,
        browserNotif: false,
        showRadii: true,
        showTraces: true,
        showWaypoints: true,
        showPilotTraces: true,
        telegramToken: ''
    },
    telegramClient: null,
    renderListTimeout: null,
    isSharing: false,
    watchId: null,
    myId: 'browser_' + Date.now()
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


    // Start Telegram Client if token exists (Autonomous Mode)
    if (state.settings.telegramToken) {
        initTelegramClient(state.settings.telegramToken);
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
}

function updateRouteStats(route) {
    let dist = 0, eleGain = 0;
    if (route && route.length > 1) {
        for (let i = 1; i < route.length; i++) {
            if (typeof haversineDistance === 'function') {
                dist += haversineDistance(route[i-1], route[i]);
            }
            if (route[i].ele !== undefined && route[i-1].ele !== undefined) {
                const diff = route[i].ele - route[i-1].ele;
                if (diff > 0) eleGain += diff;
            }
        }
    }
    const dEl = document.getElementById('stat-dist');
    const eEl = document.getElementById('stat-ele');
    if (dEl) dEl.textContent = dist < 2 ? (dist*1000).toFixed(0) + ' m' : dist.toFixed(1) + ' km';
    if (eEl) eEl.textContent = eleGain.toFixed(0) + ' m';
}

function loadGPX(xmlText, name, id) {
    try {
        if (!state.map) { console.error('Map is null'); return; }
        
        const existing = state.loadedGpx.get(id) || state.loadedGpx.get(parseInt(id));
        if (existing) unloadGPX(id);
        
        const parsed = parseGPX(xmlText);
        console.log(`[GPX] Loaded ${name} (${parsed.route.length} pts, ${parsed.waypoints.length} wps)`);

        const latlngs = parsed.route.map(p => [p.lat, p.lng]);
        const routeLayer = L.polyline(latlngs, {
            color: '#3b82f6', weight: 4, opacity: 0.8
        }).addTo(state.map);

        const wpLayer = L.layerGroup().addTo(state.map);
        parsed.waypoints.forEach((wp, idx) => {
            const marker = L.circle([wp.lat, wp.lng], {
                radius: wp.validationRadius || 200,
                color: '#10b981', fill: false, dashArray: '5,5'
            }).addTo(wpLayer);
            
            let popupContent = `<b>#${idx + 1} ${wp.name}</b>`;
            if (wp.type) popupContent += `<br>${wp.type}`;
            if (wp.km) popupContent += `<br>${wp.km}`;
            
            marker.bindTooltip(popupContent, { permanent: true, direction: 'top', className: 'wp-label' });
        });

        state.loadedGpx.set(id, {
            id, name,
            routePoints: parsed.route,
            waypoints: parsed.waypoints,
            layers: [routeLayer],
            wpLayer: wpLayer,
            color: '#3b82f6',
            visible: true
        });

        rebuildGlobalRoute();
        
        if (typeof centerOnGPX === 'function') {
            centerOnGPX(id);
        } else if (routeLayer.getBounds) {
            state.map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
        }
        
        if (typeof fetchGPXLibrary === 'function') fetchGPXLibrary();
        showToast(`Trace "${name}" chargée`);
    } catch (e) {
        console.error('[GPX] Error loading:', e);
        showToast('Erreur chargement GPX', 'error');
    }
}

function unloadGPX(id) {
    const gpx = state.loadedGpx.get(id);
    if (gpx) {
        if (gpx.layers) gpx.layers.forEach(l => { if (state.map && state.map.hasLayer(l)) state.map.removeLayer(l); });
        if (gpx.wpLayer && state.map && state.map.hasLayer(gpx.wpLayer)) state.map.removeLayer(gpx.wpLayer);
        state.loadedGpx.delete(id);
        rebuildGlobalRoute();
        if (typeof fetchGPXLibrary === 'function') fetchGPXLibrary();
    }
}
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
    if (!lastPoint || haversineDistance(lastPoint, { lat, lng }) > 1) { // Reduced threshold slightly for smoother lines
        history.push({ lat, lng, ts: now });
        if (history.length > 5000) history.shift(); // Increased to 5000 points
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
    const sinceMinMove = lastMoved ? Math.round((Date.now() - lastMoved) / 60000) : '?';
    const lastUpdate = data.lastUpdate || lastMoved;
    const sinceMinUpdate = lastUpdate ? Math.round((Date.now() - lastUpdate) / 60000) : '?';
    
    const statusLabel = status === 'immobile' ? '🔴 Immobile'
        : status === 'off_route' ? '⚠️ Hors trace'
            : '✅ OK';
            
    return `<div class="popup-name">${data.avatar || '🏍️'} ${name}</div>
    <div class="popup-row"><span>Vitesse</span><span class="popup-val">${displaySpeed ?? '—'} km/h</span></div>
    <div class="popup-row"><span>Statut</span><span class="popup-val">${statusLabel}</span></div>
    <div class="popup-row"><span>Mouvement</span><span class="popup-val">il y a ${sinceMinMove} min</span></div>
    <div class="popup-row"><span>Connexion</span><span class="popup-val">il y a ${sinceMinUpdate} min</span></div>
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
        const sinceMinMove = lastMoved ? Math.round((Date.now() - lastMoved) / 60000) : '?';
        const lastUpdate = data.lastUpdate || lastMoved;
        const sinceMinUpdate = lastUpdate ? Math.round((Date.now() - lastUpdate) / 60000) : '?';

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
          <span class="p-time" title="Mouvement / Connexion">⏳ ${sinceMinMove}m / 📡 ${sinceMinUpdate}m</span>
        </div>
      </div>
      <div class="p-status ${statusClass}">${statusLabel}</div>
      <div class="p-actions">
        <button class="btn-icon-v" onclick="event.stopPropagation(); window.toggleParticipantVisibility('${id}')" title="${hidden ? 'Afficher' : 'Masquer'}">${hidden ? '👁️‍🗨️' : '👁️'}</button>
        <button class="btn-icon-v" onclick="event.stopPropagation(); window.renameParticipant('${id}', '${name.replace(/'/g, "\\'")}')" title="Renommer">✏️</button>
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

window.renameParticipant = function(id, name) {
    const newName = prompt('Nouveau nom pour le pilote :', name);
    if (newName && newName.trim() !== '') {
        const p = state.participants.get(id);
        if (p) {
            p.data.name = newName.trim();
            // Rebuild popup content
            if (p.marker) {
                p.marker.bindPopup(() => buildPopup(p.data), {
                    closeButton: false, className: 'p-popup'
                });
            }
            if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ type: 'rename_participant', id: id, name: newName.trim() }));
            }
            renderParticipantList();
            showToast(`Pilote renommé en ${newName.trim()}`);
        }
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
    const badge = document.getElementById('sim-badge');
    if (badge) badge.classList.add('visible');
    
    const btn = document.getElementById('btn-sim');
    if (btn) btn.classList.add('active');
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
    
    const badge = document.getElementById('sim-badge');
    if (badge) badge.classList.remove('visible');
    
    const btn = document.getElementById('btn-sim');
    if (btn) btn.classList.remove('active');
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
        // Silencieusement ignorer les erreurs WebSocket en mode autonome (sans serveur PC)
    }
}

/* ── Telegram Client (Autonomous) ─────────────────────────────────────────── */
function initTelegramClient(token) {
    if (state.telegramClient) state.telegramClient.stop();
    
    state.telegramClient = new TelegramClient(token, (participant) => {
        updateParticipant(participant);
    });
    
    state.telegramClient.start();
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
    
    if (orSlider) {
        orSlider.value = state.settings.offRouteThresh || 200;
        const val = document.getElementById('s-offroute-val');
        if (val) val.textContent = orSlider.value + ' m';
        orSlider.oninput = () => { if (val) val.textContent = orSlider.value + ' m'; };
    }
    
    if (immSlider) {
        immSlider.value = state.settings.immobileThresh || 5;
        const val = document.getElementById('s-immobile-val');
        if (val) val.textContent = immSlider.value + ' min';
        immSlider.oninput = () => { if (val) val.textContent = immSlider.value + ' min'; };
    }

    if (logSlider) {
        logSlider.value = state.settings.logInterval || 10;
        const val = document.getElementById('s-log-interval-val');
        if (val) val.textContent = logSlider.value + ' s';
        logSlider.oninput = () => { if (val) val.textContent = logSlider.value + ' s'; };
    }

    const sSound = document.getElementById('s-sound');
    if (sSound) sSound.checked = state.settings.soundAlert;

    const sNotif = document.getElementById('s-notif');
    if (sNotif) sNotif.checked = state.settings.browserNotif;

    const sSim = document.getElementById('s-simmode');
    if (sSim) sSim.checked = state.settings.simMode;

    const sRadii = document.getElementById('s-show-radii');
    if (sRadii) sRadii.checked = state.settings.showRadii !== false;

    const sToken = document.getElementById('s-token');
    if (sToken) sToken.value = state.settings.telegramToken || '';
}

function collectSettings() {
    const orSlider = document.getElementById('s-offroute');
    if (orSlider) state.settings.offRouteThresh = parseInt(orSlider.value);

    const immSlider = document.getElementById('s-immobile');
    if (immSlider) state.settings.immobileThresh = parseInt(immSlider.value);

    const logSlider = document.getElementById('s-log-interval');
    if (logSlider) state.settings.logInterval = parseInt(logSlider.value);

    const sSound = document.getElementById('s-sound');
    if (sSound) state.settings.soundAlert = sSound.checked;

    const sNotif = document.getElementById('s-notif');
    if (sNotif) state.settings.browserNotif = sNotif.checked;

    const sSim = document.getElementById('s-simmode');
    if (sSim) {
        const wasSim = state.settings.simMode;
        state.settings.simMode = sSim.checked;
        if (wasSim !== sSim.checked) {
            if (sSim.checked) startSimulation();
            else stopSimulation();
        }
    }

    const sRadii = document.getElementById('s-show-radii');
    if (sRadii) state.settings.showRadii = sRadii.checked;

    const sToken = document.getElementById('s-token');
    if (sToken) state.settings.telegramToken = sToken.value.trim();

    if (state.settings.telegramToken) {
        initTelegramClient(state.settings.telegramToken);
    } else if (state.telegramClient) {
        state.telegramClient.stop();
        state.telegramClient = null;
    }

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
            if (g.wpLayer) {
                g.wpLayer.eachLayer(l => {
                    if (l instanceof L.Circle) {
                        // Toggle stroke to hide/show the circle line
                        l.setStyle({ stroke: e.target.checked });
                    }
                });
            }
        });
    };
    document.getElementById('toggle-wp-labels').onchange = (e) => {
        if (e.target.checked) document.body.classList.remove('hide-wp-labels');
        else document.body.classList.add('hide-wp-labels');
    };
    document.getElementById('toggle-pilot-traces').onchange = (e) => {
        state.settings.showPilotTraces = e.target.checked;
        updatePilotTraces();
    };

    const handleFile = (file) => {
        if (!file || !file.name.toLowerCase().endsWith('.gpx')) {
            showToast('Veuillez sélectionner un fichier .gpx', 'error');
            return;
        }
        
        console.log('[GPX] Tentative de lecture du fichier :', file.name, 'Size:', file.size);
        const reader = new FileReader();
        
        reader.onload = (ev) => {
            const content = ev.target.result;
            if (!content || content.length < 50) {
                showToast('Le fichier GPX semble vide ou corrompu', 'error');
                return;
            }
            uploadGPX(file.name, content);
        };
        
        reader.onerror = (err) => {
            console.error('[GPX] Erreur FileReader:', err);
            showToast('Erreur de lecture du fichier', 'error');
        };

        // Utilisation de readAsText avec encodage explicite UTF-8
        reader.readAsText(file, 'UTF-8');
    };

    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
            // Reset input so the same file can be re-uploaded if needed
            e.target.value = '';
        }
    });

    dropZone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        e.stopPropagation();
        dropZone.classList.add('drag-over'); 
    });
    
    dropZone.addEventListener('dragleave', (e) => { 
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over'); 
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
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
    
    const clearBtn = document.getElementById('btn-clear-db');
    if (clearBtn) clearBtn.addEventListener('click', clearDatabase);

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

    // Center on route
    document.getElementById('btn-fit').addEventListener('click', () => {
        if (state.routeLayer) state.map.fitBounds(state.routeLayer.getBounds(), { padding: [40, 40] });
    });

    // Refresh participant list periodically (time since last update)
    setInterval(renderParticipantList, 30000);
    renderAlertList();

    // Mobile menu toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (menuBtn && sidebar) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
        // Auto-close on small screens
        sidebar.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && !e.target.closest('#gpx-drop')) {
                sidebar.classList.remove('mobile-open');
            }
        });
    }
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
    const container = document.getElementById('gpx-library-list');
    if (!container) return;
    container.innerHTML = '';

    const isAutonomous = !!state.settings.telegramToken;

    if (isAutonomous) {
        if (state.loadedGpx.size === 0) {
            container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">Aucune trace chargée</div>';
            return;
        }
        renderLocalTraces(container);
    } else {
        try {
            const res = await fetch('/api/gpx');
            const list = await res.json();

            if (list.length === 0 && state.loadedGpx.size === 0) {
                container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">Aucune trace</div>';
                return;
            }

            const serverIds = list.map(item => item.id);

            list.forEach(item => {
                const isLoaded = state.loadedGpx.has(item.id);
                const gpxObj = isLoaded ? state.loadedGpx.get(item.id) : null;
                const styleAttr = isLoaded ? `border-left: 3px solid ${gpxObj.color || '#3b82f6'}` : '';

                container.innerHTML += `
                    <div class="gpx-item" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;background:var(--bg-card);padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;${styleAttr}">
                        <input type="checkbox" onchange="window.toggleLibraryGPX('${item.id}', this.checked)" ${isLoaded && gpxObj.visible !== false ? 'checked' : ''} title="Afficher/Masquer" />
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="window.centerOnGPX('${item.id}')">${item.name}</span>
                        ${isLoaded ? `<input type="color" value="${gpxObj.color || '#3b82f6'}" style="width:16px;height:16px;border:none;border-radius:3px;cursor:pointer;padding:0" onchange="window.changeGPXColor('${item.id}', this.value)" />` : ''}
                        <button class="btn" style="padding:2px;font-size:9px;background:#ef4444;color:white;border:none;border-radius:3px;opacity:0.6" onclick="window.confirmDeleteGPX('${item.id}', '${item.name.replace(/'/g, "\\'")}')">🗑️</button>
                    </div>
                `;
            });

            renderLocalTraces(container, serverIds);

        } catch (e) {
            container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">Impossible de charger la bibliothèque</div>';
        }
    }
}

function renderLocalTraces(container, filterIds = []) {
    state.loadedGpx.forEach((g, id) => {
        if (filterIds.includes(parseInt(id)) || filterIds.includes(id) || id.toString().includes('local-')) {
            const styleAttr = `border-left: 3px solid ${g.color || '#3b82f6'}`;
            container.innerHTML += `
                <div class="gpx-item" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;background:var(--bg-card);padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;${styleAttr}">
                    <input type="checkbox" ${g.visible !== false ? 'checked' : ''} onchange="window.toggleLibraryGPX('${id}', this.checked)" title="Afficher/Masquer" />
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="window.centerOnGPX('${id}')">${g.name} (Local)</span>
                    <input type="color" value="${g.color || '#3b82f6'}" style="width:16px;height:16px;border:none;border-radius:3px;cursor:pointer;padding:0" onchange="window.changeGPXColor('${id}', this.value)" />
                    <button class="btn" style="padding:2px;font-size:9px;background:#ef4444;color:white;border:none;border-radius:3px;opacity:0.6" onclick="unloadGPX('${id}')">❌</button>
                </div>
            `;
        }
    });
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
    const isLoaded = state.loadedGpx.has(id) || (parseInt(id) && state.loadedGpx.has(parseInt(id)));
    if (isLoaded) {
        const gpx = state.loadedGpx.get(id) || state.loadedGpx.get(parseInt(id));
        gpx.visible = checked;
        if (gpx.layers) {
            gpx.layers.forEach(l => {
                if (checked) state.map.addLayer(l);
                else state.map.removeLayer(l);
            });
        }
        if (gpx.wpLayer) {
            if (checked) state.map.addLayer(gpx.wpLayer);
            else state.map.removeLayer(gpx.wpLayer);
        }
        rebuildGlobalRoute();
        fetchGPXLibrary();
    } else {
        if (checked) {
            await loadGPXFromServer(id);
        }
    }
}

window.changeGPXColor = function(id, color) {
    const gpx = state.loadedGpx.get(id) || (parseInt(id) && state.loadedGpx.get(parseInt(id)));
    if (gpx) {
        gpx.color = color;
        if (gpx.layers) {
            gpx.layers.forEach(l => {
                if (l.setStyle) l.setStyle({ color: color });
            });
        }
        fetchGPXLibrary(); // Update list indicators
    }
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

async function uploadGPX(name, data) {
    const isAutonomous = !!state.settings.telegramToken;
    
    // En mode autonome, on privilégie le chargement local immédiat
    if (isAutonomous) {
        console.log('[Autonomous] Chargement GPX local direct.');
        const localId = 'local-' + Date.now();
        loadGPX(data, name, localId);
        showToast('Trace chargée localement (Mode Autonome)', 'success');
        
        // On essaie quand même de sauvegarder sur le serveur en tâche de fond si dispo
        fetch('/api/gpx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data })
        }).catch(() => { /* ignore silent failure */ });
        
        return;
    }

    try {
        const res = await fetch('/api/gpx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data })
        });
        if (res.ok) {
            const resData = await res.json();
            loadGPX(data, name, resData.id);
            fetchGPXLibrary();
            return;
        }
    } catch (err) {
        console.warn('[App] Serveur non détecté ou erreur réseau, repli local.');
    }

    // FALLBACK LOCAL
    const localId = 'local-' + Date.now();
    loadGPX(data, name, localId);
    showToast('Mode Local : Trace chargée en mémoire', 'info');
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
            console.log(res.ok ? "Server deletion OK" : "Pilot not on server (404), removing locally");
            removeParticipant(id);
        }
    } catch (err) {
        console.error("Error deleting participant:", err);
        // Fallback remove
        removeParticipant(id);
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
                    color: p.data.color || '#3b82f6', weight: 1.5, opacity: 0.8
                }).addTo(state.map);
                p.trail.on('click', () => focusParticipant(id));
            } else {
                p.trail.setLatLngs(latlngs);
            }
        }
    });
}

function clearDatabase() {
    if (!confirm('Voulez-vous vraiment vider la base de données (Traces et Pilotes) ?')) return;

    const isAutonomous = !!state.settings.telegramToken;
    if (isAutonomous) {
        // Mode Autonome : Reset local memory state
        state.participants.forEach(p => state.map.removeLayer(p.marker));
        state.participants.clear();
        state.loadedGpx.forEach(g => {
            g.layers.forEach(l => state.map.removeLayer(l));
            if (g.wpLayer) state.map.removeLayer(g.wpLayer);
        });
        state.loadedGpx.clear();
        state.routePoints = [];
        state.waypoints = [];
        if (state.routeLayer) state.map.removeLayer(state.routeLayer);
        renderParticipantList();
        renderAlertList();
        updateStats();
        fetchGPXLibrary();
        showToast('Données locales effacées', 'success');
        closeSettingsModal();
    } else {
        // Mode Serveur : API call
        fetch('/api/clear', { method: 'POST' })
            .then(res => {
                if (res.ok) {
                    showToast('Base de données serveur vidée', 'success');
                    location.reload();
                } else {
                    showToast('Erreur serveur lors de la suppression', 'error');
                }
            }).catch(() => showToast('Erreur réseau', 'error'));
    }
}

