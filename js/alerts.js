// ─── Alert Engine ─────────────────────────────────────────────────────────────
'use strict';

const AlertType = {
    OFF_ROUTE: 'off_route',
    IMMOBILE: 'immobile',
    OFFLINE: 'offline',
    RECONNECTED: 'reconnected',
    MOVING_AGAIN: 'moving_again',
    BACK_ON_ROUTE: 'back_on_route'
};

class AlertEngine {
    constructor(settings) {
        this.settings = settings; // { offRouteThresh (m), immobileThresh (min) }
        this.activeAlerts = new Map(); // participantId → Set of AlertType
        this.onAlert = null;   // callback(alert)
        this.onResolve = null; // callback(alert)
    }

    updateSettings(settings) {
        this.settings = { ...this.settings, ...settings };
    }

    /**
     * Process a participant update. Returns any new alerts.
     * participant: { id, name, lat, lng, lastMoved, history: [{lat,lng,ts}] }
     * routePoints: [{lat,lng}]
     */
    check(participant, routePoints) {
        const alerts = [];
        const now = Date.now();
        const pid = participant.id;

        if (!this.activeAlerts.has(pid)) this.activeAlerts.set(pid, new Set());
        const active = this.activeAlerts.get(pid);

        // ── Off-route check ──────────────────────────────────────────────────
        if (routePoints && routePoints.length > 1) {
            const dist = minDistanceToRoute({ lat: participant.lat, lng: participant.lng }, routePoints);
            const thresh = this.settings.offRouteThresh;

            if (dist > thresh && !active.has(AlertType.OFF_ROUTE)) {
                active.add(AlertType.OFF_ROUTE);
                const alert = {
                    type: AlertType.OFF_ROUTE,
                    participantId: pid,
                    participantName: participant.name,
                    message: `⚠️ ${participant.name} s'écarte de ${Math.round(dist)} m de la trace`,
                    dist: Math.round(dist),
                    ts: now,
                    color: '#f59e0b'
                };
                alerts.push(alert);
                this.onAlert && this.onAlert(alert);
            } else if (dist <= thresh && active.has(AlertType.OFF_ROUTE)) {
                active.delete(AlertType.OFF_ROUTE);
                const alert = {
                    type: AlertType.BACK_ON_ROUTE,
                    participantId: pid,
                    participantName: participant.name,
                    message: `✅ ${participant.name} est revenu sur la trace`,
                    ts: now,
                    color: '#10b981'
                };
                alerts.push(alert);
                this.onResolve && this.onResolve(alert);
            }
        }

        // ── Immobility check ─────────────────────────────────────────────────
        const immobileMs = this.settings.immobileThresh * 60 * 1000;
        const lastMoved = participant.lastMoved || participant.connectedAt || now;
        const stationaryDuration = now - lastMoved;

        if (stationaryDuration > immobileMs && !active.has(AlertType.IMMOBILE)) {
            active.add(AlertType.IMMOBILE);
            const mins = Math.round(stationaryDuration / 60000);
            const alert = {
                type: AlertType.IMMOBILE,
                participantId: pid,
                participantName: participant.name,
                message: `🔴 ${participant.name} n'a pas bougé depuis ${mins} min`,
                mins,
                ts: now,
                color: '#ef4444'
            };
            alerts.push(alert);
            this.onAlert && this.onAlert(alert);
        } else if (stationaryDuration <= immobileMs && active.has(AlertType.IMMOBILE)) {
            active.delete(AlertType.IMMOBILE);
            const alert = {
                type: AlertType.MOVING_AGAIN,
                participantId: pid,
                participantName: participant.name,
                message: `✅ ${participant.name} a repris du mouvement`,
                ts: now,
                color: '#10b981'
            };
            alerts.push(alert);
            this.onResolve && this.onResolve(alert);
        }

        return alerts;
    }

    /**
     * Manages offline/online status as an alert.
     */
    setOffline(pid, name, isOffline) {
        if (!this.activeAlerts.has(pid)) this.activeAlerts.set(pid, new Set());
        const active = this.activeAlerts.get(pid);
        const now = Date.now();

        if (isOffline && !active.has(AlertType.OFFLINE)) {
            active.add(AlertType.OFFLINE);
            const alert = {
                type: AlertType.OFFLINE,
                participantId: pid,
                participantName: name,
                message: `⚪ ${name} est Hors Ligne (Signal perdu)`,
                ts: now,
                color: '#94a3b8'
            };
            this.onAlert && this.onAlert(alert);
            return alert;
        } else if (!isOffline && active.has(AlertType.OFFLINE)) {
            active.delete(AlertType.OFFLINE);
            const alert = {
                type: AlertType.RECONNECTED,
                participantId: pid,
                participantName: name,
                message: `✅ ${name} est de nouveau en ligne`,
                ts: now,
                color: '#10b981'
            };
            this.onResolve && this.onResolve(alert);
            return alert;
        }
        return null;
    }

    getActiveAlertsForParticipant(pid) {
        return this.activeAlerts.get(pid) || new Set();
    }

    getWorstStatus(pid) {
        const active = this.activeAlerts.get(pid);
        if (!active || active.size === 0) return 'ok';
        if (active.has(AlertType.OFFLINE)) return 'offline';
        if (active.has(AlertType.IMMOBILE)) return 'immobile';
        if (active.has(AlertType.OFF_ROUTE)) return 'off_route';
        return 'ok';
    }

    clearParticipant(pid) {
        this.activeAlerts.delete(pid);
    }

    clearAll() {
        this.activeAlerts.clear();
    }
}
