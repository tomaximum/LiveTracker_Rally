// ─── Geo utilities ────────────────────────────────────────────────────────────
'use strict';

const R = 6371000; // Earth radius in metres

/**
 * Haversine distance between two {lat,lng} points (metres)
 */
function haversineDistance(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Converts {lat,lng} to flat XY metres relative to a reference point.
 * Good approximation for short distances (< 50 km).
 */
function toXY(pt, ref) {
  const cosLat = Math.cos(ref.lat * Math.PI / 180);
  return {
    x: (pt.lng - ref.lng) * Math.PI / 180 * R * cosLat,
    y: (pt.lat - ref.lat) * Math.PI / 180 * R
  };
}

/**
 * Distance (metres) from point P to segment [A, B].
 */
function distanceToSegment(P, A, B) {
  const ref = A;
  const p = toXY(P, ref);
  const a = { x: 0, y: 0 };
  const b = toXY(B, ref);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // A === B
    return Math.hypot(p.x, p.y);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

/**
 * Minimum distance (metres) from point P to the polyline defined by routePoints [{lat,lng}].
 */
function minDistanceToRoute(P, routePoints) {
  if (!routePoints || routePoints.length === 0) return Infinity;
  if (routePoints.length === 1) return haversineDistance(P, routePoints[0]);

  let minDist = Infinity;
  for (let i = 0; i < routePoints.length - 1; i++) {
    const d = distanceToSegment(P, routePoints[i], routePoints[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Interpolate a position along the route at a given fraction [0..1].
 */
function interpolateRoute(routePoints, fraction) {
  if (!routePoints || routePoints.length === 0) return null;
  if (fraction <= 0) return routePoints[0];
  if (fraction >= 1) return routePoints[routePoints.length - 1];

  // Total length
  let lengths = [0];
  for (let i = 1; i < routePoints.length; i++) {
    lengths.push(lengths[i - 1] + haversineDistance(routePoints[i - 1], routePoints[i]));
  }
  const total = lengths[lengths.length - 1];
  const target = fraction * total;

  for (let i = 1; i < routePoints.length; i++) {
    if (lengths[i] >= target) {
      const segFrac = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
      return {
        lat: routePoints[i - 1].lat + segFrac * (routePoints[i].lat - routePoints[i - 1].lat),
        lng: routePoints[i - 1].lng + segFrac * (routePoints[i].lng - routePoints[i - 1].lng)
      };
    }
  }
  return routePoints[routePoints.length - 1];
}

/**
 * Bearing in degrees from A to B
 */
function bearing(A, B) {
  const dLng = (B.lng - A.lng) * Math.PI / 180;
  const lat1 = A.lat * Math.PI / 180;
  const lat2 = B.lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
