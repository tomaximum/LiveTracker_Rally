// ─── GPX Parser ───────────────────────────────────────────────────────────────
'use strict';

/**
 * Parse a GPX XML string → { route: [{lat,lng,ele?,time?}], waypoints: [{lat,lng,name,validationRadius,openingRadius}] }
 * Supports <trkpt> (track), <rtept> (route), <wpt> (OpenRally waypoints).
 */
function parseGPX(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        console.warn('GPX xml parser error, will attempt regex fallback');
    }

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
        // Also parse waypoints even if track exists
        const waypoints = parseWaypoints(xmlText);
        return { route: points, waypoints };
    }

    // Route points
    const rtepts = doc.querySelectorAll('rtept');
    if (rtepts.length > 0) {
        rtepts.forEach(pt => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) points.push({ lat, lng });
        });
        const waypoints = parseWaypoints(xmlText);
        return { route: points, waypoints };
    }

    // Only waypoints (no track/route)
    const waypoints = parseWaypoints(xmlText);
    if (waypoints.length > 0) {
        return { route: [], waypoints };
    }

    throw new Error('No track/route or waypoints found in GPX');
}

/**
 * Parse OpenRally <wpt> blocks from raw XML text using regex for robustness.
 * Extracts name, lat, lng, validationRadius (clear), openingRadius (open).
 */
function parseWaypoints(xmlText) {
    const waypoints = [];
    
    // Match all <wpt ...> ... </wpt> blocks
    const wptRegex = /<wpt([^>]*)>([\s\S]*?)<\/wpt>/gi;
    let match;
    
    while ((match = wptRegex.exec(xmlText)) !== null) {
        const attrs = match[1];
        const innerXml = match[2];
        
        const latMatch = attrs.match(/lat="([^"]+)"/i);
        const lonMatch = attrs.match(/lon="([^"]+)"/i);
        
        if (latMatch && lonMatch) {
            const lat = parseFloat(latMatch[1]);
            const lng = parseFloat(lonMatch[1]);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                let name = 'WP';
                const nameMatch = innerXml.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
                if (nameMatch) name = nameMatch[1].trim();
                
                let validationRadius = 200; // default 200m
                let openingRadius = 800;    // default 800m
                
                // Match <openrally:wpv clear="50" open="800"> or <openrally:dz ...>
                // Using [\s\S]*? so it handles attributes across newlines
                const wpvMatch = innerXml.match(/<openrally:wpv([\s\S]*?)(\/?>)/i);
                if (wpvMatch) {
                    const clearMatch = wpvMatch[1].match(/clear="([^"]+)"/i);
                    const openMatch  = wpvMatch[1].match(/open="([^"]+)"/i);
                    if (clearMatch) validationRadius = parseFloat(clearMatch[1]) || validationRadius;
                    if (openMatch)  openingRadius    = parseFloat(openMatch[1])  || openingRadius;
                }
                
                const dzMatch = innerXml.match(/<openrally:dz([\s\S]*?)(\/?>)/i);
                if (dzMatch) {
                    const clearMatch = dzMatch[1].match(/clear="([^"]+)"/i);
                    const openMatch  = dzMatch[1].match(/open="([^"]+)"/i);
                    if (clearMatch) validationRadius = parseFloat(clearMatch[1]) || validationRadius;
                    if (openMatch)  openingRadius    = parseFloat(openMatch[1])  || openingRadius;
                }
                
                // Generic fallback: look anywhere in extensions
                if (!wpvMatch && !dzMatch) {
                    const extsMatch = innerXml.match(/<extensions>([\s\S]*?)<\/extensions>/i);
                    if (extsMatch) {
                        const clearMatch = extsMatch[1].match(/clear="([^"]+)"/i);
                        const openMatch  = extsMatch[1].match(/open="([^"]+)"/i);
                        if (clearMatch) validationRadius = parseFloat(clearMatch[1]) || validationRadius;
                        if (openMatch)  openingRadius    = parseFloat(openMatch[1])  || openingRadius;
                    }
                }

                waypoints.push({ lat, lng, name, validationRadius, openingRadius });
            }
        }
    }
    
    return waypoints;
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
