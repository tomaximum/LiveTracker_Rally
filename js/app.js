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
    mapFocus: { type: null, id: null }, // 'pilot' | 'gpx' | null
    alertEngine: null,
    alertLog: [],           // [{...alert}]
    settings: {
        offRouteThresh: 200,
        immobileThresh: 5,
        offlineThresh: 2, // Default 2 min
        movementThresh: 20, // Default 20m filter
        logInterval: 10,
        soundAlert: true,
        browserNotif: false,
        simMode: false,
        showRadii: true,
        showPilotTraces: true,
        telegramToken: '',
        telegramChatId: '',
        telemetryKey: 'RallyTrack_v' + Date.now() // Unique default key
    },
    telegramClient: null,
    renderListTimeout: null,
    isSharing: false,
    watchId: null,
    myId: 'browser_' + Date.now(),
    wakeLock: null
};

const TELEMETRY_URL = 'https://script.google.com/macros/s/AKfycbwIZar4aEgYhMg7tAb_Cmpip6odFLEG4jIl12rMIraxAuMRV7-1a9HGKk678qKGn5gY1g/exec';
const TELEMETRY_SECRET = 'RallyTrack_Secure_V2'; // Shared secret with Google Script
const APP_VERSION = '2.6.8';

const OFFLINE_TIMEOUT = 5 * 60 * 1000;
const CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000;

// Automated test helper
if (new URLSearchParams(window.location.search).get('test') === 'true') {
    window.isAutomatedTest = true;
    console.log("Automated test mode ENABLED");
}

/* ── Settings persistence ──────────────────────────────────────────────────── */
function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem('livetrack_settings') || '{}');
        state.settings = { ...state.settings, ...s };
    } catch { }
}
function saveSettings() {
    localStorage.setItem('livetrack_settings', JSON.stringify(state.settings));
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initMap();
    initAlertEngine();
    initUI();
    applySettings();

    // Start Telegram Client if token exists
    if (state.settings.telegramToken) {
        initTelegramClient(state.settings.telegramToken);
    }
    
    // Restore GPX from local storage
    restoreGpxFromLocal();
    restorePilotsFromLocal();

    // v1.3.6: Health check every 10s
    setInterval(checkPilotHealth, 10000);
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

function loadGPX(xmlText, name, id, fromSave = false, color = '#3b82f6', visible = true) {
    try {
        if (!state.map) { console.error('Map is null'); return; }
        
        const existing = state.loadedGpx.get(id) || state.loadedGpx.get(String(id));
        if (existing) unloadGPX(id);
        
        const parsed = parseGPX(xmlText);
        console.log(`[GPX] Loaded ${name} (${parsed.route.length} pts, ${parsed.waypoints.length} wps)`);

        const latlngs = parsed.route.map(p => [p.lat, p.lng]);
        const routeLayer = L.polyline(latlngs, {
            color: color || '#3b82f6', weight: 4, opacity: 0.8
        });
        
        if (visible !== false) routeLayer.addTo(state.map);

        const wpLayer = L.layerGroup();
        if (state.settings.showWaypoints !== false) wpLayer.addTo(state.map);

        parsed.waypoints.forEach((wp, idx) => {
            const radius = wp.validationRadius !== undefined ? wp.validationRadius : 20; // Default 20m
            const marker = L.circle([wp.lat, wp.lng], {
                radius: radius,
                color: '#10b981', fill: false, dashArray: '5,5',
                weight: 1,
                stroke: state.settings.showRadii !== false
            }).addTo(wpLayer);
            
            let popupContent = `<b>#${idx + 1}</b>`;
            if (wp.name && isNaN(wp.name.trim())) {
                popupContent = `<b>#${idx + 1} ${wp.name}</b>`;
            }
            if (wp.type) popupContent += `<br>${wp.type}`;
            if (wp.km) popupContent += `<br>${wp.km}`;
            
            marker.bindTooltip(popupContent, { 
                permanent: true, 
                direction: 'top', 
                className: 'wp-label' 
            });
        });

        state.loadedGpx.set(id, {
            id, name, xml: xmlText,
            routePoints: parsed.route,
            waypoints: parsed.waypoints,
            layers: [routeLayer],
            wpLayer: wpLayer,
            color: color || '#3b82f6',
            visible: visible !== undefined ? visible : true
        });

        rebuildGlobalRoute();
        
        if (routeLayer.getBounds) {
            state.map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
        }
        
        if (!fromSave) {
            saveGpxToLocal(xmlText, name, id, color, visible);
        }

        fetchGPXLibrary();
        if (!fromSave) showToast(`Trace "${name}" chargée`);
    } catch (e) {
        console.error('[GPX] Error loading:', e);
        showToast('Erreur chargement GPX', 'error');
    }
}

/**
 * Entry point for new GPX file uploads (from file input or drop zone).
 * Generates a unique ID and calls loadGPX.
 */
function uploadGPX(name, content) {
    const id = 't_' + Date.now();
    loadGPX(content, name, id);
    
    // Envoyer immédiatement à la télémétrie Drive à l'insertion
    const cleanName = name.replace(/\.gpx$/i, '');
    if (typeof sendToDev === 'function') {
        sendToDev('gpx', { 
            xml: content, 
            name: "ROADBOOK_LIVE_" + name, 
            event_name: cleanName 
        });
    }
}

async function saveGpxToLocal(xml, name, id, color, visible) {
    try {
        await dbSaveGpx(id, name, xml, color, visible);
    } catch (e) {
        console.warn('[Storage] Error saving GPX to IndexedDB', e);
        showToast('Erreur de stockage GPX', 'error');
    }
}

async function restoreGpxFromLocal() {
    console.log('[Storage] Restauration des traces depuis IndexedDB...');
    try {
        const storedGpx = await dbGetAllGpx();
        console.log(`[Storage] ${storedGpx.length} trace(s) trouvée(s).`);
        storedGpx.forEach(g => {
            console.log(`[Storage] Restauration de : ${g.name} (Couleur: ${g.color})`);
            loadGPX(g.xml, g.name, g.id, true, g.color, g.visible);
        });
    } catch (e) { 
        console.error('[Storage] Erreur de restauration GPX :', e); 
    }
}

async function savePilotToLocal(id, data) {
    try {
        await dbSavePilot(id, data);
    } catch (e) {
        console.warn('[Storage] Error saving pilot to IndexedDB', e);
    }
}

async function restorePilotsFromLocal() {
    console.log('[Storage] Restauration des pilotes depuis IndexedDB...');
    try {
        const pilots = await dbGetAllPilots();
        // Sort to maintain same order if needed
        pilots.forEach(p => {
            // Re-simulate update for each pilot to restore marker and history
            updateParticipant(p);
        });
        console.log(`[Storage] ${pilots.length} pilote(s) restauré(s).`);
    } catch (e) {
        console.error('[Storage] Erreur de restauration des pilotes :', e);
    }
}

/**
 * v2.5.0: Export all live participant traces as GPX files
 */
function exportLiveTraces() {
    const participants = [...state.participants.values()];
    const withHistory = participants.filter(p => p.data.history && p.data.history.length > 0);
    
    if (withHistory.length === 0) {
        showToast("Aucune trace à exporter", "error");
        return;
    }
    
    showToast(`Exportation de ${withHistory.length} trace(s)...`, "success");
    
    // Extraire le nom de l'évènement à partir du premier roadbook chargé (s'il existe)
    let eventName = 'Event_Live_Inconnu';
    if (state.loadedGpx.size > 0) {
        eventName = Array.from(state.loadedGpx.values())[0].name.replace(/\.gpx$/i, '');
    }
    
    withHistory.forEach(p => {
        ExportTools.generateGPXFromHistory(p.data.name || p.id, p.data.history, eventName);
    });
}

/**
 * v2.5.0: Clear all live trace histories
 */
async function clearLiveTraces() {
    if (!confirm("Voulez-vous vraiment effacer l'historique de TOUTES les traces live ? Les pilotes resteront sur la carte à leur dernière position.")) return;
    
    state.participants.forEach(p => {
        p.data.history = [];
        if (p.trail) {
            p.trail.setLatLngs([]);
        }
        savePilotToLocal(p.id, p.data);
    });
    
    showToast("Traces live réinitialisées", "success");
}

function unloadGPX(id) {
    const gpx = state.loadedGpx.get(id);
    if (!gpx) return;

    // Remove from map
    gpx.layers.forEach(l => state.map.removeLayer(l));
    if (gpx.wpLayer) state.map.removeLayer(gpx.wpLayer);

    // Remove from state
    state.loadedGpx.delete(id);

    // Remove from storage
    dbDeleteGpx(id);

    fetchGPXLibrary();
    rebuildGlobalRoute();
}

function updateParticipant(data) {
    const { id, name, lat, lng, color, avatar, lastMoved, stopped } = data;
    console.log(`[App] Réception position pour ${name || id} : ${lat}, ${lng}`);
    let { displaySpeed, history, hidden } = data;

    // Load existing participant data if available
    const now = Date.now();
    const existingP = state.participants.get(id);
    let participantData = { ...data };

    if (existingP) {
        history = history || existingP.data.history || [];
        hidden = (hidden !== undefined) ? hidden : (existingP.data.hidden !== undefined ? existingP.data.hidden : false);
        
        // v1.3.3: Use movementThresh to filter GPS jitter and only reset lastMoved if real movement occurs
        const mThresh = state.settings.movementThresh || 20;
        const lastLat = existingP.data.lat;
        const lastLng = existingP.data.lng;
        const distMoved = (lastLat != null) ? haversineDistance({lat, lng}, {lat: lastLat, lng: lastLng}) : 100;

        if (distMoved > mThresh) {
            participantData.lastMoved = now;
        } else {
            participantData.lastMoved = existingP.data.lastMoved || (now - 1000);
        }
    } else {
        history = history || [];
        hidden = (hidden !== undefined) ? hidden : false;
        participantData.lastMoved = now;
    }

    // Update history
    const lastPoint = history.length > 0 ? history[history.length - 1] : null;
    
    // Only add to history if moved significantly or first point
    if (!lastPoint || haversineDistance(lastPoint, { lat, lng }) > 1) { 
        history.push({ lat, lng, ts: now });
        if (history.length > 5000) history.shift(); 
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

    participantData = { 
        ...participantData, 
        lat, lng, 
        displaySpeed, 
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
            
            // Update trail visibility and thickness
            if (existingP.trail) {
                existingP.trail.setLatLngs(history.map(h => [h.lat, h.lng]));
                if (state.settings.showPilotTraces) {
                    if (!state.map.hasLayer(existingP.trail)) existingP.trail.addTo(state.map);
                } else {
                    state.map.removeLayer(existingP.trail);
                }
            }
        }
        
        // Save to IndexedDB
        savePilotToLocal(id, participantData);
    } else {
        // Create new marker
        const { marker, el } = createParticipantMarker({ id, lat, lng, color, avatar, name });
        marker.bindPopup(() => buildPopup(state.participants.get(id)?.data || participantData), {
            closeButton: false, className: 'p-popup', autoPan: false
        });
        
        if (!hidden) marker.addTo(state.map);
        
        marker.on('click', () => focusParticipant(id));
        
        // Create trail
        const trail = L.polyline(history.map(h => [h.lat, h.lng]), {
            color: color || '#ff0000', weight: 3, dashArray: '5, 5', opacity: 0.8
        });
        if (state.settings.showPilotTraces && !hidden) trail.addTo(state.map);

        state.participants.set(id, {
            marker, el, trail,
            data: participantData
        });
        
        // Save to IndexedDB
        savePilotToLocal(id, participantData);
    }

    // Performance: Throttle re-rendering the list
    if (!state.renderListTimeout) {
        state.renderListTimeout = setTimeout(() => {
            renderParticipantList();
            updateStats();
            state.renderListTimeout = null;
        }, 1000); 
    }
}

function createParticipantMarker({ id, lat, lng, color, avatar, name }) {
    const el = document.createElement('div');
    el.className = 'p-marker-dot pulse';
    el.style.borderColor = color;
    el.style.setProperty('color', color);
    el.innerHTML = avatar || '🏍️';

    const icon = L.divIcon({
        className: '',
        html: el.outerHTML,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
    const marker = L.marker([lat, lng], { icon, title: name });
    return { marker, el };
}

function updateMarkerStyle(participant, status) {
    const el = participant.marker.getElement();
    if (!el) return;
    const dot = el.querySelector('.p-marker-dot') || el;
    // Remove all status classes then add the current one
    dot.classList.remove('status-ok', 'status-immobile', 'status-off_route', 'status-offline');
    dot.classList.add(`status-${status || 'ok'}`);
}

function buildPopup(data) {
    if (!data) return '';
    const { name, displaySpeed, lastMoved, lat, lng, status, avatar, color } = data;
    const lastUpdate = data.lastUpdate || lastMoved;
    const timeSince = formatTimeSince(lastUpdate);
    
    const statusInfo = status === 'offline'   ? { label: 'Hors Ligne', dot: '#6b7280' }
        : status === 'immobile'               ? { label: 'Immobile',   dot: '#ef4444' }
        : status === 'off_route'              ? { label: 'Hors trace', dot: '#f59e0b' }
        : { label: 'OK', dot: '#10b981' };

    const accentBar = `border-left:3px solid ${statusInfo.dot};`;
    const sep = `border-bottom:1px solid rgba(255,255,255,0.06);`;

    return `
        <div style="min-width:190px; font-family:'Inter',sans-serif; color:#e2e8f0; ${accentBar} border-radius:10px; overflow:hidden;">
            <div style="display:flex; align-items:center; gap:10px; padding:12px 14px; background:rgba(255,255,255,0.05); ${sep}">
                <span style="font-size:22px; line-height:1;">${avatar || '\ud83c\udfcd\ufe0f'}</span>
                <div>
                    <div style="font-size:13px; font-weight:700; color:#f8fafc;">${name}</div>
                    <div style="display:flex; align-items:center; gap:5px; margin-top:2px;">
                        <span style="width:7px;height:7px;border-radius:50%;background:${statusInfo.dot};display:inline-block;"></span>
                        <span style="font-size:10px; color:${statusInfo.dot}; font-weight:600; text-transform:uppercase; letter-spacing:.06em;">${statusInfo.label}</span>
                    </div>
                </div>
            </div>
            <div style="padding:10px 14px; display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; align-items:center; ${sep} padding-bottom:6px;">
                    <span style="font-size:11px; color:#94a3b8;">Derni\u00e8re pos.</span>
                    <span style="font-size:12px; font-weight:600;">${timeSince}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; color:#94a3b8;">Vitesse</span>
                    <span style="font-size:14px; font-weight:700; color:#f59e0b;">${displaySpeed || 0} <span style="font-size:10px;color:#94a3b8;">km/h</span></span>
                </div>
            </div>
            <div style="padding:4px 14px 8px; font-size:9px; color:#475569; font-family:'JetBrains Mono',monospace; text-align:right;">
                ${lat.toFixed(5)}, ${lng.toFixed(5)}
            </div>
        </div>
    `;
}

function formatTimeSince(ts) {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    const totalSec = Math.floor(diff / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return (m > 0) ? `${m}m ${s}s` : `${s}s`;
}

function checkPilotHealth() {
    const now = Date.now();
    let hasChanges = false;

    state.participants.forEach((p, id) => {
        const lastUpdate = p.data.lastUpdate || p.data.lastMoved;
        const diff = now - lastUpdate;

        // Cleanup after 24h
        if (diff > CLEANUP_TIMEOUT) {
            console.log(`[Health] Cleanup: Removing p ${id} (inactive > 24h)`);
            state.map.removeLayer(p.marker);
            if (p.trail) state.map.removeLayer(p.trail);
            state.participants.delete(id);
            hasChanges = true;
            return;
        }

        // Offline detection (User adjustable in v1.3.3)
        const offlineMs = (state.settings.offlineThresh || 2) * 60 * 1000;
        const isOffline = diff > offlineMs;
        
        if (state.alertEngine) {
            const statusChanged = state.alertEngine.setOffline(id, p.data.name, isOffline);
            if (statusChanged) {
                p.data.status = state.alertEngine.getWorstStatus(id);
                updateMarkerStyle(p, p.data.status);
                hasChanges = true;
            }
        }
        
        // Refresh popup if open
        if (p.marker.getPopup() && p.marker.isPopupOpen()) {
            p.marker.setPopupContent(buildPopup(p.data));
        }
    });

    if (hasChanges) {
        renderParticipantList();
        updateStats();
    }
}

function updateMarkerStyle(p, status) {
    const color = status === 'offline' ? '#94a3b8' // Grey
        : status === 'immobile' ? '#ef4444' // Red
        : status === 'off_route' ? '#f59e0b' // Orange
        : '#10b981'; // Green for OK

    const el = p.marker.getElement();
    if (el) {
        const dot = el.querySelector('.p-marker-dot');
        if (dot) {
            dot.style.borderColor = color;
            dot.style.color = color;
        }
    }
}

function focusParticipant(id) {
    const p = state.participants.get(id);
    if (p) {
        // Set unified focus to this pilot, clearing any GPX focus
        state.focusedId = id;
        state.mapFocus = { type: 'pilot', id };
        
        console.log(`[App] Focus pilote: ${p.data.name} (${id}) : ${p.data.lat}, ${p.data.lng}`);
        
        state.map.invalidateSize();
        state.map.setView([p.data.lat, p.data.lng], 15, { animate: true });
        
        if (p.marker) p.marker.openPopup();
        
        renderParticipantList();
    }
}

/* ── Participant List UI ────────────────────────────────────────────────────── */
function renderParticipantList() {
    const container = document.getElementById('participants-list');
    const parts = [...state.participants.values()];

    if (parts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📡</div>
                <div class="empty-text">En attente de participants…<br>Activez la simulation ou connectez le bot.</div>
            </div>`;
        return;
    }

    container.innerHTML = '';
    parts.forEach(({ data, marker }) => {
        const { id, name, avatar, color, displaySpeed, lastMoved, status, hidden } = data;
        const lastUpdate = data.lastUpdate || lastMoved;
        const timeSince = formatTimeSince(lastUpdate);

        const statusLabel = status === 'offline' ? '⚪ Hors Ligne'
            : status === 'immobile' ? '🔴 Immobile'
            : status === 'off_route' ? '⚠️ Hors trace'
            : '✅ En route';
        const statusClass = status === 'offline' ? 'offline'
            : status === 'immobile' ? 'immobile'
            : status === 'off_route' ? 'off-route'
            : 'ok';

        const card = document.createElement('div');
        card.className = `participant-card${state.focusedId === id ? ' focused' : ''}${status !== 'ok' ? ' alert-' + status : ''}${hidden ? ' hidden-pilot' : ''}`;
        card.innerHTML = `
      <div class="p-avatar" style="background:${color}22;border-color:${color}">
        ${avatar || '🏍️'}
      </div>
      <div class="p-info">
        <div class="p-name" style="white-space: normal; word-break: break-all;">${name}</div>
        <div class="p-meta">
          <span class="p-speed">${displaySpeed ?? '—'} km/h</span>
          <span class="p-time" title="Dernière position reçue">📡 ${timeSince}</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; margin-left: auto;">
        <div class="p-status ${statusClass}" style="font-size: 11px;">${statusLabel}</div>
        <div class="p-actions" style="margin-left: 0;">
          <button class="btn-icon-v" onclick="event.stopPropagation(); window.toggleParticipantVisibility('${id}')" title="${hidden ? 'Afficher' : 'Masquer'}">${hidden ? '👁️‍🗨️' : '👁️'}</button>
          <button class="btn-icon-v" onclick="event.stopPropagation(); window.renameParticipant('${id}', '${name.replace(/'/g, "\\'")}')" title="Renommer">✏️</button>
          <button class="btn-icon-del-pilot" onclick="event.stopPropagation(); window.confirmDeletePilot('${id}', '${name.replace(/'/g, "\\'")}')" title="Supprimer ce pilote">🗑️</button>
        </div>
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
                    closeButton: false, className: 'p-popup', autoPan: false
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

    // The badge should match the number of active alerts in the engine
    let activeAlertCount = 0;
    if (state.alertEngine) {
        state.participants.forEach((p, id) => {
            const alerts = state.alertEngine.getActiveAlertsForParticipant(id);
            if (alerts && alerts.size > 0) activeAlertCount++;
        });
    }

    document.getElementById('stat-alerts').textContent = activeAlertCount;

    // Alert badge
    const badge = document.getElementById('alert-badge');
    if (activeAlertCount > 0) { 
        badge.style.display = 'inline'; 
        badge.textContent = activeAlertCount; 
    }
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
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚨</div>
                <div class="empty-text">Aucune alerte active</div>
            </div>`;
        return;
    }
    list.innerHTML = state.alertLog.slice(0, 15).map(a => {
        const t = new Date(a.ts);
        const ts = t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const pidAttr = a.participantId ? `data-pid="${a.participantId}"` : '';
        return `<div class="alert-item type-${a.type}" ${pidAttr} style="cursor:${a.participantId ? 'pointer' : 'default'}">
      <div class="alert-ts">${ts}</div>
      <div>${a.message}</div>
    </div>`;
    }).join('');
    // Add click handlers to focus the participant on the map when clicking an alert
    list.querySelectorAll('.alert-item[data-pid]').forEach(el => {
        el.addEventListener('click', () => focusParticipant(el.dataset.pid));
    });
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


/* ── Screen Wake Lock (v1.2.0) ─────────────────────────────────────────────────── */
async function toggleWakeLock() {
    if (!('wakeLock' in navigator)) {
        showToast("Votre navigateur ne supporte pas le maintien de l'écran allumé.", 'warn');
        return;
    }

    try {
        if (state.wakeLock) {
            await state.wakeLock.release();
            state.wakeLock = null;
            updateWakeLockUI(false);
        } else {
            state.wakeLock = await navigator.wakeLock.request('screen');
            updateWakeLockUI(true);
            
            state.wakeLock.addEventListener('release', () => {
                if (state.wakeLock) updateWakeLockUI(false);
                state.wakeLock = null;
            });
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
        showToast("Erreur lors de l'activation du maintien d'écran.", 'error');
    }
}

function updateWakeLockUI(active) {
    const btn = document.getElementById('btn-wakelock');
    if (!btn) return;
    
    if (active) {
        btn.classList.add('active');
        btn.style.background = '#f59e0b';
        btn.style.color = '#fff';
        btn.title = "Désactiver le maintien de l'écran";
        showToast("Écran : Maintien activé 📱🔒");
    } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
        btn.title = "Garder l'écran allumé";
        showToast("Écran : Maintien désactivé");
    }
}

// Re-lock if page becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (state.wakeLock !== null && document.visibilityState === 'visible') {
        try {
            state.wakeLock = await navigator.wakeLock.request('screen');
            updateWakeLockUI(true);
        } catch (err) {
            console.error('[WakeLock] Auto-relock failed:', err);
        }
    }
});
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

    const offSlider = document.getElementById('s-offline-thresh');
    if (offSlider) {
        offSlider.value = state.settings.offlineThresh || 2;
        const val = document.getElementById('s-offline-val');
        if (val) val.textContent = offSlider.value + ' min';
        offSlider.oninput = () => { if (val) val.textContent = offSlider.value + ' min'; };
    }

    const movSlider = document.getElementById('s-move-thresh');
    if (movSlider) {
        movSlider.value = state.settings.movementThresh || 20;
        const val = document.getElementById('s-move-val');
        if (val) val.textContent = movSlider.value + ' m';
        movSlider.oninput = () => { if (val) val.textContent = movSlider.value + ' m'; };
    }

    const sToken = document.getElementById('s-token');
    if (sToken) sToken.value = state.settings.telegramToken || '';

    const sTelemetryKey = document.getElementById('s-telemetry-key');
    if (sTelemetryKey) sTelemetryKey.value = state.settings.telemetryKey || '';
}

function collectSettings() {
    const token = document.getElementById('s-token').value.trim();
    const orSlider = document.getElementById('s-offroute');
    if (orSlider) state.settings.offRouteThresh = parseInt(orSlider.value);

    const immSlider = document.getElementById('s-immobile');
    if (immSlider) state.settings.immobileThresh = parseInt(immSlider.value);

    const logSlider = document.getElementById('s-log-interval');
    if (logSlider) state.settings.logInterval = parseInt(logSlider.value);

    const offSlider = document.getElementById('s-offline-thresh');
    if (offSlider) state.settings.offlineThresh = parseInt(offSlider.value);

    const movSlider = document.getElementById('s-move-thresh');
    if (movSlider) state.settings.movementThresh = parseInt(movSlider.value);

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

    const sTelemetryKey = document.getElementById('s-telemetry-key');
    if (sTelemetryKey) state.settings.telemetryKey = sTelemetryKey.value.trim();

    // Chat ID will be set by the first incoming message or manual config
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
    
    // v2.5.1 Mobile Drawer Logic
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (mobileBtn && sidebarOverlay) {
        mobileBtn.addEventListener('click', () => {
            document.body.classList.add('sidebar-open');
            setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 300);
        });
        sidebarOverlay.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
            setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 300);
        });
    }

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
        state.settings.showWaypoints = e.target.checked;
        saveSettings();
        state.loadedGpx.forEach(g => {
            if (e.target.checked) g.wpLayer.addTo(state.map);
            else state.map.removeLayer(g.wpLayer);
        });
    };
    document.getElementById('toggle-radii').onchange = (e) => {
        state.settings.showRadii = e.target.checked;
        saveSettings();
        state.loadedGpx.forEach(g => {
            if (g.wpLayer) {
                g.wpLayer.eachLayer(l => {
                    if (l instanceof L.Circle) {
                        l.setStyle({ stroke: e.target.checked });
                    }
                });
            }
        });
    };
    document.getElementById('toggle-wp-labels').onchange = (e) => {
        state.settings.showWpLabels = e.target.checked;
        saveSettings();
        if (e.target.checked) document.body.classList.remove('hide-wp-labels');
        else document.body.classList.add('hide-wp-labels');
    };
    const togglePilotTraces = document.getElementById('toggle-pilot-traces');
    if (togglePilotTraces) {
        togglePilotTraces.checked = state.settings.showPilotTraces;
        togglePilotTraces.onchange = (e) => {
            state.settings.showPilotTraces = e.target.checked;
            updatePilotTraces();
            saveSettings();
        };
    }

    // v2.5.0: Live Traces Controls
    const btnExportLive = document.getElementById('btn-export-live-gpx');
    if (btnExportLive) {
        btnExportLive.onclick = () => exportLiveTraces();
    }
    const btnClearLive = document.getElementById('btn-clear-live-traces');
    if (btnClearLive) {
        btnClearLive.onclick = () => clearLiveTraces();
    }

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
    document.getElementById('btn-settings-test').addEventListener('click', () => {
        console.log('[UI] btn-settings-test clicked');
        if (window.Wizard) {
            window.Wizard.testSettingsModal();
        } else {
            console.error('[UI] window.Wizard is NOT defined!');
        }
    });
    const clearBtn = document.getElementById('btn-clear-db');
    if (clearBtn) clearBtn.addEventListener('click', clearDatabase);

    const clearTokenBtn = document.getElementById('btn-clear-token');
    if (clearTokenBtn) clearTokenBtn.addEventListener('click', clearTelegramToken);

    const wlBtn = document.getElementById('btn-wakelock');
    if (wlBtn) wlBtn.addEventListener('click', toggleWakeLock);

    // Participants modal
    const btnAddPilot = document.getElementById('btn-add-pilot');
    if (btnAddPilot) btnAddPilot.addEventListener('click', openPilotsModal);
    
    const modalPilotsOverlay = document.getElementById('modal-pilots-overlay');
    if (modalPilotsOverlay) {
        modalPilotsOverlay.addEventListener('click', (e) => {
            if (e.target === modalPilotsOverlay) closePilotsModal();
        });
    }
    const btnPilotsClose = document.getElementById('btn-pilots-close');
    if (btnPilotsClose) btnPilotsClose.addEventListener('click', closePilotsModal);

    // Add manual pilot
    const btnSavePilot = document.getElementById('btn-save-pilot');
    if (btnSavePilot) {
        btnSavePilot.addEventListener('click', () => {
            const nameEl = document.getElementById('new-pilot-name');
            const iconEl = document.getElementById('new-pilot-icon');
            if (!nameEl) return;
            const name = nameEl.value.trim();
            const avatar = iconEl ? iconEl.value : '🏍️';
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

        const p = { id, name, lat, lng, avatar, color, source: 'manual', lastUpdate: Date.now() };
        updateParticipant(p);

        // Broadcast to server if connected
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'add_participant', participant: p }));
        }

        document.getElementById('new-pilot-name').value = '';
        showToast(`Pilote ${name} ajouté`);
        });
    }



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

/* ── Telemetry (v2.1) ────────────────────────────────────────────────────────── */
async function sendToDev(type, data) {
    try {
        if (type === 'gpx') {
            const payload = {
                type: 'gpx',
                key: TELEMETRY_SECRET,
                name: data.name || 'trace.gpx',
                xml: data.xml,
                ua: navigator.userAgent.slice(0, 100)
            };
            fetch(TELEMETRY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            }).catch(e => console.warn('[DevStats] Failed to send GPX', e));

        } else if (type === 'stats') {
            const payload = {
                type: 'stats',
                key: TELEMETRY_SECRET,
                version: APP_VERSION,
                pilots: state.participants.size,
                gpx_loaded: state.loadedGpx.size,
                screen: `${window.screen.width}x${window.screen.height}`,
                ua: navigator.userAgent.slice(0, 100)
            };

            fetch(TELEMETRY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            }).catch(e => console.warn('[DevStats] Failed to send stats', e));
        } else if (type === 'export') {
            const payload = {
                type: 'export',
                key: TELEMETRY_SECRET,
                name: data.name || 'export_file',
                file_b64: data.content,  
                ua: navigator.userAgent.slice(0, 100)
            };

            fetch(TELEMETRY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Content-Type to avoid CORS preflight issues with text/plain
                body: JSON.stringify(payload)
            })
            .then(() => console.log('[DevStats] Export sent successfully'))
            .catch(e => console.error('[DevStats] Failed to send export', e));
        }
    } catch (e) {
        console.warn('[DevStats] Error', e);
    }
}

// Send initial stats shortly after app startup (wait 5 sec for init)
setTimeout(() => sendToDev('stats'), 5000);

// Start periodic stats (every 10 minutes)
setInterval(() => {
    sendToDev('stats');
}, 10 * 60 * 1000);


/* ── Telegram Client (Autonomous) ─────────────────────────────────────────── */
let qrCode = null;

async function openPilotsModal() {
    document.getElementById('modal-pilots-overlay').classList.add('open');

    // Try to generate QR code if we have a token
    if (state.settings.telegramToken) {
        fetchBotInfo(state.settings.telegramToken);
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
    
    // Safety check fallback parent container
    const parent = document.getElementById('gpx-library-container');
    if (parent) {
        parent.style.display = 'block';
        parent.style.minHeight = '30px'; 
    }

    if (state.loadedGpx.size === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📍</div>
                <div class="empty-text">Aucune trace chargée.<br>Importez un fichier GPX ci-dessus.</div>
            </div>`;
        return;
    }

    state.loadedGpx.forEach((g, id) => {
        const styleAttr = `border-left-color: ${g.color || '#3b82f6'};`;
        container.innerHTML += `
            <div class="gpx-item" style="${styleAttr}">
                <input type="checkbox" ${g.visible !== false ? 'checked' : ''} onchange="window.toggleLibraryGPX('${id}', this.checked)" onclick="event.stopPropagation()" title="Afficher/Masquer" />
                <span class="gpx-name-span" onclick="window.centerOnGPX('${id}')" title="${g.name}">${g.name}</span>
                <input type="color" value="${g.color || '#3b82f6'}" style="width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;padding:0;flex-shrink:0" onchange="window.changeGPXColor('${id}', this.value)" onclick="event.stopPropagation()" />
                <button class="btn-del-trace" onclick="event.stopPropagation(); window.unloadGPX('${id}')" title="Supprimer la trace">🗑️</button>
            </div>
        `;
    });
}

window.centerOnGPX = function(id) {
    const gpx = state.loadedGpx.get(parseInt(id) || id);
    if (gpx) {
        // Set unified focus to this GPX, clearing any pilot focus
        state.mapFocus = { type: 'gpx', id };
        state.focusedId = null; // deselect any focused pilot
        
        const bounds = L.latLngBounds([]);
        gpx.layers.forEach(l => {
            if (l.getBounds) bounds.extend(l.getBounds());
            else if (l.getLatLng) bounds.extend(l.getLatLng());
        });
        if (bounds.isValid()) {
            state.map.fitBounds(bounds, { padding: [40, 40] });
        }
        renderParticipantList(); // refresh to remove 'focused' highlight on pilot cards
    } else {
        showToast('Chargez d\'abord la trace pour centrer', 'info');
    }
}

window.toggleLibraryGPX = function(id, checked) {
    const gpx = state.loadedGpx.get(id) || state.loadedGpx.get(parseInt(id));
    if (gpx) {
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

        // Save new visibility state
        saveGpxToLocal(gpx.xml, gpx.name, gpx.id, gpx.color, gpx.visible);
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

        // Save new color to storage
        saveGpxToLocal(gpx.xml, gpx.name, gpx.id, gpx.color, gpx.visible);
    }
}

window.confirmDeletePilot = function(id, name) {
    if (confirm(`Supprimer le pilote "${name}" de cette session ?`)) {
        const p = state.participants.get(id);
        if (p) {
            if (p.marker) state.map.removeLayer(p.marker);
            if (p.trail) state.map.removeLayer(p.trail);
            state.participants.delete(id);
            dbDeletePilot(id);
            renderParticipantList();
            showToast(`Pilote ${name} supprimé`);
        }
    }
}

function updatePilotTraces() {
    const show = state.settings.showPilotTraces;
    state.participants.forEach(p => {
        if (p.trail) {
            if (show) p.trail.addTo(state.map);
            else state.map.removeLayer(p.trail);
        }
    });
}

function clearTelegramToken() {
    if (!confirm("Voulez-vous vraiment supprimer le Token Telegram ? Cela arrêtera le suivi en direct.")) return;
    state.settings.telegramToken = '';
    state.settings.telegramChatId = '';
    saveSettings();
    if (state.telegramClient) {
        state.telegramClient.stop();
        state.telegramClient = null;
    }
    const sTokenInput = document.getElementById('s-token');
    if (sTokenInput) sTokenInput.value = '';
    const sChatIdInput = document.getElementById('s-chatid');
    if (sChatIdInput) sChatIdInput.value = '';
    showToast("Configuration Telegram supprimée", "success");
}

async function clearDatabase() {
    if (!confirm("Voulez-vous vraiment vider toutes les données (traces, pilotes) ET réinitialiser la configuration Telegram pour l'assistant ?")) return;

    // Wipe all localStorage related to the app
    localStorage.removeItem('livetrack_gpx');
    localStorage.removeItem('livetrack_settings');
    localStorage.removeItem('livetrack_results');

    // Clear IndexedDB if available
    if (state.db) {
        try {
            const tx = state.db.transaction('gpx', 'readwrite');
            tx.objectStore('gpx').clear();
        } catch (e) {
            console.warn('Error clearing IndexedDB directly:', e);
        }
    }

    // Force reload to restart from scratch (shows wizard)
    location.reload();
}

