/* ── RallyRanking V2.2 Bridge ─────────────────────────────────────────────── */
window.rrState = {
    roadbook: null,
    pilots: [],
    mode: 'time', // 'regularity' or 'time'
    results: [],
    engine: null,
    map: null
};

document.addEventListener('DOMContentLoaded', () => {
    initRRBridge();
});

function initRRBridge() {
    // Instantiate map if the container exists
    setTimeout(() => {
        if(document.getElementById('main-map') && !window.rrState.map) {
            window.rrState.map = new RallyMap('main-map');
        }
    }, 1000); // Small delay to let Leaflet scripts load

    const dzRoadbook = document.getElementById('dropzone-roadbook');
    const inRoadbook = document.getElementById('input-roadbook');
    const dzPilots = document.getElementById('dropzone-pilots');
    const inPilots = document.getElementById('input-pilots');
    const dateInput = document.getElementById('rr-cfg-date');
    
    // Auto-fill configuration date to today
    if (dateInput && !dateInput.value) {
        const today = new Date();
        dateInput.value = today.toISOString().split('T')[0];
    }

    if (!dzRoadbook || !dzPilots) return;

    // Roadbook
    dzRoadbook.onclick = () => inRoadbook.click();
    dzRoadbook.ondragover = e => { e.preventDefault(); dzRoadbook.style.background = 'rgba(255,255,255,0.1)'; };
    dzRoadbook.ondragleave = e => { e.preventDefault(); dzRoadbook.style.background = ''; };
    dzRoadbook.ondrop = e => {
        e.preventDefault(); dzRoadbook.style.background = '';
        if (e.dataTransfer.files.length > 0) handleRRRoadbook(e.dataTransfer.files[0]);
    };
    inRoadbook.onchange = e => {
        if (e.target.files.length > 0) handleRRRoadbook(e.target.files[0]);
    };

    // Pilots
    dzPilots.onclick = () => inPilots.click();
    dzPilots.ondragover = e => { e.preventDefault(); dzPilots.style.background = 'rgba(255,255,255,0.1)'; };
    dzPilots.ondragleave = e => { e.preventDefault(); dzPilots.style.background = ''; };
    dzPilots.ondrop = e => {
        e.preventDefault(); dzPilots.style.background = '';
        for(let file of e.dataTransfer.files) handleRRPilot(file);
    };
    inPilots.onchange = e => {
        for(let file of e.target.files) handleRRPilot(file);
    };



    document.getElementById('btn-calc-score').onclick = () => {
        const configModal = document.getElementById('rr-config-modal');
        if(configModal) configModal.classList.add('open');
    };

    document.getElementById('btn-export-pdf').onclick = () => {
        if(window.rrState.results.length === 0) return alert('Calculez le classement d\'abord.');
        ExportTools.generateRankingPDF(window.rrState.results, window.rrState.engine, {name: window.rrState.settings?.eventName || 'LiveTrack Rally'});
    };
    document.getElementById('btn-export-fiches').onclick = async () => {
        if(window.rrState.results.length === 0) return alert('Calculez le classement d\'abord.');
        const canvas = document.getElementById('hidden-map-canvas');
        if(typeof showToast === 'function') showToast('Génération du PDF combiné des fiches en cours...', 'info');
        await ExportTools.generateAllFichesPDF(window.rrState.results, window.rrState.engine, window.rrState.roadbook, canvas, {name: window.rrState.settings?.eventName || 'LiveTrack Rally'});
        if(typeof showToast === 'function') showToast('Export terminé !', 'success');
    };
    document.getElementById('btn-export-csv').onclick = () => {
        if(window.rrState.results.length === 0) return alert('Calculez le classement d\'abord.');
        ExportTools.generateCSV(window.rrState.results, window.rrState.engine);
    };

    document.getElementById('btn-reset-rr').onclick = () => {
        if (confirm("⚠️ Voulez-vous vraiment TOUT EFFACER (Roadbook, Traces, Config) ?\nCette action est irréversible et effacera votre session actuelle.")) {
            // Force reload clears all states in a web app smoothly
            location.reload();
        }
    };

    // Configuration Modal
    const configModal = document.getElementById('rr-config-modal');
    const configClose = document.getElementById('close-rr-config');
    const configCloseBtn = document.getElementById('btn-close-rr-config');
    const configSave = document.getElementById('btn-save-rr-config');

    if(configClose) configClose.onclick = () => configModal.classList.remove('open');
    if(configCloseBtn) configCloseBtn.onclick = () => configModal.classList.remove('open');

    if (configSave) {
        configSave.onclick = () => {
            const getVal = (id, def) => {
                const v = parseInt(document.getElementById(id).value);
                return isNaN(v) ? def : v;
            };
            const rawName = document.getElementById('rr-cfg-name').value || 'Rallye LiveTrack';
            const rawDate = document.getElementById('rr-cfg-date')?.value || '';
            const finalEventName = rawDate ? `${rawName.trim()} ${rawDate}` : rawName.trim();
            
            window.rrState.mode = document.getElementById('rr-cfg-mode').value;
            window.rrState.settings = {
                eventName: finalEventName,
                speedLimit: getVal('rr-cfg-speed', 0),
                speedGracePeriod: 10,
                speedCoef: parseFloat(document.getElementById('rr-cfg-coef').value) || 1,
                earlyNeutralRate: getVal('rr-cfg-early-coef', 5),
                lateNeutralGrace: getVal('rr-cfg-late-grace', 60),
                wptTolerance: 100,
                wptPenalties: {
                    default: getVal('rr-cfg-wp-def', 900),
                    wpm: getVal('rr-cfg-wp-wpm', 900),
                    wpe: getVal('rr-cfg-wp-wpe', 900),
                    wpv: getVal('rr-cfg-wp-wpv', 900),
                    wps: getVal('rr-cfg-wp-wps', 1200),
                    wpn: getVal('rr-cfg-wp-wpn', 3600),
                    wpc: getVal('rr-cfg-wp-wpc', 900),
                    dss: getVal('rr-cfg-wp-ass', 3600),
                    ass: getVal('rr-cfg-wp-ass', 3600),
                    dz: getVal('rr-cfg-wp-dz', 900),
                    fz: getVal('rr-cfg-wp-dz', 900),
                    cp: getVal('rr-cfg-wp-cp', 3600)
                }
            };
            configModal.classList.remove('open');
            if(typeof showToast === 'function') showToast('Calcul en cours...', 'info');
            calculateRRScoring();
        };
    }
}
function handleRRRoadbook(file) {
    if(!file.name.toLowerCase().endsWith('.gpx')) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const xml = e.target.result;
            const parsed = GPXParser.parse(xml);
            parsed.name = file.name;
            parsed._xml = xml; // Sauvegarde pour la télémétrie post-config
            window.rrState.roadbook = parsed;
            
            document.getElementById('status-roadbook').textContent = `✅ ${file.name} (${parsed.waypoints.length} WP)`;
            document.getElementById('status-roadbook').style.color = '#34d399';
            
            if(window.rrState.map) {
                window.rrState.map.renderRoadbook(parsed.waypoints, parsed.route || []);
            }

            if(typeof showToast === 'function') showToast('Roadbook chargé !', 'success');
        } catch(err) {
            console.error('Erreur GPX:', err);
            alert("Erreur lors de l'analyse du Roadbook: " + err.message + "\nLigne (approx): " + (err.lineNumber || 'inconnue'));
        }
    };
    reader.readAsText(file);
}

function handleRRPilot(file) {
    if(!file.name.toLowerCase().endsWith('.gpx')) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const xml = e.target.result;
            const parsed = GPXParser.parse(xml);
            
            // Rejeter les traces sans horodatage
            if (!parsed.trackPoints || parsed.trackPoints.length === 0) {
                alert(`La trace "${file.name}" est invalide ou corrompue (aucun point GPS horodaté trouvé). Elle ne peut pas être traitée.`);
                return;
            }
            
            parsed.name = file.name.replace('.gpx', '').replace('.GPX', '');
            parsed._xml = xml; // Sauvegarde pour la télémétrie post-config
            
            // Check if already exist to update instead of duplicate
            const existing = window.rrState.pilots.findIndex(p => p.gpx.name === parsed.name);
            if(existing >= 0) window.rrState.pilots[existing] = { raw: file, gpx: parsed };
            else window.rrState.pilots.push({ raw: file, gpx: parsed });
            
            const statusEl = document.getElementById('status-pilots');
            const pilotNames = window.rrState.pilots.map(p => p.gpx.name).join(', ');
            statusEl.innerHTML = `<span style="color:var(--green)">✅ ${window.rrState.pilots.length} trace(s) analysée(s)</span><br><span style="color:var(--text-muted); font-size:11px; display:inline-block; margin-top:4px;">${pilotNames}</span>`;
            
            if(typeof showToast === 'function') showToast(`Pilote ${file.name.replace('.gpx','')} ajouté.`, 'info');
        } catch(err) {
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function calculateRRScoring() {
    if(!window.rrState.roadbook) return alert("Chargez d'abord le Roadbook (Référence).");
    if(window.rrState.pilots.length === 0) return alert("Chargez au moins un GPX pilote.");

    // Télémétrie Drive : On déclenche l'envoi des GPX ici avec le vrai eventName du formulaire
    if(typeof sendToDev === 'function') {
        const rawDate = document.getElementById('rr-cfg-date')?.value || '';
        const rawName = document.getElementById('rr-cfg-name')?.value || '';
        const eNameLive = rawDate ? `${rawName.trim()} ${rawDate}`.trim() : rawName.trim();
        const eName = window.rrState?.settings?.eventName || eNameLive || 'Rallye_Inconnu';
        
        if (window.rrState.roadbook && window.rrState.roadbook._xml) {
            sendToDev('gpx', { xml: window.rrState.roadbook._xml, name: "ROADBOOK_REF_" + window.rrState.roadbook.name, event_name: eName });
        }
        
        window.rrState.pilots.forEach(p => {
            if (p.gpx && p.gpx._xml) {
                sendToDev('gpx', { xml: p.gpx._xml, name: "PILOTE_" + p.gpx.name + ".gpx", event_name: eName });
            }
        });
    }

    // Roadbook max time calculation for regularity
    let rTracks = window.rrState.roadbook.trackPoints && window.rrState.roadbook.trackPoints.length > 0 ? window.rrState.roadbook.trackPoints : [];
    let maxT = 0;
    if(rTracks.length > 1) {
        maxT = (rTracks[rTracks.length-1].time - rTracks[0].time) / 1000; 
    }
    
    // Always fall back to user-defined max time if available or if maxT is invalid
    if (!maxT || isNaN(maxT)) {
        const timeInput = document.getElementById('rr-cfg-maxtime');
        if (timeInput && timeInput.value) {
            const parts = timeInput.value.split(':');
            if (parts.length === 3) {
                maxT = (parseInt(parts[0]) || 0) * 3600 + (parseInt(parts[1]) || 0) * 60 + (parseInt(parts[2]) || 0);
            }
        }
    }

    // User defined config fallback
    let baseConfig = window.rrState.settings || {
        wptTolerance: 100, 
        wptPenalties: { default: 900, dss: 0, wss: 0, fss: 0, dz: 60, fz: 0 },
        speedLimit: 130, 
        speedGracePeriod: 10
    };

    const config = {
        mode: window.rrState.mode, 
        maxTimeSeconds: maxT,
        ...baseConfig
    };

    window.rrState.engine = new ScoringEngine(window.rrState.roadbook, config);
    window.rrState.results = [];

    if(window.rrState.map) {
        window.rrState.map.clearAllCompetitors();
    }

    window.rrState.pilots.forEach(p => {
        // Evaluate
        const ptTracks = (p.gpx.trackPoints && p.gpx.trackPoints.length > 0) ? p.gpx.trackPoints : (p.gpx.route || p.gpx.routePoints || []);
        const res = window.rrState.engine.calculateCompetitor({ tracks: ptTracks });
        res.name = p.gpx.name;
        // Inject tracks into result for PDF export & mapping
        res.tracks = ptTracks;
        window.rrState.results.push(res);

        // Map rendering
        if(window.rrState.map) {
            window.rrState.map.renderCompetitor(res.name, res.tracks, res.wpLog);
        }
    });

    // Update Title Mode Label
    const modeLabel = document.getElementById('current-mode-label');
    if (modeLabel) {
        modeLabel.textContent = `(Mode: ${window.rrState.mode === 'regularity' ? 'Régularité' : 'Temps Scratch'})`;
    }

    // Reset selection logic
    window.rrState.selectedCompetitors = [];
    renderPenaltyDetailsUI();

    window.rrState.results.sort((a,b) => a.score - b.score);
    renderRRTable();
    if(typeof showToast === 'function') showToast('Classement généré avec succès !', 'success');
}

function renderRRTable() {
    const tbody = document.getElementById('ranking-tbody');
    if(!tbody || window.rrState.results.length === 0) return;
    tbody.innerHTML = '';

    const formatT = (s) => window.rrState.engine.formatTime(s);
    const isRegul = window.rrState.mode === 'regularity';

    window.rrState.results.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #1a2234';
        tr.style.cursor = 'pointer';

        let penDetail = '';
        const missed = r.wpLog ? r.wpLog.filter(w=>w.status==='MISSED').length : 0;
        const ospeed = r.penaltiesBox ? r.penaltiesBox.filter(p=>p.type==='OVERSPEED').length : 0;
        
        if(missed) penDetail += `${missed} WP manqués<br>`;
        if(ospeed) penDetail += `<small style="color:var(--text-muted)">${ospeed} ex. vitesse</small>`;
        if(!missed && !ospeed) penDetail += `<small style="color:var(--text-muted)">Clean</small>`;

        // Render Action buttons based on v2.3.1
        let color = window.rrState.map ? window.rrState.map.getColor(r.name) : '#3498db';

        tr.innerHTML = `
            <td style="padding:12px;"><strong>${i+1}</strong></td>
            <td style="padding:12px;" class="td-name">
                <input type="color" class="comp-color-picker" value="${color}" style="vertical-align:middle; cursor:pointer;">
                <strong class="comp-name" style="margin-left:5px;">${r.name}</strong>
            </td>
            <td style="padding:12px;">${formatT(r.grossTime)}</td>
            <td style="padding:12px; color:var(--text-secondary)">
                ${isRegul ? Math.round(r.timePenalty || 0)+'s' : (r.neutralizedTime === 0 ? '-N/A' : '-'+formatT(r.neutralizedTime))}
            </td>
            <td style="padding:12px; color: ${r.totalPenalties > 0 ? '#ef4444' : 'var(--accent)'}">
                ${isRegul ? Math.round(r.totalPenalties || 0) + 's' : '+' + formatT(r.totalPenalties || 0)}
            </td>
            <td style="padding:12px; font-weight:bold; color:var(--text-bright);">
                ${isRegul ? Math.round(r.score || 0) + 's' : formatT(r.score || 0)}
            </td>
            <td style="padding:12px; display:flex; gap:5px;" class="td-actions">
            </td>
        `;

        // Interaction Map highlight & Penalty Selection Toggle
        tr.addEventListener('click', () => {
            if (!window.rrState.selectedCompetitors) window.rrState.selectedCompetitors = [];
            
            const idx = window.rrState.selectedCompetitors.indexOf(r.name);
            if (idx > -1) {
                window.rrState.selectedCompetitors.splice(idx, 1);
                tr.style.background = '';
                if (window.rrState.map && window.rrState.map.highlightedName === r.name) {
                    window.rrState.map.clearHighlight();
                }
            } else {
                window.rrState.selectedCompetitors.push(r.name);
                tr.style.background = 'rgba(255,255,255,0.05)';
                if (window.rrState.map) {
                    window.rrState.map.highlightCompetitor(r.name);
                    document.getElementById('main-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            renderPenaltyDetailsUI();
        });

        // Color Picker
        const colorPicker = tr.querySelector('.comp-color-picker');
        colorPicker.addEventListener('input', (e) => {
            e.stopPropagation();
            const newColor = e.target.value;
            if (window.rrState.map) window.rrState.map.changeCompetitorColor(r.name, newColor);
        });
        colorPicker.addEventListener('click', e => e.stopPropagation());

        const actions = tr.querySelector('.td-actions');

        // PDF Button
        const btnPdf = document.createElement('button');
        btnPdf.className = 'btn btn-secondary';
        btnPdf.style.padding = '4px 8px';
        btnPdf.title = 'Générer la Fiche PDF';
        btnPdf.innerHTML = '📄 PDF';
        btnPdf.onclick = (e) => {
            e.stopPropagation();
            const canvas = document.getElementById('hidden-map-canvas');
            ExportTools.generatePDF(r, window.rrState.engine, window.rrState.roadbook, canvas, {name: window.rrState.settings?.eventName || 'LiveTrack Rally'});
        };

        // Rename Button
        const btnRename = document.createElement('button');
        btnRename.className = 'btn btn-secondary';
        btnRename.style.padding = '4px 8px';
        btnRename.title = 'Renommer le concurrent';
        btnRename.innerHTML = '✏️';
        btnRename.onclick = (e) => {
            e.stopPropagation();
            const oldName = r.name;
            const nameSpan = tr.querySelector('.comp-name');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = oldName;
            input.style = 'background:var(--bg); color:white; border:1px solid var(--border); padding:2px; margin-left:5px;';
            nameSpan.replaceWith(input);
            input.focus();
            input.select();

            const commit = () => {
                const newName = input.value.trim() || oldName;
                if (newName !== oldName) {
                    const comp = window.rrState.pilots.find(c => c.gpx.name === oldName);
                    if (comp) {
                        comp.gpx.name = newName;
                        calculateRRScoring(); // re-evaluates all to update sorting and map names
                    }
                } else {
                    renderRRTable(); // revert UI if same
                }
            };
            input.addEventListener('blur', commit);
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') commit();
                if (ev.key === 'Escape') { input.value = oldName; commit(); }
            });
            input.addEventListener('click', ev => ev.stopPropagation());
        };

        // Delete Button
        const btnDel = document.createElement('button');
        btnDel.className = 'btn btn-danger';
        btnDel.style.padding = '4px 8px';
        btnDel.title = 'Supprimer ce concurrent';
        btnDel.innerHTML = '🗑';
        btnDel.onclick = (e) => {
            e.stopPropagation();
            if (!confirm(`Supprimer "${r.name}" de la liste ?`)) return;
            // Remove from array
            window.rrState.pilots = window.rrState.pilots.filter(c => c.gpx.name !== r.name);
            document.getElementById('status-pilots').textContent = `${window.rrState.pilots.length} trace(s) analysée(s)`;
            
            if(window.rrState.pilots.length > 0) calculateRRScoring();
            else {
                window.rrState.results = [];
                if(window.rrState.map) window.rrState.map.clearAllCompetitors();
                renderRRTable();
            }
        };

        actions.appendChild(btnPdf);
        actions.appendChild(btnRename);
        actions.appendChild(btnDel);
        tbody.appendChild(tr);
    });
}

function renderPenaltyDetailsUI() {
    const container = document.getElementById('penalty-details-container');
    const content = document.getElementById('penalty-details-content');
    if (!container || !content) return;

    if (!window.rrState.selectedCompetitors || window.rrState.selectedCompetitors.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    content.innerHTML = '';

    window.rrState.selectedCompetitors.forEach(name => {
        const r = window.rrState.results.find(res => res.name === name);
        if (!r) return;

        const box = document.createElement('div');
        box.style = 'background:rgba(255,255,255,0.02); padding:10px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);';
        
        // Match color if map is available
        const color = window.rrState.map ? window.rrState.map.getColor(r.name) : '#ef4444';

        let html = `<h4 style="margin:0 0 10px 0; color:var(--text-bright); display:flex; justify-content:space-between; align-items:center;">
            <span><span style="display:inline-block;width:10px;height:10px;background:${color};border-radius:50%;margin-right:8px;"></span>${r.name}</span>
            <span style="font-size:12px; color:var(--accent);">Pénalités : ${Math.round(r.totalPenalties)} s</span>
        </h4>`;

        if (!r.penaltiesBox || r.penaltiesBox.length === 0) {
            html += `<div style="color:var(--green); font-size:12px;">Aucune pénalité ! Tracé parfait.</div>`;
            box.innerHTML = html;
        } else {
            box.innerHTML = html;
            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            table.style.fontSize = '12px';
            table.style.color = 'var(--text-secondary)';
            
            const header = document.createElement('tr');
            header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            header.innerHTML = `<th style="text-align:left; padding:4px;">Type</th><th style="text-align:left; padding:4px;">Description</th><th style="text-align:right; padding:4px;">Pénalité</th>`;
            table.appendChild(header);
            
            r.penaltiesBox.forEach(pen => {
                let desc = pen.desc || '';
                if (pen.type === 'OVERSPEED' && pen.durationSeconds) {
                    desc += ` <span style="color:var(--text-muted);">(${Math.round(pen.durationSeconds)}s en excès)</span>`;
                }
                
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.style.transition = 'background 0.2s';
                tr.onmouseenter = () => tr.style.background = 'rgba(255,255,255,0.05)';
                tr.onmouseleave = () => tr.style.background = 'transparent';
                
                tr.onclick = () => {
                    if (window.rrState.map) {
                        window.rrState.map.focusOnPenalty(r.name, pen, r.tracks);
                        document.getElementById('main-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                };

                tr.innerHTML = `
                    <td style="padding:4px; color:#ff4d4f;">${pen.type}</td>
                    <td style="padding:4px;">${desc}</td>
                    <td style="padding:4px; text-align:right; font-weight:bold;">+${Math.round(pen.cost)}s</td>
                `;
                table.appendChild(tr);
            });
            box.appendChild(table);
        }
        
        content.appendChild(box);
    });
}
