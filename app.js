/* ==========================================================================
   Observatoire électoral — Législatives 2024 en Gironde
   Onglets 1, 2, 3 et 5 (le laboratoire de redécoupage est dans lab.js)
   ========================================================================== */
'use strict';

const BL = ['RN', 'NFP', 'ENS', 'DRO', 'AUT'];
const BL_NAME = ['Rassemblement national et alliés', 'Nouveau Front populaire', 'Ensemble (majorité présidentielle)', 'Droite (LR, divers droite)', 'Autres'];
const BL_SHORT = ['RN', 'NFP', 'Ensemble', 'Droite', 'Autres'];
const BL_COL = ['#1B3F8B', '#D6393A', '#E8A317', '#5B9BD5', '#8A93A0'];
const BL_CLS = ['rn', 'nfp', 'ens', 'dro', 'aut'];
const BLOC_INDEX = { RN: 0, NFP: 1, ENS: 2, DRO: 3, AUT: 4 };
const NUANCE_LABEL = { UG: 'Union de la gauche (NFP)', ENS: 'Ensemble', RN: 'Rassemblement national', LR: 'Les Républicains', DVD: 'Divers droite', DVC: 'Divers centre', DVG: 'Divers gauche', ECO: 'Écologiste', EXG: 'Extrême gauche', EXD: 'Extrême droite', REC: 'Reconquête', DIV: 'Divers' };

const OBS = { res: null, cir: null, com: null, scen: null, outl: null, model: null };
window.OBS = OBS;

const fmt = n => Number(n).toLocaleString('fr-FR');
const pct = (x, d = 1) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('.', ',') + ' %';
const sgn = (x, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ',');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tag = b => `<span class="tag ${BL_CLS[b]}">${BL_SHORT[b]}</span>`;

/* ---------- Fonds de carte ---------- */
const WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
function baseLayer(kind) {
    if (kind === 'ortho') return L.tileLayer(WMTS + '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg', { attribution: '© IGN — Géoplateforme', maxZoom: 18 });
    if (kind === 'osm') return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© contributeurs OpenStreetMap', maxZoom: 18 });
    return L.tileLayer(WMTS + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png', { attribution: '© IGN — Géoplateforme', maxZoom: 18 });
}
window.baseLayer = baseLayer;
const GIRONDE_VIEW = [[44.2, -1.3], [45.6, 0.35]];

/* ---------- Utilitaires de couleur ---------- */
function hex2rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function ramp(t, c0, c1) {
    t = Math.max(0, Math.min(1, t));
    const a = hex2rgb(c0), b = hex2rgb(c1);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function legendHTML(items) { return items.map(i => `<span class="legend-item"><span class="swatch" style="background:${i[0]}"></span>${i[1]}</span>`).join(''); }

/* ---------- Chargement ---------- */
async function loadAll() {
    const files = ['results.json', 'circos.geojson', 'communes.geojson', 'scenarios.json', 'outlines.json', 'model.json'];
    const out = await Promise.all(files.map(f => fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f + ' (' + r.status + ')'); return r.json(); })));
    [OBS.res, OBS.cir, OBS.com, OBS.scen, OBS.outl, OBS.model] = out;
    OBS.circos = OBS.res.circos;
}

/* ---------- Calculs communs ---------- */
function blocT1(c) { // voix du 1er tour par bloc dans une circonscription
    const v = [0, 0, 0, 0, 0];
    c.t1.forEach(x => v[BLOC_INDEX[x.bloc]] += x.voix);
    return v;
}
function topCand(list) { return list.reduce((a, b) => (b.voix > a.voix ? b : a)); }
function stats() {
    if (OBS._stats) return OBS._stats;
    const C = OBS.circos;
    const t1 = [0, 0, 0, 0, 0]; let ins = 0, vot = 0, exp = 0, pop = 0;
    C.forEach(c => { blocT1(c).forEach((v, i) => t1[i] += v); ins += c.inscrits; vot += c.votants; exp += c.exprimes; pop += c.pop; });
    const seats = [0, 0, 0, 0, 0];
    C.forEach(c => seats[BLOC_INDEX[c.elu.bloc]]++);
    OBS._stats = { t1, ins, vot, exp, pop, meanPop: pop / C.length, seats };
    return OBS._stats;
}
function decisive(c) { // tour décisif : liste de candidats + total des exprimés
    return c.t2 ? { cands: c.t2, exp: c.exprimes_t2, ins: c.inscrits_t2, tour: 2 } : { cands: c.t1, exp: c.exprimes, ins: c.inscrits, tour: 1 };
}

/* ---------- Navigation ---------- */
function initNav() {
    $$('.nav-tab').forEach(tab => tab.addEventListener('click', () => {
        $$('.nav-tab').forEach(t => t.classList.remove('active'));
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const id = tab.dataset.tab;
        $('#' + id).classList.add('active');
        window.dispatchEvent(new CustomEvent('tabshown', { detail: id }));
    }));
}

/* ==========================================================================
   ONGLET 1 — RÉSULTATS
   ========================================================================== */
const R = { map: null, layers: [], sel: null, communes: null, base: null, labels: [] };

function layerColor(layer, c) {
    const S = stats();
    const popDev = (c.pop / S.meanPop - 1) * 100;
    switch (layer) {
        case 'winner': { const b = BLOC_INDEX[c.elu.bloc]; return BL_COL[b]; }
        case 't1lead': return BL_COL[BLOC_INDEX[topCand(c.t1).bloc]];
        case 'turnout': return ramp((c.votants / c.inscrits - 0.66) / 0.1, '#DCEAF5', '#0B3C5D');
        case 'margin': { const p = c.marge / decisive(c).exp * 100; return p < 2 ? '#B3261E' : p < 10 ? '#E8A317' : p < 25 ? '#8FBF6A' : '#2E7D32'; }
        case 'rn': return ramp(blocT1(c)[0] / c.exprimes / 0.45, '#E3EAF8', '#10265A');
        case 'nfp': return ramp(blocT1(c)[1] / c.exprimes / 0.5, '#FBE4E4', '#8F1414');
        case 'ens': return ramp(blocT1(c)[2] / c.exprimes / 0.4, '#FDF1D2', '#8A5A00');
        case 'pop': return popDev < -10 ? '#2A6F97' : popDev < -3 ? '#8DB7D2' : popDev <= 3 ? '#E8E8E8' : popDev <= 10 ? '#F2B27B' : '#C5561F';
    }
    return '#999';
}
function layerLegend(layer) {
    switch (layer) {
        case 'winner': case 't1lead': return legendHTML([0, 1, 2, 3].map(i => [BL_COL[i], BL_SHORT[i]]));
        case 'turnout': return legendHTML([['#DCEAF5', '66 % ou moins'], ['#6C9EBF', '≈ 71 %'], ['#0B3C5D', '76 % ou plus']]);
        case 'margin': return legendHTML([['#B3261E', 'moins de 2 points (basculant)'], ['#E8A317', '2 à 10 points'], ['#8FBF6A', '10 à 25 points'], ['#2E7D32', 'plus de 25 points']]);
        case 'rn': return legendHTML([['#E3EAF8', 'faible'], ['#10265A', '45 % ou plus']]);
        case 'nfp': return legendHTML([['#FBE4E4', 'faible'], ['#8F1414', '50 % ou plus']]);
        case 'ens': return legendHTML([['#FDF1D2', 'faible'], ['#8A5A00', '40 % ou plus']]);
        case 'pop': return legendHTML([['#2A6F97', 'moins de −10 %'], ['#8DB7D2', '−10 à −3 %'], ['#E8E8E8', '±3 %'], ['#F2B27B', '+3 à +10 %'], ['#C5561F', 'plus de +10 %']]);
    }
    return '';
}

function initResultats() {
    const S = stats(), C = OBS.circos;
    // KPI
    $('#kpiResultats').innerHTML = `
        <div class="kpi"><span class="kpi-label">Électeurs inscrits</span><div class="kpi-value">${fmt(S.ins)}</div>
            <span class="kpi-sub">Participation au 1er tour : ${pct(S.vot / S.ins * 100)}</span></div>
        ${[1, 2, 0].map(b => `<div class="kpi ${BL_CLS[b]}"><span class="kpi-label">${BL_NAME[b]}</span>
            <div class="kpi-value">${S.seats[b]} <small>siège${S.seats[b] > 1 ? 's' : ''} sur 12 (${pct(S.seats[b] / 12 * 100, 0)})</small></div>
            <span class="kpi-sub">${pct(S.t1[b] / S.exp * 100)} des exprimés au 1er tour</span></div>`).join('')}`;
    // carte
    R.map = L.map('mapResultats', { scrollWheelZoom: false, zoomSnap: .25 }).fitBounds(GIRONDE_VIEW);
    R.base = baseLayer('plan').addTo(R.map);
    drawCircos();
    $('#layerSelect').addEventListener('change', drawCircos);
    $('#baseSelect').addEventListener('change', e => { R.map.removeLayer(R.base); R.base = baseLayer(e.target.value).addTo(R.map); R.base.bringToBack(); });
    $('#toggleCommunes').addEventListener('change', e => {
        if (!R.communes) R.communes = L.geoJSON(OBS.com, { style: { weight: .6, color: '#233044', fill: false, opacity: .7 }, interactive: false });
        e.target.checked ? R.communes.addTo(R.map).bringToFront() : R.map.removeLayer(R.communes);
    });
    window.addEventListener('tabshown', e => { if (e.detail === 'tab-resultats') setTimeout(() => R.map.invalidateSize(), 150); });
    selectCirco(4); // 5e circonscription : la plus serrée en voix absolues
    // tableau
    $('#tableElus tbody').innerHTML = C.map(c => {
        const w = decisive(c).cands.find(x => x.elu) || c.elu;
        const typ = c.type === 'T1' ? 'Élu dès le 1er tour' : c.type === 'duel' ? 'Duel au 2nd tour' : 'Triangulaire au 2nd tour';
        return `<tr data-i="${c.idx}" style="cursor:pointer"><td><strong>${c.nom}</strong></td><td>${c.territoire.join(', ')}</td><td><strong>${esc(c.elu.prenom + ' ' + c.elu.nom)}</strong></td>
            <td>${tag(BLOC_INDEX[c.elu.bloc])} <span class="small muted">${NUANCE_LABEL[c.elu.nuance] || c.elu.nuance}</span></td><td>${typ}</td>
            <td class="num">${fmt(w.voix)}</td><td class="num">+${fmt(c.marge)}</td></tr>`;
    }).join('');
    $$('#tableElus tbody tr').forEach(tr => tr.addEventListener('click', () => { selectCirco(+tr.dataset.i); $('#mapResultats').scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
}

function drawCircos() {
    const layer = $('#layerSelect').value;
    R.layers.forEach(l => R.map.removeLayer(l)); R.layers = [];
    R.labels.forEach(l => R.map.removeLayer(l)); R.labels = [];
    OBS.cir.features.forEach(f => {
        const c = OBS.circos[f.properties.idx];
        const gl = L.geoJSON(f, { style: { fillColor: layerColor(layer, c), fillOpacity: .68, color: '#fff', weight: 2 } }).addTo(R.map);
        gl.on('click', () => selectCirco(c.idx));
        gl.bindTooltip(`<strong>${c.nom}</strong><br>${esc(c.elu.prenom + ' ' + c.elu.nom)} (${BL_SHORT[BLOC_INDEX[c.elu.bloc]]})`, { sticky: true });
        gl.circoIdx = c.idx;
        R.layers.push(gl);
        const ctr = gl.getBounds().getCenter();
        R.labels.push(L.marker(ctr, { interactive: false, icon: L.divIcon({ className: '', html: `<span class="dist-label">${c.num}</span>`, iconSize: [0, 0] }) }).addTo(R.map));
    });
    $('#legendResultats').innerHTML = layerLegend(layer);
    if (R.sel != null) highlight(R.sel);
}
function highlight(i) {
    R.layers.forEach(l => l.setStyle(l.circoIdx === i ? { color: '#09131F', weight: 4 } : { color: '#fff', weight: 2 }));
    R.layers.find(l => l.circoIdx === i)?.bringToFront();
}
function candRows(list, exp, key) {
    const max = Math.max(...list.map(x => x.voix));
    return [...list].sort((a, b) => b.voix - a.voix).map(x => `
        <div class="cand ${x.elu ? 'elu' : ''}"><div class="cand-head"><span><span class="cand-name">${esc(x.prenom + ' ' + x.nom)}</span> <span class="muted small">${x.nuance}</span></span>
        <span><strong>${fmt(x.voix)}</strong> · ${pct(x.voix / exp * 100)}</span></div>
        <div class="cand-bar"><span style="width:${x.voix / max * 100}%;background:${BL_COL[BLOC_INDEX[x.bloc]]}"></span></div></div>`).join('');
}
function selectCirco(i) {
    R.sel = i; highlight(i);
    const c = OBS.circos[i], S = stats();
    const dev = (c.pop / S.meanPop - 1) * 100;
    $('#detailPanel').innerHTML = `
        <div class="card-header"><span class="tag ${BL_CLS[BLOC_INDEX[c.elu.bloc]]}">${BL_SHORT[BLOC_INDEX[c.elu.bloc]]}</span>
            <h3 class="card-title" style="margin-top:6px">${c.nom}</h3>
            <p class="card-desc">${c.territoire.join(', ')}…</p></div>
        <div class="detail-row"><span class="k">Député(e) élu(e)</span><span class="v">${esc(c.elu.prenom + ' ' + c.elu.nom)}</span></div>
        <div class="detail-row"><span class="k">Population (INSEE)</span><span class="v">${fmt(c.pop)} (${sgn(dev)} % vs moyenne)</span></div>
        <div class="detail-row"><span class="k">Inscrits</span><span class="v">${fmt(c.inscrits)}</span></div>
        <div class="detail-row"><span class="k">Participation au 1er tour</span><span class="v">${pct(c.votants / c.inscrits * 100)}</span></div>
        <div class="detail-row"><span class="k">Mode d'élection</span><span class="v">${c.type === 'T1' ? 'Élu dès le 1er tour' : c.type === 'duel' ? 'Duel au 2nd tour' : 'Triangulaire au 2nd tour'}</span></div>
        <div class="detail-row"><span class="k">Avance du vainqueur</span><span class="v">${fmt(c.marge)} voix (${pct(c.marge / decisive(c).exp * 100)} des exprimés)</span></div>
        <h4 class="sub">1er tour (30 juin)</h4>${candRows(c.t1, c.exprimes)}
        ${c.t2 ? `<h4 class="sub">2nd tour (7 juillet)</h4>${candRows(c.t2, c.exprimes_t2)}` : '<p class="small muted" style="margin-top:12px">Pas de 2nd tour : le candidat arrivé en tête a été élu dès le 1er tour.</p>'}`;
}

/* ==========================================================================
   ONGLET 2 — VOIX, SIÈGES, DÉCOUPAGE
   ========================================================================== */
function equityData() {
    const C = OBS.circos;
    return C.map(c => {
        const d = decisive(c);
        const sorted = [...d.cands].sort((a, b) => b.voix - a.voix);
        const w = sorted[0], second = sorted[1];
        const needed = second.voix + 1;
        const wasteW = w.voix - needed;
        const wasteL = sorted.slice(1).reduce((s, x) => s + x.voix, 0);
        return { c, d, w, needed, wasteW, wasteL, sorted };
    });
}
function initBiais() {
    const S = stats(), C = OBS.circos, E = equityData();
    // Gallagher
    const v = S.t1.map(x => x / S.exp), s = S.seats.map(x => x / 12);
    const gall = Math.sqrt(0.5 * v.reduce((a, x, i) => a + Math.pow((x - s[i]) * 100, 2), 0));
    const pops = C.map(c => c.pop); const iMax = pops.indexOf(Math.max(...pops)), iMin = pops.indexOf(Math.min(...pops));
    const waste = E.reduce((a, e) => a + e.wasteW + e.wasteL, 0), totDec = E.reduce((a, e) => a + e.d.exp, 0);
    const close = E.filter(e => e.c.marge / e.d.exp < 0.02);
    $('#kpiBiais').innerHTML = `
        <div class="kpi"><span class="kpi-label">Indice de disproportion de Gallagher</span><div class="kpi-value">${gall.toFixed(1).replace('.', ',')}</div>
            <span class="kpi-sub">0 = sièges strictement proportionnels aux voix du 1er tour ; calculé sur les 5 blocs</span></div>
        <div class="kpi"><span class="kpi-label">Écart de population maximal</span><div class="kpi-value">${fmt(pops[iMax] - pops[iMin])} <small>hab.</small></div>
            <span class="kpi-sub">${C[iMax].nom} (${fmt(pops[iMax])}) contre ${C[iMin].nom} (${fmt(pops[iMin])}) : ${pct((pops[iMax] / pops[iMin] - 1) * 100, 0)} d'écart</span></div>
        <div class="kpi"><span class="kpi-label">Voix gaspillées</span><div class="kpi-value">${pct(waste / totDec * 100, 0)}</div>
            <span class="kpi-sub">${fmt(waste)} voix sur ${fmt(totDec)} exprimées au tour décisif n'ont pas servi à élire quelqu'un</span></div>
        <div class="kpi"><span class="kpi-label">Circonscriptions décidées à moins de 2 points</span><div class="kpi-value">${close.length}</div>
            <span class="kpi-sub">${close.map(e => `${e.c.nom} (${fmt(e.c.marge)} voix)`).join(' ; ') || '—'}</span></div>`;

    // Voix vs sièges
    $('#barsVoixSieges').innerHTML = [0, 1, 2, 3, 4].map(b => `
        <div class="bar-group"><div class="bar-head"><span>${BL_NAME[b]}</span><span>Voix ${pct(v[b] * 100)} · Sièges ${S.seats[b]}/12 (${pct(s[b] * 100, 0)})</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${v[b] * 100}%;background:#94A3B8">voix</div></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(s[b] * 100, .8)}%;background:${BL_COL[b]}">sièges</div></div></div>`).join('');
    const lead = [0, 0, 0, 0, 0]; C.forEach(c => lead[BLOC_INDEX[topCand(c.t1).bloc]]++);
    $('#noteVoixSieges').textContent = `Au 1er tour, le bloc arrivé en tête dans le plus de circonscriptions est ${BL_SHORT[lead.indexOf(Math.max(...lead))]} (${Math.max(...lead)} sur 12), mais ${BL_SHORT[S.seats.indexOf(Math.max(...S.seats))]} obtient le plus de sièges (${Math.max(...S.seats)} sur 12).`;

    // Carte population
    const m = L.map('mapPop', { scrollWheelZoom: false, zoomSnap: .25 }).fitBounds(GIRONDE_VIEW);
    baseLayer('plan').addTo(m);
    OBS.cir.features.forEach(f => {
        const c = C[f.properties.idx];
        const gl = L.geoJSON(f, { style: { fillColor: layerColor('pop', c), fillOpacity: .72, color: '#fff', weight: 2 } }).addTo(m);
        const dev = (c.pop / S.meanPop - 1) * 100;
        gl.bindTooltip(`<strong>${c.nom}</strong><br>${fmt(c.pop)} hab. (${sgn(dev)} %)`, { sticky: true });
        L.marker(gl.getBounds().getCenter(), { interactive: false, icon: L.divIcon({ className: '', html: `<span class="dist-label">${c.num} · ${sgn(dev, 0)} %</span>`, iconSize: [0, 0] }) }).addTo(m);
    });
    window.addEventListener('tabshown', e => { if (e.detail === 'tab-biais') setTimeout(() => m.invalidateSize(), 150); });
    $('#legendPop').innerHTML = layerLegend('pop');

    // Lecture
    const sortedPop = C.map((c, i) => [c, c.pop / S.meanPop - 1]).sort((a, b) => b[1] - a[1]);
    const big = E.filter(e => e.c.marge / e.d.exp >= 0.25).map(e => e.c.nom + ' (' + BL_SHORT[BLOC_INDEX[e.c.elu.bloc]] + ', +' + pct(e.c.marge / e.d.exp * 100, 0).replace(' %', '') + ' pts)');
    const leadList = b => C.filter(c => BLOC_INDEX[topCand(c.t1).bloc] === b).map(c => c.num + 'e').join(', ');
    const tri = C.filter(c => c.type === 'triangulaire').map(c => c.nom);
    $('#proseBiais').innerHTML = `
        <p><strong>Un département, trois blocs d'ampleur proche.</strong> Au 1er tour, le NFP recueille ${pct(v[1] * 100)} des exprimés, le RN ${pct(v[0] * 100)} et Ensemble ${pct(v[2] * 100)}. Le RN arrive en tête dans ${lead[0]} circonscriptions (${leadList(0)}), le NFP dans ${lead[1]} (${leadList(1)}), Ensemble dans ${lead[2]} (${leadList(2)}).</p>
        <p><strong>Des reports qui font les sièges.</strong> Au 2nd tour, ${C.filter(c => c.type !== 'T1').length} circonscriptions sont départagées, dont ${tri.length} en triangulaire (${tri.join(', ')}). Le RN, premier du 1er tour dans plusieurs d'entre elles, est battu partout sauf dans la 11e, où il est élu dès le 1er tour : l'élimination du candidat arrivé en tête dépend de la capacité des autres blocs à se reporter l'un sur l'autre, pas du découpage seul.</p>
        <p><strong>Des écarts de poids entre électeurs.</strong> La circonscription la plus peuplée (${C[iMax].nom}, ${sgn((pops[iMax] / S.meanPop - 1) * 100, 0)} % par rapport à la moyenne) compte ${fmt(pops[iMax] - pops[iMin])} habitants de plus que la moins peuplée (${C[iMin].nom}, ${sgn((pops[iMin] / S.meanPop - 1) * 100, 0)} %). À population égale, il faudrait déplacer des communes entre circonscriptions voisines : c'est l'objet du laboratoire (onglet 4).</p>
        <p><strong>Des victoires très larges et d'autres à quelques centaines de voix.</strong> ${big.length ? 'Larges (plus de 25 points) : ' + big.join(' ; ') + '. ' : ''}À l'inverse, ${close.map(e => `${e.c.nom} se joue à ${fmt(e.c.marge)} voix`).join(' et ')}. Dans ces circonscriptions, déplacer quelques communes aurait pu modifier le vainqueur.</p>`;

    // Tableau équité
    $('#tableEquite tbody').innerHTML = E.map(e => `<tr><td><strong>${e.c.nom}</strong></td><td class="num">${fmt(e.c.pop)}</td>
        <td class="num" style="color:${e.c.pop > S.meanPop ? '#C5561F' : '#2A6F97'};font-weight:600">${sgn((e.c.pop / S.meanPop - 1) * 100)} %</td><td class="num">${fmt(e.c.inscrits)}</td>
        <td>${tag(BLOC_INDEX[e.c.elu.bloc])} ${esc(e.c.elu.nom)}</td><td class="num">${fmt(e.w.voix)}</td><td class="num">${fmt(e.needed)}</td>
        <td class="num">${fmt(e.wasteW)}</td><td class="num">${fmt(e.wasteL)}</td></tr>`).join('');
    const bt = [0, 0, 0, 0, 0].map(() => ({ tot: 0, waste: 0 }));
    E.forEach(e => e.sorted.forEach((x, k) => { const b = BLOC_INDEX[x.bloc]; bt[b].tot += x.voix; bt[b].waste += k === 0 ? e.wasteW : x.voix; }));
    $('#tableBlocs tbody').innerHTML = [1, 0, 2, 3, 4].filter(b => bt[b].tot > 0).map(b => `<tr><td>${tag(b)} ${BL_NAME[b]}</td><td class="num">${fmt(bt[b].tot)}</td><td class="num">${fmt(bt[b].waste)}</td>
        <td class="num">${pct(bt[b].waste / bt[b].tot * 100, 0)}</td><td class="num"><strong>${S.seats[b]}</strong></td></tr>`).join('');
}

/* ==========================================================================
   ONGLET 3 — AUTRES MODES DE SCRUTIN
   ========================================================================== */
function allocate(votes, seats, method) {
    const out = votes.map(() => 0), quot = [];
    if (method === 'hare') {
        const tot = votes.reduce((a, b) => a + b, 0), q = tot / seats;
        const rem = votes.map((v, i) => { out[i] = Math.floor(v / q); return [v - out[i] * q, i]; });
        let left = seats - out.reduce((a, b) => a + b, 0);
        rem.sort((a, b) => b[0] - a[0]);
        for (let k = 0; left > 0 && k < rem.length; k++, left--) out[rem[k][1]]++;
        return { out, quot: rem, q };
    }
    votes.forEach((v, i) => { for (let s = 1; s <= seats; s++) quot.push([v / (method === 'sl' ? 2 * s - 1 : s), i, s]); });
    quot.sort((a, b) => b[0] - a[0]);
    quot.slice(0, seats).forEach(q => out[q[1]]++);
    return { out, quot: quot.slice(0, seats + 3) };
}
function initScrutins() {
    $('#btnSim').addEventListener('click', runSim);
    ['modeSelect', 'seuilSelect', 'primeSelect'].forEach(id => $('#' + id).addEventListener('change', runSim));
    runSim();
}
function runSim() {
    const S = stats(), C = OBS.circos;
    const mode = $('#modeSelect').value, seuil = +$('#seuilSelect').value, prime = +$('#primeSelect').value;
    const real = S.seats.slice(0, 4);
    const lists = [0, 1, 2, 3];
    const pctV = lists.map(b => S.t1[b] / S.exp * 100);
    const elig = lists.map(b => pctV[b] >= seuil);
    const votes = lists.map(b => elig[b] ? S.t1[b] : 0);
    let sim = [0, 0, 0, 0], desc = '', quotHTML = '', tdesc = '';
    if (mode === 'reel') { sim = real.slice(); desc = 'Scrutin uninominal à deux tours, résultat réel de juin-juillet 2024.'; }
    else if (mode === 'un_tour') {
        C.forEach(c => { const t = topCand(c.t1); sim[Math.min(BLOC_INDEX[t.bloc], 3)]++; });
        desc = 'Chaque circonscription est gagnée par le candidat arrivé en tête au 1er tour, sans second tour.';
        tdesc = 'Calculé circonscription par circonscription à partir des voix du 1er tour.';
        const cnt = [0, 0, 0, 0, 0]; C.forEach(c => cnt[BLOC_INDEX[topCand(c.t1).bloc]]++);
        if (cnt[4]) sim = sim.map((x, i) => x);
    } else if (mode === 'prime') {
        const p = Math.round(12 * prime), first = votes.indexOf(Math.max(...votes));
        const a = allocate(votes, 12 - p, 'dhondt'); sim = a.out.slice(); sim[first] += p;
        desc = `Proportionnelle départementale avec ${p} sièges de prime (${pct(prime * 100, 0)}) à la liste arrivée en tête, le reste réparti à la plus forte moyenne.`;
        tdesc = `La prime de ${p} sièges va à ${BL_SHORT[first]}, les ${12 - p} autres sont répartis entre les listes ayant franchi le seuil.`;
        quotHTML = quotTable(a.quot, 12 - p, 'dhondt');
    } else {
        const a = allocate(votes, 12, mode); sim = a.out.slice();
        desc = { dhondt: 'Proportionnelle départementale à la plus forte moyenne (D\'Hondt).', sl: 'Proportionnelle départementale à la méthode de Sainte-Laguë.', hare: 'Proportionnelle départementale au quotient de Hare, plus forts restes.' }[mode];
        tdesc = `Seuil ${seuil} % : ${lists.filter(b => !elig[b]).map(b => BL_SHORT[b]).join(', ') || 'aucune liste'} écartée${lists.filter(b => !elig[b]).length > 1 ? 's' : ''}.`;
        quotHTML = mode === 'hare' ? hareTable(a, votes) : quotTable(a.quot, 12, mode);
    }
    $('#simDesc').textContent = desc; $('#simTableDesc').textContent = tdesc;
    // barres
    const bar = (arr, label) => `<div style="margin-bottom:18px"><h4 class="sub" style="margin-top:0">${label}</h4><div class="seatbar">${[1, 2, 0, 3].filter(b => arr[b] > 0).map(b => `<div style="width:${arr[b] / 12 * 100}%;background:${BL_COL[b]}">${BL_SHORT[b]} ${arr[b]}</div>`).join('')}</div></div>`;
    $('#simBars').innerHTML = bar(real, 'Résultat réel 2024 (12 députés)') + bar(sim, 'Simulation');
    // table
    $('#tableSim tbody').innerHTML = [1, 0, 2, 3].map(b => { const d = sim[b] - real[b];
        return `<tr><td>${tag(b)} ${BL_NAME[b]}</td><td class="num">${fmt(S.t1[b])}</td><td class="num">${pct(pctV[b])}</td><td class="num">${real[b]}</td>
        <td class="num"><strong style="color:${BL_COL[b]}">${sim[b]}</strong></td><td class="num" style="font-weight:700;color:${d > 0 ? '#15803D' : d < 0 ? '#B91C1C' : '#64748B'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}</td></tr>`; }).join('');
    $('#quotWrap').innerHTML = quotHTML;
    // lecture
    const order = [0, 1, 2, 3].sort((a, b) => sim[b] - sim[a]);
    const gain = [0, 1, 2, 3].filter(b => sim[b] > real[b]).map(b => `${BL_SHORT[b]} (+${sim[b] - real[b]})`);
    const loss = [0, 1, 2, 3].filter(b => sim[b] < real[b]).map(b => `${BL_SHORT[b]} (−${real[b] - sim[b]})`);
    const gal = Math.sqrt(0.5 * [0, 1, 2, 3, 4].reduce((a, b) => a + Math.pow((S.t1[b] / S.exp - (sim[b] || 0) / 12) * 100, 2), 0));
    const galReal = Math.sqrt(0.5 * [0, 1, 2, 3, 4].reduce((a, b) => a + Math.pow((S.t1[b] / S.exp - S.seats[b] / 12) * 100, 2), 0));
    $('#simText').innerHTML = mode === 'reel'
        ? `<p>Le scrutin réel donne <strong>${real[1]} sièges au NFP, ${real[2]} à Ensemble et ${real[0]} au RN</strong>, alors que ces trois blocs sont à ${pct(pctV[1])}, ${pct(pctV[2])} et ${pct(pctV[0])} des exprimés au 1er tour. L'indice de Gallagher est de ${galReal.toFixed(1).replace('.', ',')}.</p><p>Choisissez un autre mode de scrutin pour comparer.</p>`
        : `<p>Avec cette règle, <strong>${BL_SHORT[order[0]]} arrive en tête avec ${sim[order[0]]} sièges</strong>${sim[order[1]] ? `, devant ${BL_SHORT[order[1]]} (${sim[order[1]]})` : ''}. ${gain.length ? 'Gagnent des sièges : ' + gain.join(', ') + '. ' : ''}${loss.length ? 'En perdent : ' + loss.join(', ') + '.' : ''}</p>
        <p>L'indice de Gallagher passe de ${galReal.toFixed(1).replace('.', ',')} (scrutin réel) à <strong>${gal.toFixed(1).replace('.', ',')}</strong> : ${gal < galReal ? 'la représentation est plus proche des voix du 1er tour.' : 'l\'écart entre voix et sièges est plus grand qu\'aujourd\'hui.'}</p>
        <p class="muted small">Comparaison indicative : à un second tour, les électeurs votent différemment d'un premier tour, et des listes départementales ne présenteraient pas les mêmes candidats.</p>`;
}
function quotTable(q, seats, method) {
    const rows = q.map((x, k) => `<tr style="${k >= seats ? 'opacity:.45' : ''}"><td class="num">${k + 1}</td><td>${tag(x[1])}</td><td class="num">${fmt(Math.round(x[0]))}</td><td>${k < seats ? 'siège attribué' : 'non retenu'}</td></tr>`).join('');
    return `<h4 class="sub" style="margin-top:0">Quotients ${method === 'sl' ? 'de Sainte-Laguë' : 'D\'Hondt'} classés</h4><table class="t"><thead><tr><th class="num">Rang</th><th>Liste</th><th class="num">Quotient</th><th>Résultat</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function hareTable(a, votes) {
    const tot = votes.reduce((x, y) => x + y, 0);
    return `<h4 class="sub" style="margin-top:0">Quotient de Hare : ${fmt(Math.round(a.q))} voix par siège (${fmt(tot)} voix / 12)</h4><p class="small muted">Chaque liste reçoit d'abord autant de sièges que de quotients entiers, puis les sièges restants vont aux plus forts restes.</p>`;
}

/* ==========================================================================
   ONGLET 5 — DONNÉES
   ========================================================================== */
const DT = { rows: [], page: 0, sort: ['nom', 1], per: 40 };
function initDonnees() {
    const feats = OBS.com.features.map(f => f.properties);
    DT.rows = feats.map(p => {
        const sh = p.t1.map(v => v / p.exp * 100);
        const lead = [0, 1, 2, 3].reduce((a, b) => p.t1[b] > p.t1[a] ? b : a, 0);
        const fin = []; p.ob.forEach((o, i) => { if (o) fin.push(i); });
        return { nom: p.nom, id: p.id, c: p.c, pop: p.pop, ins: p.ins, rn: sh[0], nfp: sh[1], ens: sh[2], lead, fin, exp: p.exp, t1: p.t1 };
    });
    $('#comCount').textContent = `${DT.rows.length} unités : 534 communes et les 3 morceaux de Bordeaux (rattachés à leur circonscription 2024)`;
    const fc = $('#filtCirco');
    OBS.circos.forEach(c => fc.insertAdjacentHTML('beforeend', `<option value="${c.idx}">${c.nom}</option>`));
    ['searchCom', 'filtCirco', 'filtBloc'].forEach(id => $('#' + id).addEventListener('input', () => { DT.page = 0; renderCom(); }));
    $$('#tableCom thead th.sortable').forEach(th => th.addEventListener('click', () => { const k = th.dataset.s; DT.sort = [k, DT.sort[0] === k ? -DT.sort[1] : 1]; renderCom(); }));
    $('#pgPrev').addEventListener('click', () => { DT.page = Math.max(0, DT.page - 1); renderCom(); });
    $('#pgNext').addEventListener('click', () => { DT.page++; renderCom(); });
    $('#btnCsvCom').addEventListener('click', () => csv('communes_gironde_2024.csv', ['Unité', 'Code', 'Circo 2024', 'Population', 'Inscrits', 'Exprimés 1er tour', 'Voix RN', 'Voix NFP', 'Voix Ensemble', 'Voix Droite', 'Voix Autres'],
        filtered().map(r => [r.nom, r.id, OBS.circos[r.c].nom, r.pop, r.ins, r.exp, ...r.t1])));
    $('#btnCsvCirco').addEventListener('click', () => csv('circonscriptions_gironde_2024.csv', ['Circonscription', 'Inscrits', 'Votants', 'Exprimés', 'Population', 'Élu(e)', 'Étiquette', 'Voix RN T1', 'Voix NFP T1', 'Voix Ensemble T1', 'Voix Droite T1', 'Voix Autres T1'],
        OBS.circos.map(c => [c.nom, c.inscrits, c.votants, c.exprimes, c.pop, c.elu.prenom + ' ' + c.elu.nom, c.elu.nuance, ...blocT1(c)])));
    $('#btnLive').addEventListener('click', liveCheck);
    renderCom();
    // méthode
    const m = OBS.model.reports;
    const srcs = OBS.model.sources;
    $('#methodText').innerHTML = `
        <p><strong>1. Données.</strong> Les résultats par commune des deux tours (ministère de l'Intérieur) sont regroupés en 5 blocs : RN (RN, extrême droite divers), NFP (Union de la gauche, divers gauche, écologistes dissidents), Ensemble (Ensemble, divers centre), Droite (LR, divers droite) et Autres. Chaque commune est rattachée à sa circonscription de 2024 par superposition avec les contours officiels : une seule commune, Bordeaux, est à cheval sur plusieurs circonscriptions. Ses trois morceaux sont reconstitués en retranchant, pour chaque circonscription, les résultats officiels des autres communes ; la somme des trois morceaux retombe exactement sur les totaux officiels de Bordeaux, aux deux tours.</p>
        <p><strong>2. Un découpage candidat.</strong> Un découpage est une affectation des 537 unités à 12 circonscriptions d'un seul tenant. Les cartes « générées » sont obtenues par un algorithme de recuit simulé : à partir du découpage de 2024, il déplace de proche en proche des communes frontalières, en refusant tout déplacement qui couperait une circonscription en deux ou ferait dépasser l'écart de population autorisé (la jurisprudence admet en pratique ±20 % autour de la moyenne départementale).</p>
        <p><strong>3. Résultat d'un découpage.</strong> Dans chaque nouvelle circonscription, on additionne les voix du 1er tour par bloc. Le candidat d'un bloc est élu dès le 1er tour s'il dépasse 50 % des exprimés et 25 % des inscrits. Sinon, les deux blocs principaux (RN, NFP, Ensemble) en tête se qualifient et s'affrontent en duel (hypothèse : le 3e se désiste).</p>
        <p><strong>4. Modèle de second tour.</strong> Pour chaque commune et chaque duel possible, on utilise le résultat réellement observé quand ce duel a eu lieu dans la commune (en répartissant les voix du 3e finaliste d'une triangulaire). Quand il n'a pas eu lieu, les voix sont estimées à partir des reports observés ailleurs en Gironde dans les duels réels : on ajuste par moindres carrés, sur les communes d'un même type de duel, la part des voix de chaque bloc du 1er tour (et des non-exprimés) qui se porte sur chaque finaliste. Cet ajustement est très précis pour les duels RN–NFP et RN–Ensemble (R² supérieur à 0,99) ; le duel NFP–Ensemble, quasi absent en 2024, est reconstitué à partir des deux autres. Avec ce modèle, le découpage de 2024 redonne exactement les 12 élus réels.</p>
        <p><strong>5. Limites.</strong> Les reports sont supposés identiques d'une commune à l'autre pour un duel donné, alors qu'ils varient selon les candidats et le contexte local ; la participation et le choix des candidats ne changent pas avec le découpage ; les triangulaires sont écartées. Les résultats d'un redécoupage sont donc des ordres de grandeur, non des prévisions.</p>`;
    const nm = ['RN', 'NFP', 'Ensemble', 'Droite', 'Autres', 'Non-exprimés T1'];
    $('#tableModel').innerHTML = `<thead><tr><th>Duel (finalistes)</th><th class="num">Unités observées</th><th>Part des voix de chaque source qui va à chaque finaliste (reports estimés)</th></tr></thead><tbody>` +
        Object.values(m).map(r => {
            const f = r.pair.map(p => ({ RN: 0, NFP: 1, ENS: 2 }[p]));
            const line = (name, arr) => `<div><strong>→ ${name}</strong> : ` + arr.map((v, i) => `${nm[i]} ${Math.round(v * 100)} %`).join(' · ') + '</div>';
            return `<tr><td>${BL_SHORT[f[0]]} contre ${BL_SHORT[f[1]]}</td><td class="num">${r.n_units}${r.n_units < 20 ? ' (insuffisant : reconstitué)' : ''}</td><td class="small">${line(BL_SHORT[f[0]], r.f_to_A)}${line(BL_SHORT[f[1]], r.f_to_B)}</td></tr>`;
        }).join('') + '</tbody>';
}
function filtered() {
    const q = $('#searchCom').value.toLowerCase().trim(), c = $('#filtCirco').value, b = $('#filtBloc').value;
    let r = DT.rows.filter(x => (!q || x.nom.toLowerCase().includes(q)) && (c === '' || x.c === +c) && (b === '' || x.lead === +b));
    const [k, d] = DT.sort;
    r.sort((a, z) => (typeof a[k] === 'string' ? a[k].localeCompare(z[k], 'fr') : a[k] - z[k]) * d);
    return r;
}
function renderCom() {
    const r = filtered(), pages = Math.max(1, Math.ceil(r.length / DT.per));
    DT.page = Math.min(DT.page, pages - 1);
    const slice = r.slice(DT.page * DT.per, (DT.page + 1) * DT.per);
    $('#tableCom tbody').innerHTML = slice.map(x => `<tr><td><strong>${esc(x.nom)}</strong></td><td>${OBS.circos[x.c].num}e</td><td class="num">${fmt(x.pop)}</td><td class="num">${fmt(x.ins)}</td>
        <td class="num">${pct(x.rn)}</td><td class="num">${pct(x.nfp)}</td><td class="num">${pct(x.ens)}</td><td>${tag(x.lead)}</td>
        <td>${x.fin.length ? x.fin.map(i => ['RN–NFP', 'RN–Ensemble', 'NFP–Ensemble'][i]).join(', ') : '<span class="muted small">autre configuration</span>'}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucun résultat.</td></tr>';
    $('#pageInfo').textContent = `${r.length} résultat${r.length > 1 ? 's' : ''} · page ${DT.page + 1} / ${pages}`;
    $('#pgPrev').disabled = DT.page === 0; $('#pgNext').disabled = DT.page >= pages - 1;
}
function csv(name, head, rows) {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const txt = '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
async function liveCheck() {
    const out = $('#liveOut'); out.innerHTML = 'Interrogation de data.gouv.fr…';
    const T = 'https://tabular-api.data.gouv.fr/api/resources/';
    const q = '/data/?Code%20d%C3%A9partement__exact=33';
    try {
        const [a, b] = await Promise.all([fetch(T + '78c708c5-5bc5-438d-8379-f432beae3f2b' + q).then(r => r.json()), fetch(T + '8d4a6927-c96f-4cf5-b757-ea745eca26bd' + q).then(r => r.json())]);
        const C = OBS.circos, sum = (f, arr) => arr.reduce((s, c) => s + f(c), 0);
        const rows = [
            ['1er tour — inscrits', a.data[0]['Inscrits'], sum(c => c.inscrits, C)], ['1er tour — votants', a.data[0]['Votants'], sum(c => c.votants, C)], ['1er tour — exprimés', a.data[0]['Exprimés'], sum(c => c.exprimes, C)],
            ['2nd tour — inscrits', b.data[0]['Inscrits'], sum(c => c.inscrits_t2 || 0, C)], ['2nd tour — votants', b.data[0]['Votants'], sum(c => c.votants_t2 || 0, C)], ['2nd tour — exprimés', b.data[0]['Exprimés'], sum(c => c.exprimes_t2 || 0, C)]];
        out.innerHTML = `<table class="t"><thead><tr><th>Indicateur Gironde</th><th class="num">data.gouv.fr (API)</th><th class="num">Ce site</th><th></th></tr></thead><tbody>` +
            rows.map(r => `<tr><td>${r[0]}</td><td class="num">${fmt(r[1])}</td><td class="num">${fmt(r[2])}</td><td><span class="pill ${r[1] === r[2] ? 'ok' : 'ko'}">${r[1] === r[2] ? 'identique' : 'écart'}</span></td></tr>`).join('') + `</tbody></table>
            <p class="muted" style="margin-top:8px">Totaux du département (fichiers « par département » du ministère de l'Intérieur) comparés à la somme des 12 circonscriptions embarquées. Interrogation le ${new Date().toLocaleString('fr-FR')}.</p>`;
    } catch (e) {
        out.innerHTML = `<div class="note warn">L'interrogation a échoué (${esc(e.message)}). Vérifiez votre connexion : le reste du site fonctionne avec les données embarquées.</div>`;
    }
}

/* ---------- Démarrage ---------- */
(async function main() {
    try {
        await loadAll();
    } catch (e) {
        $('#loader').style.display = 'none';
        const box = $('#loadError'); box.style.display = 'block';
        box.innerHTML = `<strong>Les données n'ont pas pu être chargées</strong> (${esc(e.message)}). Si vous avez ouvert <code>index.html</code> directement depuis le disque, lancez plutôt le site avec « Live Server » (VS Code) ou publiez-le sur Netlify : les navigateurs interdisent la lecture des fichiers de données en <code>file://</code>.`;
        return;
    }
    $('#loader').style.display = 'none';
    initNav();
    initResultats();
    initBiais();
    initScrutins();
    initDonnees();
    if (window.initLab) window.initLab();
})();
