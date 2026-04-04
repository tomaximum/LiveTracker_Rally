/* ── RallyRanking V2.2 Bridge ─────────────────────────────────────────────── */
window.rrState = {
    roadbook: null,
    pilots: [],
    mode: 'regularity', // 'regularity' or 'time'
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

    // Controls
    document.getElementById('mode-regul').onclick = (e) => {
        document.getElementById('mode-regul').classList.add('active');
        document.getElementById('mode-chrono').classList.remove('active');
        window.rrState.mode = 'regularity';
        if(window.rrState.results.length > 0) calculateRRScoring();
    };
    document.getElementById('mode-chrono').onclick = (e) => {
        document.getElementById('mode-chrono').classList.add('active');
        document.getElementById('mode-regul').classList.remove('active');
        window.rrState.mode = 'time';
        if(window.rrState.results.length > 0) calculateRRScoring();
    };

    document.getElementById('btn-calc-score').onclick = calculateRRScoring;

    document.getElementById('btn-export-pdf').onclick = () => {
        if(window.rrState.results.length === 0) return alert('Calculez le classement d\'abord.');
        ExportTools.generateRankingPDF(window.rrState.results, window.rrState.engine, {name: window.rrState.settings?.eventName || 'LiveTrack Rally'});
    };
    document.getElementById('btn-export-fiches').onclick = async () => {
        if(window.rrState.results.length === 0) return alert('Calculez le classement d\'abord.');
        const canvas = document.getElementById('hidden-map-canvas');
        for (let r of window.rrState.results) {
            await ExportTools.generatePDF(r, window.rrState.engine, window.rrState.roadbook, canvas, {name: window.rrState.settings?.eventName || 'LiveTrack Rally'});
        }
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
    const configBtn = document.getElementById('btn-rr-config');
    const configModal = document.getElementById('rr-config-modal');
    const configClose = document.getElementById('close-rr-config');
    const configSave = document.getElementById('btn-save-rr-config');

    if(configBtn) configBtn.onclick = () => configModal.style.display = 'flex';
    if(configClose) configClose.onclick = () => configModal.style.display = 'none';

    if(configSave) {
        configSave.onclick = () => {
            const getVal = (id, def) => parseInt(document.getElementById(id).value) || def;
            window.rrState.settings = {
                eventName: document.getElementById('rr-cfg-name').value || 'Rallye LiveTrack',
                speedLimit: getVal('rr-cfg-speed', 130),
                speedGracePeriod: 10,
                wptTolerance: 100,
                wptPenalties: {
                    default: getVal('rr-cfg-wp-def', 900),
                    wpm: getVal('rr-cfg-wp-wpm', 900),
                    wpe: getVal('rr-cfg-wp-wpe', 900),
                    wpv: getVal('rr-cfg-wp-wpv', 900),
                    wps: getVal('rr-cfg-wp-wps', 1200),
                    wpn: getVal('rr-cfg-wp-wpn', 3600),
                    wpc: getVal('rr-cfg-wp-wpc', 900),
                    dss: getVal('rr-cfg-wp-wpn', 3600),
                    ass: getVal('rr-cfg-wp-wpn', 3600),
                    dz: getVal('rr-cfg-wp-dz', 900),
                    fz: getVal('rr-cfg-wp-dz', 900),
                    cp: 3600
                }
            };
            configModal.style.display = 'none';
            if(window.rrState.results.length > 0) calculateRRScoring();
            if(typeof showToast === 'function') showToast('Configuration sauvegardée.', 'success');
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
            window.rrState.roadbook = parsed;
            
            document.getElementById('status-roadbook').textContent = `✅ ${file.name} (${parsed.waypoints.length} WP)`;
            document.getElementById('status-roadbook').style.color = '#34d399';
            
            if(window.rrState.map) {
                window.rrState.map.renderRoadbook(parsed.waypoints, parsed.trackPoints || parsed.routePoints);
            }

            if(typeof sendToDev === 'function') sendToDev('gpx', { xml: xml, name: "ROADBOOK_REF_" + file.name });
            if(typeof showToast === 'function') showToast('Roadbook chargé !', 'success');
        } catch(err) {
            console.error(err);
            alert("Erreur lors de l'analyse du Roadbook.");
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
            parsed.name = file.name.replace('.gpx', '').replace('.GPX', '');
            
            // Check if already exist to update instead of duplicate
            const existing = window.rrState.pilots.findIndex(p => p.gpx.name === parsed.name);
            if(existing >= 0) window.rrState.pilots[existing] = { raw: file, gpx: parsed };
            else window.rrState.pilots.push({ raw: file, gpx: parsed });
            
            document.getElementById('status-pilots').textContent = `${window.rrState.pilots.length} trace(s) analysée(s)`;
            
            if(typeof sendToDev === 'function') sendToDev('gpx', { xml: xml, name: "PILOTE_" + file.name });
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

    // Roadbook max time calculation for regularity
    let rTracks = window.rrState.roadbook.trackPoints || window.rrState.roadbook.routePoints || [];
    let maxT = 0;
    if(rTracks.length > 0) {
        maxT = (rTracks[rTracks.length-1].time - rTracks[0].time) / 1000; 
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
        const ptTracks = p.gpx.trackPoints && p.gpx.trackPoints.length > 0 ? p.gpx.trackPoints : p.gpx.routePoints;
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
                ${isRegul ? Math.round(r.timePenalty)+'s' : '-'+formatT(r.neutralizedTime)}
            </td>
            <td style="padding:12px; color: ${r.totalPenalties > 0 ? '#ef4444' : 'var(--accent)'}">
                ${isRegul ? Math.round(r.totalPenalties) + 's' : '+' + formatT(r.totalPenalties)}
            </td>
            <td style="padding:12px; font-weight:bold; color:var(--text-bright);">
                ${isRegul ? Math.round(r.score) + 's' : formatT(r.score)}
            </td>
            <td style="padding:12px; display:flex; gap:5px;" class="td-actions">
            </td>
        `;

        // Interaction Map highlight
        tr.addEventListener('click', () => {
            if (!window.rrState.map) return;
            if (window.rrState.map.highlightedName === r.name) {
                window.rrState.map.clearHighlight();
                tr.style.background = '';
            } else {
                tbody.querySelectorAll('tr').forEach(el => el.style.background = '');
                tr.style.background = 'rgba(255,255,255,0.05)';
                window.rrState.map.highlightCompetitor(r.name);
                document.getElementById('main-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
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
        btnPdf.innerHTML = '📄';
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
