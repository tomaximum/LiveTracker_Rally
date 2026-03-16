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

    console.log('Parsing GPX content, length:', xmlText.length);

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
                const descMatch = innerXml.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
                const cmtMatch  = innerXml.match(/<cmt[^>]*>([\s\S]*?)<\/cmt>/i);
                
                if (nameMatch) name = nameMatch[1].trim();
                
                let km = '';
                // Extract KM from name, desc, or cmt
                const kmRegex = /(\d+[.,]\d+|\d+)\s*(k|km)/i;
                let kmTarget = `${name} ${cmtMatch ? cmtMatch[1] : ''} ${descMatch ? descMatch[1] : ''}`;
                const kmMatch = kmTarget.match(kmRegex);
                if (kmMatch) {
                    km = kmMatch[1].replace(',', '.') + ' km';
                }

                // If name is just a number, try to use desc or cmt for more detail
                if (/^\d+$/.test(name)) {
                    if (descMatch) name = `${name}: ${descMatch[1].trim()}`;
                    else if (cmtMatch) name = `${name}: ${cmtMatch[1].trim()}`;
                } else if (!nameMatch) {
                    if (descMatch) name = descMatch[1].trim();
                    else if (cmtMatch) name = cmtMatch[1].trim();
                }

                let type = '';
                const typeMatch = innerXml.match(/<type[^>]*>([\s\S]*?)<\/type>/i);
                const symMatch  = innerXml.match(/<sym[^>]*>([\s\S]*?)<\/sym>/i);
                
                if (typeMatch) type = typeMatch[1].trim();
                else if (symMatch) type = symMatch[1].trim(); // Fallback to sym
                
                // Map OpenRally tags to readable types
                const orMappings = {
                    'dz': 'Début Zone (DZ)',
                    'fz': 'Fin Zone (FZ)',
                    'wpv': 'WP Validation (WPV)',
                    'wpm': 'WP Masqué (WPM)',
                    'wps': 'WP Sécurité (WPS)',
                    'wpc': 'WP Contrôle (WPC)',
                    'dss': 'Début Spéciale (DSS)',
                    'ass': 'Assistance (ASS)'
                };

                for (const [tag, label] of Object.entries(orMappings)) {
                    const regex = new RegExp(`<(openrally:)?${tag}`, 'i');
                    if (regex.test(innerXml)) {
                        type = label;
                        const speedMatch = innerXml.match(/<openrally:speed[^>]*>([\s\S]*?)<\/openrally:speed>/i);
                        if (speedMatch) {
                            type += ` [Max ${speedMatch[1].trim()}]`;
                        }
                        break;
                    }
                }
                
                if (!type && (typeMatch || symMatch)) {
                    console.log(`Using standard Type/Sym: ${type} for WP ${name}`);
                }
                
                let validationRadius = undefined; 
                let openingRadius = undefined;    
                
                // Match <openrally:wpv clear="50" open="800"> or <openrally:dz ...>
                // Using [\s\S]*? so it handles attributes across newlines
                const wpvMatch = innerXml.match(/<openrally:wpv([\s\S]*?)(\/?>)/i);
                if (wpvMatch) {
                    const clearMatch = wpvMatch[1].match(/clear="([^"]+)"/i);
                    const openMatch  = wpvMatch[1].match(/open="([^"]+)"/i);
                    if (clearMatch) validationRadius = parseFloat(clearMatch[1]);
                    if (openMatch)  openingRadius    = parseFloat(openMatch[1]);
                }
                
                const dzMatch = innerXml.match(/<openrally:dz([\s\S]*?)(\/?>)/i);
                if (dzMatch) {
                    const clearMatch = dzMatch[1].match(/clear="([^"]+)"/i);
                    const openMatch  = dzMatch[1].match(/open="([^"]+)"/i);
                    if (clearMatch) validationRadius = parseFloat(clearMatch[1]);
                    if (openMatch)  openingRadius    = parseFloat(openMatch[1]);
                }
                
                // Generic fallback: look anywhere in extensions
                if (!wpvMatch && !dzMatch) {
                    const extsMatch = innerXml.match(/<extensions>([\s\S]*?)<\/extensions>/i);
                    if (extsMatch) {
                        const clearMatch = extsMatch[1].match(/clear="([^"]+)"/i);
                        const openMatch  = extsMatch[1].match(/open="([^"]+)"/i);
                        if (clearMatch) validationRadius = parseFloat(clearMatch[1]);
                        if (openMatch)  openingRadius    = parseFloat(openMatch[1]);
                    }
                }

                waypoints.push({ lat, lng, name, type, validationRadius, openingRadius, km });
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
