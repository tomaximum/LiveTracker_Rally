/**
 * MapCanvas — Rendu de carte sur un canvas 2D (sans fond OSM, sans CORS)
 * Utilisé pour générer l'image insérée dans la fiche PDF.
 *
 * Légende :
 *  - Trace roadbook      : ligne bleu (#4A90D9), tiretée
 *  - Trace concurrent    : ligne rouge (#E74C3C)
 *  - WP validé           : cercle vert (#00B894) + numéro blanc
 *  - WP raté             : cercle rouge (#D63031) + ×
 *  - Zone survitesse     : segment orange épais (#F39C12) sur la trace concurrent
 *  - DSS                 : triangle vert
 *  - ASS                 : triangle rouge
 */
class MapCanvas {

    /**
     * Dessine la carte sur un canvas et retourne le dataURL (base64 PNG).
     *
     * @param {HTMLCanvasElement} canvas
     * @param {{ waypoints: Array, trackPoints: Array }} roadbook
     * @param {{ tracks: Array, wpLog: Array, penaltiesBox: Array }} competitorResult
     * @returns {string} dataURL
     */
    static renderToCanvas(canvas, roadbook, competitorResult) {
        // Automatically ensure high-res if default small canvas is passed
        if (canvas.width <= 300) canvas.width = 1200;
        if (canvas.height <= 150) canvas.height = 800;

        const W = canvas.width;
        const H = canvas.height;
        const ctx = canvas.getContext('2d');
        const PAD = W * 0.05; // 5% padding
        
        // Dynamic scaling based on canvas size (ref size 800x600)
        const S = Math.min(W / 800, H / 600);

        ctx.clearRect(0, 0, W, H);

        // ── Fond blanc ───────────────────────────────────────────────
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        // ── Projection lat/lon → pixels ───────────────────────────────
        const allPoints = [
            ...(roadbook.trackPoints || []),
            ...(roadbook.waypoints || []),
            ...(competitorResult.tracks || [])
        ].filter(p => p && p.lat && p.lon);

        if (allPoints.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '16px sans-serif';
            ctx.fillText('Aucune donnée géographique', W / 2 - 100, H / 2);
            return canvas.toDataURL('image/png');
        }

        const minLat = Math.min(...allPoints.map(p => p.lat));
        const maxLat = Math.max(...allPoints.map(p => p.lat));
        const minLon = Math.min(...allPoints.map(p => p.lon));
        const maxLon = Math.max(...allPoints.map(p => p.lon));

        const latRange = maxLat - minLat || 0.001;
        const lonRange = maxLon - minLon || 0.001;

        // Ajustement d'aspect : la carte doit garder les proportions
        const drawW = W - PAD * 2;
        const drawH = H - PAD * 2;

        // Correction de distorsion Mercator approx.
        const latMidRad = (minLat + maxLat) / 2 * Math.PI / 180;
        const lonScale = Math.cos(latMidRad);

        const scaleH = drawH / latRange;
        const scaleW = drawW / (lonRange / lonScale);
        const scale = Math.min(scaleH, scaleW);

        const offsetX = PAD + (drawW - lonRange / lonScale * scale) / 2;
        const offsetY = PAD + (drawH - latRange * scale) / 2;

        const toX = lon => offsetX + (lon - minLon) / lonScale * scale;
        const toY = lat => offsetY + (maxLat - lat) * scale;

        // ── Trace Roadbook (bleu tiretée) ─────────────────────────────
        const rbTrack = roadbook.trackPoints || [];
        if (rbTrack.length > 1) {
            ctx.beginPath();
            ctx.setLineDash([8 * S, 5 * S]);
            ctx.strokeStyle = '#4A90D9';
            ctx.lineWidth = 2 * S;
            ctx.globalAlpha = 0.6;
            rbTrack.forEach((p, i) => {
                i === 0 ? ctx.moveTo(toX(p.lon), toY(p.lat)) : ctx.lineTo(toX(p.lon), toY(p.lat));
            });
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }

        // ── Trace concurrent + zones survitesse ───────────────────────
        const tracks = competitorResult.tracks || [];
        const penalties = competitorResult.penaltiesBox || [];

        // Construire un index des intervalles de survitesse (par timestamp)
        const overspeedIntervals = penalties
            .filter(p => p.type === 'OVERSPEED' && p.startTime && p.lastTime)
            .map(p => ({ start: p.startTime, end: p.lastTime }));

        if (tracks.length > 1) {
            // Trace de base
            ctx.beginPath();
            ctx.strokeStyle = '#222222'; // Noir pour la trace pilote
            ctx.lineWidth = 3 * S;
            tracks.forEach((p, i) => {
                i === 0 ? ctx.moveTo(toX(p.lon), toY(p.lat)) : ctx.lineTo(toX(p.lon), toY(p.lat));
            });
            ctx.stroke();

            // Surcouche rouge plus épaisse pour les segments en survitesse
            if (overspeedIntervals.length > 0) {
                ctx.lineWidth = 8 * S; // Plus épais (était 6)
                ctx.strokeStyle = '#E74C3C'; // Rouge (était orange)
                ctx.globalAlpha = 0.85;
                for (let i = 1; i < tracks.length; i++) {
                    const p = tracks[i];
                    const pPrev = tracks[i - 1];
                    const isOver = overspeedIntervals.some(iv => p.time >= iv.start && p.time <= iv.end);
                    if (isOver) {
                        ctx.beginPath();
                        ctx.moveTo(toX(pPrev.lon), toY(pPrev.lat));
                        ctx.lineTo(toX(p.lon), toY(p.lat));
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1;
            }
        }

        // ── Waypoints ─────────────────────────────────────────────────
        const wpLog = competitorResult.wpLog || [];
        const roadbookWpts = roadbook.waypoints || [];

        // Construire un map name → status depuis wpLog
        const wpStatus = {};
        wpLog.forEach(entry => {
            wpStatus[entry.waypoint.name] = entry.status;
        });

        roadbookWpts.forEach((w, idx) => {
            const x = toX(w.lon);
            const y = toY(w.lat);
            const status = wpStatus[w.name]; // 'VALID', 'MISSED', 'NOT_REACHED', undefined
            const type = (w.type || '').toLowerCase();

            if (type === 'dss' || type === 'ass') {
                // Triangle DSS (vert) / ASS (rouge)
                const color = type === 'dss' ? '#2ECC71' : '#E74C3C';
                MapCanvas._drawTriangle(ctx, x, y, 12 * S, color);
                MapCanvas._drawLabel(ctx, w.name || 'DSS', x, y - (18 * S), '#333', 12 * S);
            } else {
                // Cercle coloré selon statut
                const fillColor = status === 'VALID' ? '#00B894'
                    : status === 'MISSED' ? '#D63031'
                    : status === 'NOT_REACHED' ? '#D63031'
                    : '#95A5A6'; // gris = non encore atteint dans le log

                const r = 8 * S;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = fillColor;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2 * S;
                ctx.stroke();

                // Label numéro
                if (status === 'MISSED' || status === 'NOT_REACHED') {
                    // Croix ×
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${Math.round(11 * S)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('×', x, y);
                } else {
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${Math.round(9 * S)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(w.name || String(idx + 1), x, y);
                }
            }
        });

        // ── Légende ───────────────────────────────────────────────────
        MapCanvas._drawLegend(ctx, W, H, S);

        return canvas.toDataURL('image/png', 1.0);
    }

    static _drawTriangle(ctx, x, y, size, color) {
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y + size * 0.7);
        ctx.lineTo(x - size, y + size * 0.7);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    static _drawLabel(ctx, text, x, y, color = '#333', fontSize = 9) {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.round(fontSize)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    static _drawLegend(ctx, W, H, S) {
        const items = [
            { color: '#4A90D9', label: 'Roadbook', dash: true },
            { color: '#222222', label: 'Trace concurrent' },
            { color: '#E74C3C', label: 'Survitesse', thick: true },
            { color: '#00B894', label: 'WP validé', circle: true },
            { color: '#D63031', label: 'WP raté', circle: true },
            { color: '#2ECC71', label: 'DSS', triangle: true },
            { color: '#E74C3C', label: 'ASS', triangle: true },
        ];

        const legW = 160 * S;
        const legItemH = 22 * S;
        const legPad = 12 * S;
        const lx = W - legW - 20 * S;
        let ly = H - (items.length * legItemH) - 20 * S;

        // Ombre portée de la légende
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 10 * S;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillRect(lx - legPad, ly - legPad, legW + legPad * 2, items.length * legItemH + legPad * 2);
        
        // Reset l'ombre pour le texte et les tracés
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(lx - legPad, ly - legPad, legW + legPad * 2, items.length * legItemH + legPad * 2);

        items.forEach(item => {
            ctx.save();
            if (item.circle) {
                ctx.beginPath();
                ctx.arc(lx + 8 * S, ly + 2 * S, 7 * S, 0, Math.PI * 2);
                ctx.fillStyle = item.color;
                ctx.fill();
            } else if (item.triangle) {
                MapCanvas._drawTriangle(ctx, lx + 8 * S, ly + 2 * S, 7 * S, item.color);
            } else {
                ctx.beginPath();
                ctx.setLineDash(item.dash ? [6 * S, 4 * S] : []);
                ctx.strokeStyle = item.color;
                ctx.lineWidth = item.thick ? 6 * S : 3 * S; // Augmenté pour la légende 'thick'
                ctx.moveTo(lx, ly + 2 * S);
                ctx.lineTo(lx + 20 * S, ly + 2 * S);
                ctx.stroke();
            }
            ctx.restore();
            ctx.fillStyle = '#222';
            ctx.font = `${Math.round(12 * S)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, lx + 30 * S, ly + 2 * S);
            ly += legItemH;
        });
    }
}

