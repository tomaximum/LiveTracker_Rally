/**
 * RallyMap — Carte interactive Leaflet pour RallyRanking
 */
class RallyMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.roadbookLayer = null;
        this.competitorLayers = {}; // { name: { group, polyline, color } }
        this.highlightedName = null;

        this.palette = [
            '#FF6B6B', '#4ECDC4', '#FFE66D', '#A29BFE',
            '#FD79A8', '#00CEC9', '#FDCB6E', '#74B9FF',
            '#E17055', '#55EFC4', '#6C5CE7', '#FAB1A0'
        ];
        this.colorIndex = 0;
        this.competitorColors = {};

        this._init();
    }

    _init() {
        this.map = L.map(this.containerId, {
            center: [46.5, 2.5],
            zoom: 6,
            zoomControl: true
        });

        const osm = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
        );
        const sat = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: '© Esri World Imagery', maxZoom: 19 }
        );
        const topo = L.tileLayer(
            'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenTopoMap', maxZoom: 17 }
        );

        osm.addTo(this.map);

        this._overlays = {};
        this._activeLayer = 'osm';
        this._baseLayers = { 'osm': osm, 'satellite': sat, 'topo': topo };

        this._layerControl = L.control.layers(null, this._overlays, {
            position: 'topright',
            collapsed: false
        }).addTo(this.map);

        // Bind custom UI buttons
        const layerBtns = document.querySelectorAll('#rr-map-controls .map-ctrl-btn');
        layerBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const layerKey = btn.dataset.rrlayer;
                if (layerKey === this._activeLayer) return;
                this.map.removeLayer(this._baseLayers[this._activeLayer]);
                this._baseLayers[layerKey].addTo(this.map);
                this._activeLayer = layerKey;
                layerBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // ── Ré-appliquer les styles après un toggle du contrôle de couches ──
        this.map.on('overlayadd', (e) => {
            // On cherche quel concurrent correspond à cette couche
            const entry = Object.entries(this.competitorLayers).find(([n, v]) => v.group === e.layer);
            if (entry) {
                const [name, data] = entry;
                // Si quelqu'un est mis en évidence, on applique le style correspondant (faded ou non)
                if (this.highlightedName) {
                    this._applyStyleToEntry(name, data, name === this.highlightedName);
                } else {
                    this._applyStyleToEntry(name, data, true); // Reset normal
                }
            }
        });
    }

    // ── Roadbook ──────────────────────────────────────────────────────

    renderRoadbook(waypoints, trackPoints) {
        if (this.roadbookLayer) {
            this.map.removeLayer(this.roadbookLayer);
            this._layerControl.removeLayer(this.roadbookLayer);
        }
        this.roadbookLayer = L.layerGroup();

        let routeLatLngs = [];
        if (trackPoints && trackPoints.length > 1) {
            routeLatLngs = trackPoints.map(p => [p.lat, p.lng !== undefined ? p.lng : p.lon]);
        } else if (waypoints && waypoints.length > 1) {
            routeLatLngs = waypoints.map(w => [w.lat, w.lng !== undefined ? w.lng : w.lon]);
        }

        if (routeLatLngs.length > 1) {
            L.polyline(routeLatLngs, {
                color: '#1565C0',
                weight: 5,
                opacity: 1,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(this.roadbookLayer);

            L.polyline(routeLatLngs, {
                color: '#FFFFFF',
                weight: 8,
                opacity: 0.35,
                lineJoin: 'round',
                lineCap: 'round'
            }).addTo(this.roadbookLayer);
        }

        waypoints.forEach((w, idx) => {
            const fillColor = this._wptColor(w.type);
            const markerLon = w.lng !== undefined ? w.lng : w.lon;
            const marker = L.circleMarker([w.lat, markerLon], {
                radius: 9,
                fillColor,
                color: '#fff',
                weight: 2.5,
                fillOpacity: 1,
                zIndexOffset: 500
            });
            marker.bindTooltip(
                `<strong>${w.name || idx + 1}</strong> — ${(w.type || '').toUpperCase()}<br>Open: ${w.open} m / Clear: ${w.clear} m`,
                { direction: 'top', offset: [0, -10] }
            );
            marker.addTo(this.roadbookLayer);

            // Étiquette textuelle bien visible (fond sombre) pour contraster avec la carte claire
            L.marker([w.lat, markerLon], {
                icon: L.divIcon({
                    className: 'waypoint-label-rr',
                    html: `<div style="background:var(--bg-card); color:var(--text-bright); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; white-space:nowrap; border:1px solid var(--border); box-shadow:0 2px 4px rgba(0,0,0,0.5);">${w.name || idx + 1}</div>`,
                    iconSize: null, // Allow auto width
                    iconAnchor: [-10, 10] // Push slightly right and bottom
                }),
                zIndexOffset: 600
            }).addTo(this.roadbookLayer);
        });

        this.roadbookLayer.addTo(this.map);
        this._overlays['📍 Roadbook'] = this.roadbookLayer;
        this._layerControl.addOverlay(this.roadbookLayer, '📍 Roadbook');

        const pts = (trackPoints && trackPoints.length > 0) ? trackPoints : waypoints.map(w => ({ lat: w.lat, lng: w.lng !== undefined ? w.lng : w.lon }));
        if (pts.length > 0) {
            this.map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng !== undefined ? p.lng : p.lon])), { padding: [30, 30] });
        }
    }

    // ── Concurrent ────────────────────────────────────────────────────

    getColor(name) {
        if (!this.competitorColors[name]) {
            this.competitorColors[name] = this.palette[this.colorIndex % this.palette.length];
            this.colorIndex++;
        }
        return this.competitorColors[name];
    }

    renderCompetitor(name, tracks, wpLog) {
        this.removeCompetitor(name);

        const color = this.getColor(name);
        // Utilisation de FeatureGroup pour un meilleur support des styles et bringToFront
        const group = L.featureGroup();
        let polyline = null;

        if (tracks && tracks.length > 1) {
            const latlngs = tracks.map(p => [p.lat, p.lon]);
            polyline = L.polyline(latlngs, {
                color,
                weight: 4,
                opacity: 1,
                lineJoin: 'round',
                lineCap: 'round'
            });

            // v2.9.0.004 : Tooltip avec écart max
            const maxOffTrack = Math.round(Math.max(...tracks.map(p => p.offTrackDist || 0)));
            let tooltipContent = `<strong>${name}</strong>`;
            if (maxOffTrack > 0) tooltipContent += `<br/>Écart max : ${maxOffTrack}m`;
            
            polyline.bindTooltip(tooltipContent, { sticky: true });
            polyline.addTo(group);

            // v2.9.0.003: Overlayer pour le hors-piste (Orange)
            let offTrackSegments = [];
            let currentSeg = [];
            let lastOnTrackPoint = null;

            tracks.forEach((p, idx) => {
                const tol = (window.rrState.settings && window.rrState.settings.corridorTolerance) || 20;
                const isOffLimit = (p.offTrackDist > tol);
                const isActive = (p.racingActive !== false); // v2.9.0.006

                if (isActive && isOffLimit) {
                    if (currentSeg.length === 0 && lastOnTrackPoint) {
                        currentSeg.push(lastOnTrackPoint);
                    }
                    currentSeg.push([p.lat, p.lon]);
                } else {
                    if (currentSeg.length > 1) {
                        currentSeg.push([p.lat, p.lon]);
                        offTrackSegments.push(currentSeg);
                    }
                    currentSeg = [];
                }
                lastOnTrackPoint = [p.lat, p.lon];
            });
            if (currentSeg.length > 1) offTrackSegments.push(currentSeg);

            offTrackSegments.forEach(seg => {
                L.polyline(seg, {
                    color: '#f39c12', // Orange
                    weight: 6,
                    opacity: 0.8,
                    dashArray: '10, 5' // Optionnel: pointillés pour distinguer
                }).addTo(group);
            });
        }

        if (wpLog) {
            wpLog.forEach(entry => {
                const w = entry.waypoint;
                const isValid = entry.status === 'VALID';
                const dot = L.circleMarker([w.lat, w.lon], {
                    radius: 7,
                    fillColor: isValid ? '#00b894' : '#d63031',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 1,
                    zIndexOffset: 400
                });
                dot.bindTooltip(
                    `${name} — ${w.name || '?'} (${isValid ? '✓ Validé' : '✗ Raté'})`,
                    { direction: 'top', offset: [0, -8] }
                );
                dot.addTo(group);
            });
        }

        group.addTo(this.map);
        this.competitorLayers[name] = { group, polyline, color };
        this._overlays[name] = group;
        this._layerControl.addOverlay(group, `<span style="color:${color};font-size:1.1em">●</span> ${name}`);
    }

    removeCompetitor(name) {
        if (this.competitorLayers[name]) {
            this.map.removeLayer(this.competitorLayers[name].group);
            this._layerControl.removeLayer(this.competitorLayers[name].group);
            delete this.competitorLayers[name];
            delete this._overlays[name];
        }
    }

    changeCompetitorColor(name, newColor) {
        const entry = this.competitorLayers[name];
        if (!entry) return;
        entry.color = newColor;
        this.competitorColors[name] = newColor;
        if (entry.polyline) {
            entry.polyline.setStyle({ color: newColor });
        }
        this._layerControl.removeLayer(entry.group);
        this._layerControl.addOverlay(entry.group, `<span style="color:${newColor};font-size:1.1em">●</span> ${name}`);
    }

    clearAllCompetitors() {
        Object.keys(this.competitorLayers).forEach(n => this.removeCompetitor(n));
        this.colorIndex = 0;
        this.competitorColors = {};
    }

    // ── Mise en évidence ─────────────────────────────────────────────

    highlightCompetitor(name) {
        this.highlightedName = name;
        Object.entries(this.competitorLayers).forEach(([n, data]) => {
            this._applyStyleToEntry(n, data, n === name);
        });

        const entry = this.competitorLayers[name];
        if (entry && entry.polyline) {
            const latlngs = entry.polyline.getLatLngs();
            if (latlngs.length > 0) {
                this.map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
            }
        }
    }

    clearHighlight() {
        this.highlightedName = null;
        Object.entries(this.competitorLayers).forEach(([n, data]) => {
            this._applyStyleToEntry(n, data, true);
        });
        if (this._tempPenLayer) {
            this.map.removeLayer(this._tempPenLayer);
            this._tempPenLayer = null;
        }
    }

    focusOnPenalty(name, pen, competitorTracks = null) {
        this.highlightCompetitor(name);

        let bounds = null;

        if (this._tempPenLayer) {
            this.map.removeLayer(this._tempPenLayer);
            this._tempPenLayer = null;
        }

        if (pen.type === 'WPT_MISSED' && pen.waypoint) {
            const w = pen.waypoint;
            const lat = w.lat;
            const lon = w.lng !== undefined ? w.lng : w.lon;
            bounds = L.latLngBounds([[lat, lon], [lat, lon]]);

            L.popup({ autoClose: false })
                .setLatLng([lat, lon])
                .setContent(`<div style="color:#d63031; font-weight:bold; text-align:center;">${w.name}<br/>WP Manqué</div>`)
                .openOn(this.map);
                
            // The popup acts as the temp layer to be cleared if clicked elsewhere or re-highlighted
            this._tempPenLayer = this.map._popup;
        }
        else if (pen.type === 'OVERSPEED' && pen.startTime && pen.lastTime && competitorTracks) {
            const seg = competitorTracks.filter(p => p.time >= pen.startTime && p.time <= pen.lastTime);
            if (seg.length > 0) {
                const latlngs = seg.map(p => [p.lat, p.lon]);
                bounds = L.latLngBounds(latlngs);
                
                this._tempPenLayer = L.polyline(latlngs, {
                    color: '#ff0000',
                    weight: 8,
                    opacity: 0.9,
                    className: 'pulse-line'
                }).addTo(this.map);

                // Add a small popup indicating speed
                const midPoint = latlngs[Math.floor(latlngs.length / 2)];
                if (midPoint) {
                    L.popup({ autoClose: true })
                        .setLatLng(midPoint)
                        .setContent(`<div style="color:#ff0000; font-weight:bold;">Survitesse</div>`)
                        .openOn(this.map);
                }
            }
        }

        if (bounds && bounds.isValid()) {
            this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }

    // ── Styles internes ───────────────────────────────────────────────

    _applyStyleToEntry(name, data, isActive) {
        const { polyline, group } = data;
        if (!polyline) return;

        // Mise à jour de l'opacité et de l'épaisseur
        polyline.setStyle({
            opacity: isActive ? 1 : 0.12,
            weight: isActive ? 5 : 3
        });

        // Gestion de l'ordre d'affichage (Z-index)
        if (isActive) {
            group.bringToFront();
        }
    }

    _wptColor(type) {
        const colors = {
            dss: '#2ECC71', ass: '#E74C3C',
            dz: '#F39C12',  fz: '#27AE60',
            wpm: '#3498DB', wpe: '#3498DB', wpv: '#9B59B6',
            wps: '#E67E22', wpn: '#C0392B', wpc: '#1ABC9C',
            checkpoint: '#1ABC9C',
            dn: '#95A5A6', fn: '#95A5A6',
            dt: '#BDC3C7', ft: '#BDC3C7'
        };
        return colors[(type || '').toLowerCase()] || '#3498DB';
    }
}
