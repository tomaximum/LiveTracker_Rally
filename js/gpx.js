// ─── GPX Parser (V2 Restored with Ranking Compat) ─────────────────────────
'use strict';

window.parseGPX = function(xmlText) {
    const parser = new DOMParser();
    // application/xml est vital pour faire marcher querySelectorAll sur les namespaces dans Chrome !
    const doc = parser.parseFromString(xmlText, 'application/xml');
    
    const points = [];

    // Track points (most common)
    const trkpts = doc.querySelectorAll('trkpt');
    if (trkpts.length > 0) {
        trkpts.forEach((pt, index) => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) {
                const time = pt.querySelector('time');
                const ele = pt.querySelector('ele');
                let t = null;
                if (time && time.textContent) {
                    t = new Date(time.textContent).getTime();
                }
                const e = (ele && ele.textContent) ? parseFloat(ele.textContent) : null;
                // Fournir "lon" pour ScoringEngine (v2.3.1), "lng" pour Leaflet
                points.push({ id: index, lat, lon: lng, lng: lng, time: t, ele: e });
            }
        });
        const waypoints = parseWaypoints(xmlText);
        return { route: points, trackPoints: points, routePoints: points, waypoints };
    }

    // Route points (often used by TerraPirata for the curvy roadbook trace!)
    const rtepts = doc.querySelectorAll('rtept');
    if (rtepts.length > 0) {
        rtepts.forEach((pt, index) => {
            const lat = parseFloat(pt.getAttribute('lat'));
            const lng = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lng)) {
                const ele = pt.querySelector('ele');
                const e = ele && ele.textContent ? parseFloat(ele.textContent) : null;
                points.push({ id: index, lat, lon: lng, lng: lng, ele: e });
            }
        });
        const waypoints = parseWaypoints(xmlText);
        return { route: points, trackPoints: points, routePoints: points, waypoints };
    }

    // Only waypoints
    const waypoints = parseWaypoints(xmlText);
    return { route: [], trackPoints: [], routePoints: [], waypoints };
};

// Injection du module global
window.GPXParser = {
    parse: window.parseGPX
};

function parseWaypoints(xmlText) {
    const waypoints = [];
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
                const kmRegex = /(\d+[.,]\d+|\d+)\s*(k|km)/i;
                let kmTarget = `${name} ${cmtMatch ? cmtMatch[1] : ''} ${descMatch ? descMatch[1] : ''}`;
                const kmMatch = kmTarget.match(kmRegex);
                if (kmMatch) {
                    km = kmMatch[1].replace(',', '.') + ' km';
                }

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
                else if (symMatch) type = symMatch[1].trim(); 
                
                const orMappings = {
                    'dn': 'Début Neutra (DN)',
                    'fn': 'Fin Neutra (FN)',
                    'dt': 'Début Transfert (DT)',
                    'ft': 'Fin Transfert (FT)',
                    'neutralization': 'Début Neutra (DN)',
                    'timecontrol': 'Début Transfert (DT)',
                    'dz': 'Début Zone (DZ)',
                    'fz': 'Fin Zone (FZ)',
                    'wpv': 'WP Visible (WPV)',
                    'wpm': 'WP Masqué (WPM)',
                    'wpe': 'WP Éclipse (WPE)',
                    'wps': 'WP Sécurité (WPS)',
                    'wpn': 'WP Navigation (WPN)',
                    'wpc': 'WP Caché (WPC)',
                    'wpp': 'WP Précision (WPP)',
                    'dss': 'Début Spéciale (DSS)',
                    'ass': 'Arrivée Spéciale (ASS)'
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
                
                let validationRadius = undefined; 
                let openingRadius = undefined;    
                
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
                
                if (!wpvMatch && !dzMatch) {
                    const extsMatch = innerXml.match(/<extensions>([\s\S]*?)<\/extensions>/i);
                    if (extsMatch) {
                        const clearMatch = extsMatch[1].match(/clear="([^"]+)"/i);
                        const openMatch  = extsMatch[1].match(/open="([^"]+)"/i);
                        if (clearMatch) validationRadius = parseFloat(clearMatch[1]);
                        if (openMatch)  openingRadius    = parseFloat(openMatch[1]);
                    }
                }

                // Fournir "lon" et "lng" pour garantir la rétro-compatibilité avec le bridge Scoring
                waypoints.push({ lat, lng, lon: lng, name, type, validationRadius, openingRadius, km });
            }
        }
    }
    return waypoints;
}
