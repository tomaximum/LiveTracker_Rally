// Removed import

class ScoringEngine {
    constructor(roadbook, config) {
        this.roadbook = roadbook;
        this.config = config;
    }

    getMissedWptPenalty(type) {
        let t = type ? type.toLowerCase() : '';
        if (this.config.wptPenalties[t] !== undefined) {
            return this.config.wptPenalties[t];
        }
        return this.config.wptPenalties.default || 900;
    }

    calculateCompetitor(competitor) {
        let tracks = competitor.tracks;
        let wpts = this.roadbook.waypoints;

        let result = {
            grossTime: 0,
            neutralizedTime: 0,
            netTime: 0,
            penaltiesBox: [],
            totalPenalties: 0,
            wpLog: [],
            score: 0,
            distanceTraveled: 0
        };

        if (tracks.length < 2) return result;

        let nextWptIdx = 0;
        let p_prev = tracks[0];
        
        // Status vars
        let inSpecial = false;
        let inDZ = false;
        let currentSpeedLimit = this.config.speedLimit;
        
        let inNeutral = false;
        let neutralStartPt = null;
        let neutralWpt = null;

        // Variables pour le mode Précision (Corridor)
        let isPrecisionMode = (this.config.mode === 'precision');
        
        // v2.9.0.008: Sélectionner uniquement un tracé GPX réel (trkpt/rtept sans timestamp)
        // trackPoints contient uniquement les trkpt AVEC timestamp (traces pilotes)
        // routePoints (= this.roadbook.route) contient les trkpt/rtept SANS timestamp (roadbook organisateur)
        let idealPath = (this.roadbook.route && this.roadbook.route.length >= 2) ? this.roadbook.route : [];
        let hasRealTrack = idealPath.length >= 2;
        
        // v2.9.0.008: Si pas de tracé GPX réel, désactiver le corridor (les lignes droites WP-à-WP
        // ne correspondent pas aux routes et génèrent de faux positifs de 300-1000m)
        if (isPrecisionMode && !hasRealTrack) {
            console.warn('[ScoringEngine] ⚠️ Mode Précision activé mais le Roadbook ne contient pas de tracé GPX (trkpt/rtept). Le calcul de corridor est DÉSACTIVÉ. Pour activer le corridor, utilisez un GPX avec un tracé réel (<trk> ou <rte>).');
            isPrecisionMode = false; // Désactive le scoring corridor pour ce calcul
        }

        // v2.9.0.005: Simplification ultra-légère (RDP) pour éliminer les doublons sans déformer les courbes
        if (isPrecisionMode && idealPath.length > 200) {
            const beforeLen = idealPath.length;
            idealPath = GeoTools.simplifyPath(idealPath, 0.5); // 0.5 mètre de tolérance RDP (v2.9.0.005)
            console.log(`[ScoringEngine] Roadbook nettoyé par RDP : ${beforeLen} pts -> ${idealPath.length} pts`);
        }

        let lastIdealIdx = 0;
        let corridorTol = this.config.corridorTolerance || 20;
        let corridorCoef = this.config.corridorCoef || 1;

        if (isPrecisionMode) {
            console.log(`[ScoringEngine] Mode PRÉCISION / Corridor actif. Tolérance: ${corridorTol}m, Coef: ${corridorCoef}`);
        }

        let dssTime = null;
        let assTime = null;

        for (let i = 1; i < tracks.length; i++) {
            let p_curr = tracks[i];
            
            // Advance distance
            result.distanceTraveled += GeoTools.distance(p_prev.lat, GeoTools._getLon(p_prev), p_curr.lat, GeoTools._getLon(p_curr));

            // 1. Waypoint Validation (Look ahead for missed wpts)
            let lookAheadLimit = Math.min(wpts.length, nextWptIdx + 4);
            for (let j = nextWptIdx; j < lookAheadLimit; j++) {
                let w = wpts[j];
                let d = GeoTools.pointToSegmentDistance(w, p_prev, p_curr);
                
                if (d <= w.clear) {
                    // Validé !
                    w.validationDist = d;
                    w.validationTime = p_curr.time;

                    // v2.9.0.006: Le premier waypoint validé active le scoring de course
                    result.racingStarted = true;

                    // Les WPT précédents sont ratés
                    for (let k = nextWptIdx; k < j; k++) {
                        let missed = wpts[k];
                        result.penaltiesBox.push({
                            type: 'WPT_MISSED',
                            desc: `Waypoint non validé: ${missed.name} (${missed.type.toUpperCase()})`,
                            cost: this.getMissedWptPenalty(missed.type)
                        });
                        result.wpLog.push({ waypoint: missed, status: 'MISSED' });
                    }

                    result.wpLog.push({ waypoint: w, status: 'VALID', dist: d, time: p_curr.time });
                    
                    // State mutations
                    if (w.type === 'dss') {
                        inSpecial = true;
                        dssTime = p_curr.time;
                    }
                    if (w.type === 'ass') {
                        inSpecial = false;
                        assTime = p_curr.time;
                    }

                    if (w.type === 'dz' || w.type === 'fz') {
                         inDZ = (w.type === 'dz');
                         if (inDZ && w.speedLimit) currentSpeedLimit = w.speedLimit;
                         if (!inDZ) currentSpeedLimit = this.config.speedLimit;
                    }

                    if (w.type === 'dn' || w.type === 'dt') {
                        inNeutral = true;
                        neutralStartPt = p_curr;
                        neutralWpt = w;
                        if (w.speedLimit) currentSpeedLimit = w.speedLimit;
                    }

                    if (w.type === 'fn' || w.type === 'ft') {
                        if (inNeutral && neutralStartPt) {
                            let durMs = p_curr.time - neutralStartPt.time;
                            let durS = durMs / 1000;
                            result.neutralizedTime += durS;

                            let allowedMins = neutralWpt.timecontrol || neutralWpt.neutralization;
                            if (allowedMins) {
                                let allowedS = allowedMins * 60;
                                let lateGrace = (this.config.lateNeutralGrace !== undefined) ? this.config.lateNeutralGrace : 60;
                                let late = durS - (allowedS + lateGrace);
                                let early = allowedS - durS;
                                let earlyRate = (this.config.earlyNeutralRate !== undefined) ? this.config.earlyNeutralRate : 5;
                                if (earlyRate > 0) {
                                    if (early > 0) {
                                        result.penaltiesBox.push({
                                            type: 'EARLY_CH',
                                            desc: `Sortie de neutralisation en avance (${Math.round(early)}s)`,
                                            cost: Math.round(early) * earlyRate
                                        });
                                    } else if (late > 0) {
                                        result.penaltiesBox.push({
                                            type: 'LATE_CH',
                                            desc: `Sortie de neutralisation en retard (+${Math.round(late)}s au-delà de la tolérance)`,
                                            cost: Math.round(late)
                                        });
                                    }
                                }
                            }
                        }
                        inNeutral = false;
                        currentSpeedLimit = this.config.speedLimit;
                    }

                    nextWptIdx = j + 1;
                    break;
                }
            }

            // 2. Speed checking
            let v = GeoTools.speed(p_prev, p_curr);
            let limit = currentSpeedLimit;
            if (limit && v > limit) {
                let over = v - limit;
                let dtSeconds = (p_curr.time - p_prev.time) / 1000;
                let pen = over * dtSeconds * this.config.speedCoef;
                let lastPen = result.penaltiesBox[result.penaltiesBox.length - 1];
                if (lastPen && lastPen.type === 'OVERSPEED' && lastPen.limit === limit && (p_curr.time - lastPen.lastTime) < 5000) {
                     lastPen.cost += pen;
                     lastPen.maxOver = Math.max(lastPen.maxOver, over);
                     lastPen.maxSpeed = Math.max(lastPen.maxSpeed || 0, Math.round(v));
                     lastPen.durationSeconds += dtSeconds;
                     lastPen.lastTime = p_curr.time;
                } else {
                     result.penaltiesBox.push({
                        type: 'OVERSPEED',
                        desc: `Survitesse (${Math.round(v)} km/h > ${limit})`,
                        cost: pen,
                        limit: limit,
                        maxOver: over,
                        maxSpeed: Math.round(v),
                        durationSeconds: dtSeconds,
                        startTime: p_prev.time,
                        lastTime: p_curr.time
                    });
                }
            }

            // 3. Corridor / Off-track checking (Mode Précision)
            if (isPrecisionMode && idealPath.length >= 2) {
                let minDist = Infinity;
                let bestIdx = lastIdealIdx;

                let searchStart = Math.max(0, lastIdealIdx - 100); // v2.9.0.006 : Plus de look-back
                let searchEnd = Math.min(idealPath.length - 1, lastIdealIdx + 500);

                for (let k = searchStart; k < searchEnd; k++) {
                    let d = GeoTools.pointToSegmentDistance(p_curr, idealPath[k], idealPath[k+1]);
                    if (d < minDist) {
                        minDist = d;
                        bestIdx = k;
                    }
                }

                if (minDist > 100) {
                    for (let k = 0; k < idealPath.length - 1; k++) {
                        let d = GeoTools.pointToSegmentDistance(p_curr, idealPath[k], idealPath[k+1]);
                        if (d < minDist) {
                            minDist = d;
                            bestIdx = k;
                        }
                    }
                }

                lastIdealIdx = bestIdx;
                p_curr.offTrackDist = minDist;
                p_curr.racingActive = result.racingStarted; // v2.9.0.006: Signal pour le rendu carte

                // On ne pénalise que si la course a commencé
                if (result.racingStarted && minDist > corridorTol) {
                    let dtSeconds = (p_curr.time - p_prev.time) / 1000;
                    let pen = dtSeconds * corridorCoef;
                    let lastPen = result.penaltiesBox[result.penaltiesBox.length - 1];
                    if (lastPen && lastPen.type === 'OFFTRACK' && (p_curr.time - lastPen.lastTime) < 5000) {
                        lastPen.cost += pen;
                        lastPen.maxDist = Math.max(lastPen.maxDist || 0, Math.round(minDist));
                        lastPen.durationSeconds += dtSeconds;
                        lastPen.lastTime = p_curr.time;
                        lastPen.desc = `Sortie de tracé continue (Écart max ${lastPen.maxDist}m, tolérance ${corridorTol}m)`;
                    } else {
                        result.penaltiesBox.push({
                            type: 'OFFTRACK',
                            desc: `Sortie de tracé (${Math.round(minDist)}m > ${corridorTol}m)`,
                            cost: pen,
                            maxDist: Math.round(minDist),
                            durationSeconds: dtSeconds,
                            startTime: p_prev.time,
                            lastTime: p_curr.time
                        });
                    }
                }
            }

            p_prev = p_curr;
        }

        // Check unreached ASS
        for (let j = nextWptIdx; j < wpts.length; j++) {
            let missed = wpts[j];
            result.penaltiesBox.push({
                type: 'WPT_MISSED',
                desc: `Waypoint non atteint: ${missed.name} (${missed.type.toUpperCase()})`,
                cost: this.getMissedWptPenalty(missed.type)
            });
            result.wpLog.push({ waypoint: missed, status: 'NOT_REACHED' });
        }

        // Calculs temps
        if (dssTime && assTime) {
            result.grossTime = (assTime - dssTime) / 1000; // secondes
            result.netTime = result.grossTime - result.neutralizedTime;
        } else if (tracks.length > 0) {
            // mode dégradé si pas de DSS/ASS
            result.grossTime = (tracks[tracks.length-1].time - tracks[0].time) / 1000;
            result.netTime = result.grossTime;
        }

        // Pénalité de temps (Mode Régularité : seul le dépassement est pénalisé)
        result.timePenalty = 0;
        if (this.config.mode === 'regularity' && this.config.maxTimeSeconds > 0) {
            result.timePenalty = Math.max(0, result.netTime - this.config.maxTimeSeconds);
        }

        // Totaux
        result.totalPenalties = result.penaltiesBox.reduce((acc, p) => acc + Math.round(p.cost), 0);
        
        if (this.config.mode === 'regularity') {
            // En régularité, le score est la somme des pénalités (temps + waypoints + survitesse)
            result.score = result.timePenalty + result.totalPenalties;
        } else if (this.config.mode === 'precision') {
            // En mode Précision, on garde le temps net + toutes les pénalités (hors-piste inclus)
            result.score = result.netTime + result.totalPenalties;
        } else {
            // En Time Attack (Scratch), le score est le temps net + pénalités
            result.score = result.netTime + result.totalPenalties;
        }

        return result;
    }

    formatTime(seconds) {
        if (seconds === undefined || seconds === null || isNaN(seconds)) return "N/A";
        const total = Math.max(0, Math.round(seconds));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = Math.floor(total % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}

