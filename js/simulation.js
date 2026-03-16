// ─── Simulation Engine ────────────────────────────────────────────────────────
'use strict';

const DEMO_PARTICIPANTS = [
    { id: 'p1', name: 'Pilote 1 – Dubois', color: '#3b82f6', avatar: '🏍️', fraction: 0.05, deviation: 0, speed: 65 },
    { id: 'p2', name: 'Pilote 2 – Martin', color: '#8b5cf6', avatar: '🏍️', fraction: 0.12, deviation: 0, speed: 72 },
    { id: 'p3', name: 'Pilote 3 – Bernard', color: '#f59e0b', avatar: '🚗', fraction: 0.08, deviation: 0, speed: 58 },
    { id: 'p4', name: 'Pilote 4 – Lefebvre', color: '#10b981', avatar: '🏍️', fraction: 0.18, deviation: 0, speed: 80 },
    { id: 'p5', name: 'Pilote 5 – Moreau', color: '#ef4444', avatar: '🏍️', fraction: 0.02, deviation: 0, speed: 0 }
];

class SimulationEngine {
    constructor() {
        this.participants = DEMO_PARTICIPANTS.map(p => ({ ...p }));
        this.routePoints = [];
        this.interval = null;
        this.onUpdate = null; // callback(participants)
        this.tickMs = 2000;
        this.deviationTarget = {}; // pid → target deviation metres
        this.stoppedUntil = {}; // pid → timestamp when they resume
        this._initDeviationScenarios();
    }

    _initDeviationScenarios() {
        // p3 will deviate significantly after a while
        this.deviationTarget['p3'] = 0; // start on route
        // p5 is stopped from the start
        this.stoppedUntil['p5'] = Date.now() + 999999999; // effectively stopped
        this.participants.find(p => p.id === 'p5').stopped = true;
        this.participants.find(p => p.id === 'p5').lastMoved = Date.now() - 6 * 60 * 1000;
    }

    setRoute(routePoints) {
        this.routePoints = routePoints;
        if (routePoints.length > 0) {
            this.participants.forEach(p => {
                const pos = interpolateRoute(routePoints, p.fraction);
                if (pos) { p.lat = pos.lat; p.lng = pos.lng; }
            });
        }
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(() => this._tick(), this.tickMs);
        this._tick();
    }

    stop() {
        if (this.interval) { clearInterval(this.interval); this.interval = null; }
    }

    _tick() {
        if (!this.routePoints.length) return;
        const now = Date.now();

        // After 30s, make p3 deviate
        if (!this._deviationStarted && (now - this._startTs > 30000)) {
            this._deviationStarted = true;
            this.deviationTarget['p3'] = 350; // 350m deviation
        }

        this.participants.forEach(p => {
            if (p.stopped) {
                p.lastMoved = p.lastMoved || now - 6 * 60 * 1000;
                return;
            }

            // Advance fraction based on speed
            const distPerTick = (p.speed / 3.6) * (this.tickMs / 1000); // metres
            const totalLen = this._routeLength();
            if (totalLen > 0) {
                p.fraction = Math.min(1, p.fraction + distPerTick / totalLen);
            }

            const base = interpolateRoute(this.routePoints, p.fraction);
            if (!base) return;

            // Apply deviation (perpendicular offset)
            const target = this.deviationTarget[p.id] || 0;
            if (p.deviation === undefined) p.deviation = 0;
            p.deviation += (target - p.deviation) * 0.08; // smooth

            // Compute perpendicular offset
            const { lat, lng } = this._applyOffset(base, p.fraction, p.deviation);
            const prev = { lat: p.lat || lat, lng: p.lng || lng };

            p.lat = lat;
            p.lng = lng;
            p.lastMoved = now;

            // Speed variation
            p.speed = Math.max(20, p.speed + (Math.random() - 0.5) * 5);

            // Compute actual speed for display
            const distMoved = haversineDistance(prev, { lat, lng });
            p.displaySpeed = Math.round((distMoved / (this.tickMs / 1000)) * 3.6);

            if (p.fraction >= 1) {
                p.stopped = true;
                p.lastMoved = now;
                p.displaySpeed = 0;
            }
        });

        this.onUpdate && this.onUpdate(this.participants.map(p => ({ ...p })));
    }

    _startTs = Date.now();

    _routeLength() {
        let len = 0;
        for (let i = 1; i < this.routePoints.length; i++) {
            len += haversineDistance(this.routePoints[i - 1], this.routePoints[i]);
        }
        return len;
    }

    _applyOffset(base, fraction, offsetMetres) {
        if (!offsetMetres || Math.abs(offsetMetres) < 0.1) return base;

        // Get direction of travel
        const fNext = Math.min(1, fraction + 0.01);
        const next = interpolateRoute(this.routePoints, fNext);
        if (!next) return base;

        const br = bearing(base, next) * Math.PI / 180;
        // Perpendicular = bearing + 90°
        const perpBearing = br + Math.PI / 2;

        const cosLat = Math.cos(base.lat * Math.PI / 180);
        const dLat = (offsetMetres * Math.cos(perpBearing)) / R * (180 / Math.PI);
        const dLng = (offsetMetres * Math.sin(perpBearing)) / (R * cosLat) * (180 / Math.PI);

        return { lat: base.lat + dLat, lng: base.lng + dLng };
    }
}
