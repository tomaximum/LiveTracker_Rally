// Mathématiques et Géospatial

window.haversineDistance = function(p1, p2) {
    if (!p1 || !p2) return 0;
    return GeoTools.distance(p1.lat, p1.lng || p1.lon, p2.lat, p2.lng || p2.lon);
};
class GeoTools {
    static _getLon(p) { return p.lon !== undefined ? p.lon : p.lng; }
    static _getLat(p) { return p.lat; }

    /**
     * Calcule la distance en mètres entre deux coordonnées géographiques
     * Formule de Haversine
     */
    static distance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Rayon de la terre en mètres
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // mètres
    }

    /**
     * Calcule la vitesse en km/h entre deux points horaires
     */
    static speed(pt1, pt2) {
        if (!pt1.time || !pt2.time || pt1.time === pt2.time) return 0;
        const d = this.distance(pt1.lat, this._getLon(pt1), pt2.lat, this._getLon(pt2));
        const t = Math.abs(pt2.time - pt1.time) / 1000;
        return (d / t) * 3.6;
    }

    /**
     * Distance minimale d'un point à un segment géospatial
     */
    static pointToSegmentDistance(p, a, b) {
        const lat2m = 111132;
        const lon2m = 111132 * Math.cos(p.lat * Math.PI / 180);

        const px = this._getLon(p) * lon2m, py = p.lat * lat2m;
        const ax = this._getLon(a) * lon2m, ay = a.lat * lat2m;
        const bx = this._getLon(b) * lon2m, by = b.lat * lat2m;

        const l2 = (ax - bx) ** 2 + (ay - by) ** 2;
        if (l2 === 0) return this.distance(p.lat, this._getLon(p), a.lat, this._getLon(a));

        let t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projx = ax + t * (bx - ax);
        const projy = ay + t * (by - ay);

        return this.distance(p.lat, this._getLon(p), projy / lat2m, projx / lon2m);
    }

    /**
     * Algorithme de Ramer-Douglas-Peucker pour simplifier un tracé
     */
    static simplifyPath(points, epsilon) {
        if (points.length <= 2) return points;

        let dmax = 0;
        let index = 0;
        const end = points.length - 1;

        for (let i = 1; i < end; i++) {
            const d = this.pointToSegmentDistance(points[i], points[0], points[end]);
            if (d > dmax) {
                index = i;
                dmax = d;
            }
        }

        if (dmax > epsilon) {
            const res1 = this.simplifyPath(points.slice(0, index + 1), epsilon);
            const res2 = this.simplifyPath(points.slice(index), epsilon);
            return res1.slice(0, res1.length - 1).concat(res2);
        } else {
            return [points[0], points[end]];
        }
    }
}

