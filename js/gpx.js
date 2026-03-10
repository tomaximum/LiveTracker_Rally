// ─── GPX Parser ───────────────────────────────────────────────────────────────
'use strict';

/**
 * Parse a GPX XML string → array of {lat, lng, ele?, time?}
 * Supports <trkpt> (track), <rtept> (route), <wpt> (waypoints).
 */
function parseGPX(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error('Invalid GPX file');

    const points = [];

    // Track points (most common)
    const trkpts = doc.querySelectorAll('trkpt');
    if (trkpts.length > 0) {
        trkpts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) {
                const ele = pt.querySelector('ele');
                const time = pt.querySelector('time');
                points.push({
                    lat, lng,
                    ele: ele ? parseFloat(ele.textContent) : undefined,
                    time: time ? time.textContent : undefined
                });
            }
        });
        return points;
    }

    // Route points
    const rtepts = doc.querySelectorAll('rtept');
    if (rtepts.length > 0) {
        rtepts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng });
        });
        return points;
    }

    // Waypoints fallback
    doc.querySelectorAll('wpt').forEach(pt => {
        const lat = parseFloat(pt.getAttribute('lat'));
        const lng = parseFloat(pt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng });
    });

    if (points.length === 0) throw new Error('No track/route points found in GPX');
    return points;
}

/**
 * Simplify a route using Ramer-Douglas-Peucker for performance.
 * epsilon in metres.
 */
function simplifyRoute(points, epsilon = 10) {
    if (points.length <= 2) return points;

    function dpSimplify(pts, eps) {
        if (pts.length <= 2) return pts;
        let maxDist = 0, maxIdx = 0;
        for (let i = 1; i < pts.length - 1; i++) {
            const d = distanceToSegment(pts[i], pts[0], pts[pts.length - 1]);
            if (d > maxDist) { maxDist = d; maxIdx = i; }
        }
        if (maxDist > eps) {
            const left = dpSimplify(pts.slice(0, maxIdx + 1), eps);
            const right = dpSimplify(pts.slice(maxIdx), eps);
            return [...left.slice(0, -1), ...right];
        }
        return [pts[0], pts[pts.length - 1]];
    }

    return dpSimplify(points, epsilon);
}
