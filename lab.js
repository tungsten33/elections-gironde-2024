/* ==========================================================================
   Laboratoire de redécoupage — cartes multiples, générateur, atelier
   Dépend de app.js (OBS, BL_*, tag, fmt, pct, baseLayer, csv…)
   ========================================================================== */
'use strict';

const ND = 12, TOL_LEGAL = 0.20, MAJ = 7;
const PAIRIDX = { '0,1': 0, '0,2': 1, '1,2': 2 };
const LAB = { sel: [], maps: [], custom: [], msg: '', gen: null, syncing: false };
let U, N, T1, INS, EXP, POP, PR, METRO, NB, NW, CEN, EDGES, BASE, IDEAL, MEANPOP;

/* ---------------------------------------------------------------- modèle */
function prepModel() {
    U = OBS.com.features.map(f => f.properties);
    N = U.length;
    T1 = U.map(u => u.t1); INS = U.map(u => u.ins); EXP = U.map(u => u.exp); POP = U.map(u => u.pop); PR = U.map(u => u.pr); METRO = U.map(u => u.m);
    MEANPOP = POP.reduce((a, b) => a + b, 0) / ND;
    IDEAL = OBS.model.ideal;
    // poids des frontières communes (km)
    NB = U.map(u => u.nb.slice());
    const wmap = U.map(() => new Map());
    EDGES.forEach(([a, b, lines]) => {
        let km = 0;
        lines.forEach(l => { for (let i = 1; i < l.length; i++) { const dx = (l[i][0] - l[i - 1][0]) * 111.32 * Math.cos(44.8 * Math.PI / 180), dy = (l[i][1] - l[i - 1][1]) * 110.57; km += Math.hypot(dx, dy); } });
        wmap[a].set(b, Math.max(km, 0.1)); wmap[b].set(a, Math.max(km, 0.1));
    });
    NW = NB.map((l, k) => l.map(j => wmap[k].get(j) || 0.1));
    // centroïdes des unités
    CEN = new Array(N);
    L.geoJSON(OBS.com).eachLayer(l => { const c = l.getBounds().getCenter(); CEN[l.feature.properties.k] = [c.lat, c.lng]; });
    BASE = OBS.scen.scenarios.find(s => s.id === 'ref').assign;
}

function evalD(s1, si, se, sp) {
    const o = [0, 1, 2].sort((x, y) => s1[y] - s1[x]);
    const top = o[0];
    if (se > 0 && s1[top] > 0.5 * se && s1[top] >= 0.25 * si) return { w: top, elu1: true, a: top, b: o[1], va: s1[top], vb: s1[o[1]] };
    const a = Math.min(o[0], o[1]), b = Math.max(o[0], o[1]);
    const p = PAIRIDX[a + ',' + b], va = sp[2 * p], vb = sp[2 * p + 1];
    return { w: va >= vb ? a : b, elu1: false, a, b, va, vb };
}
function sums(assign) {
    const S = { s1: [], si: new Array(ND).fill(0), se: new Array(ND).fill(0), sp: [], pop: new Array(ND).fill(0), cnt: new Array(ND).fill(0), met: new Array(ND).fill(0) };
    for (let d = 0; d < ND; d++) { S.s1.push([0, 0, 0, 0, 0]); S.sp.push([0, 0, 0, 0, 0, 0]); }
    for (let k = 0; k < N; k++) {
        const d = assign[k];
        for (let q = 0; q < 5; q++) S.s1[d][q] += T1[k][q];
        for (let q = 0; q < 6; q++) S.sp[d][q] += PR[k][q];
        S.si[d] += INS[k]; S.se[d] += EXP[k]; S.pop[d] += POP[k]; S.cnt[d]++; S.met[d] += METRO[k];
    }
    return S;
}
function summary(assign) {
    const S = sums(assign), det = [], seats = [0, 0, 0, 0, 0];
    for (let d = 0; d < ND; d++) { const e = S.cnt[d] ? evalD(S.s1[d], S.si[d], S.se[d], S.sp[d]) : { w: 4, elu1: true, a: 4, b: 4, va: 0, vb: 0 }; det.push(e); seats[e.w]++; }
    const dev = S.pop.map(p => p / MEANPOP - 1);
    let cut = 0;
    for (let a = 0; a < N; a++) NB[a].forEach((b, i) => { if (b > a && assign[a] !== assign[b]) cut += NW[a][i]; });
    let moved = 0; for (let k = 0; k < N; k++) if (assign[k] !== BASE[k]) moved++;
    const mixed = S.cnt.reduce((n, c, d) => n + (S.met[d] > 0 && S.met[d] < c ? 1 : 0), 0);
    return { S, det, seats, dev, devmax: Math.max(...dev.map(Math.abs)), cut, moved, mixed };
}
function allScen() { return OBS.scen.scenarios.concat(LAB.custom); }
function getScen(id) { return allScen().find(s => s.id === id); }
function sumOf(sc) { return sc._sum || (sc._sum = summary(sc.assign)); }

/* contiguïté */
function members(assign, d) { const r = []; for (let k = 0; k < N; k++) if (assign[k] === d) r.push(k); return r; }
function connectedWithout(assign, d, u) {
    const m = members(assign, d).filter(k => k !== u);
    if (!m.length) return false;
    const seen = new Set([m[0]]), st = [m[0]];
    while (st.length) { const x = st.pop(); NB[x].forEach(y => { if (y !== u && !seen.has(y) && assign[y] === d) { seen.add(y); st.push(y); } }); }
    return seen.size === m.length;
}

/* frontières entre circonscriptions (lignes lat/lng) */
function boundaryLines(assign) {
    const out = [];
    EDGES.forEach(([a, b, lines]) => { if (assign[a] !== assign[b]) lines.forEach(l => out.push(l.map(p => [p[1], p[0]]))); });
    return out;
}

/* ------------------------------------------------------- liste & sélection */
function seatChips(s) { return [1, 2, 0].map(b => `<span class="tag ${BL_CLS[b]}" style="margin-right:4px">${BL_SHORT[b]} ${s.seats[b]}</span>`).join(''); }
function renderList() {
    const groups = {};
    allScen().forEach(sc => (groups[sc.groupe] = groups[sc.groupe] || []).push(sc));
    $('#scenList').innerHTML = Object.entries(groups).map(([g, list]) => `<h4 class="sub" style="margin:12px 0 6px">${esc(g)}</h4>` + list.map(sc => {
        const s = sumOf(sc), on = LAB.sel.includes(sc.id);
        return `<div class="scen-item ${on ? 'active' : ''}" data-id="${sc.id}"><div class="scen-title">${on ? '● ' : '○ '}${esc(sc.titre)}</div>
            <div style="margin:4px 0">${seatChips(s)}</div><div class="small muted">${esc(sc.desc)}</div></div>`;
    }).join(''));
    $$('#scenList .scen-item').forEach(el => el.addEventListener('click', () => toggle(el.dataset.id)));
    // select de l'atelier
    const cur = $('#edBase').value;
    $('#edBase').innerHTML = allScen().map(sc => `<option value="${sc.id}">${esc(sc.titre)}</option>`).join('');
    if (cur) $('#edBase').value = cur;
}
function toggle(id) {
    const i = LAB.sel.indexOf(id);
    if (i >= 0) { if (LAB.sel.length > 1) LAB.sel.splice(i, 1); }
    else { if (LAB.sel.length >= 4) LAB.sel.shift(); LAB.sel.push(id); }
    LAB.msg = '';
    refresh();
}
function setSel(ids, msg) { LAB.sel = ids.slice(0, 4); LAB.msg = msg || ''; refresh(); }
function bestFor(b) {
    let best = null;
    allScen().forEach(sc => { const s = sumOf(sc); if (!best || s.seats[b] > best.s.seats[b] || (s.seats[b] === best.s.seats[b] && s.devmax < best.s.devmax)) best = { sc, s }; });
    return best;
}
function quick(k) {
    if (k === 'comp') {
        const r = [0, 1, 2].map(bestFor);
        setSel(['ref', ...r.map(x => x.sc.id)].filter((v, i, a) => a.indexOf(v) === i), `Meilleur résultat trouvé : RN ${r[0].s.seats[0]} sièges, NFP ${r[1].s.seats[1]}, Ensemble ${r[2].s.seats[2]} (majorité absolue : ${MAJ} sièges sur 12).`);
        return;
    }
    const b = { rn: 0, nfp: 1, ens: 2 }[k], r = bestFor(b), n = r.s.seats[b];
    const maj = n >= MAJ ? `Ce découpage donne la majorité absolue (${n} sièges sur 12).` : `Aucun découpage disponible ne donne la majorité absolue (${MAJ} sièges) à ${BL_SHORT[b]} : le maximum trouvé est ${n}. Le générateur permet d'essayer d'aller plus loin.`;
    setSel(['ref', r.sc.id], `${BL_SHORT[b]} : meilleure carte « ${r.sc.titre} » avec ${n} siège${n > 1 ? 's' : ''} sur 12 (2024 : ${sumOf(getScen('ref')).seats[b]}). ${maj}`);
}

/* --------------------------------------------------------------- cartes */
function refresh() { renderList(); renderMaps(); renderCompare(); }
function renderCompare() {
    const rows = LAB.sel.map(id => { const sc = getScen(id), s = sumOf(sc); return { sc, s }; });
    $('#tableCompare').innerHTML = `<thead><tr><th>Découpage</th><th class="num">NFP</th><th class="num">Ensemble</th><th class="num">RN</th><th class="num">Écart de population max</th><th class="num">Communes déplacées</th><th class="num">Frontières (km)</th><th class="num">Circos mêlant métropole et rural</th></tr></thead><tbody>` +
        rows.map(({ sc, s }) => `<tr><td><strong>${esc(sc.titre)}</strong></td>${[1, 2, 0].map(b => `<td class="num" style="${s.seats[b] >= MAJ ? 'font-weight:800;color:' + BL_COL[b] : ''}">${s.seats[b]}${s.seats[b] >= MAJ ? ' ★' : ''}</td>`).join('')}
        <td class="num">±${(s.devmax * 100).toFixed(1).replace('.', ',')} %</td><td class="num">${s.moved}</td><td class="num">${Math.round(s.cut)}</td><td class="num">${s.mixed}</td></tr>`).join('') + '</tbody>';
    const nb = rows.length;
    $('#labSummary').innerHTML = (LAB.msg ? `<strong>${esc(LAB.msg)}</strong><br>` : '') + `${nb} carte${nb > 1 ? 's' : ''} affichée${nb > 1 ? 's' : ''}. Couleur = camp qui l'emporte dans la circonscription (modèle de 2nd tour) ; traits épais = limites des circonscriptions ; ★ = majorité absolue (${MAJ} sièges).`;
}
function winColor(b) { return BL_COL[b]; }
function styleFor(sm, k) { const e = sm.det[sm.assignRef[k]]; return { fillColor: winColor(e.w), fillOpacity: .62, color: '#fff', weight: .4, opacity: .6 }; }

function renderMaps() {
    LAB.maps.forEach(m => m.map.remove()); LAB.maps = [];
    const g = $('#mapsGrid'); g.className = 'maps-grid n' + LAB.sel.length;
    g.innerHTML = LAB.sel.map((id, i) => {
        const sc = getScen(id), s = sumOf(sc);
        return `<div class="map-card"><div class="map-card-head"><div class="map-card-title">${esc(sc.titre)}</div><div>${seatChips(s)}</div>
            <div class="small muted">Écart max ±${(s.devmax * 100).toFixed(1).replace('.', ',')} % · ${s.moved} commune${s.moved > 1 ? 's' : ''} déplacée${s.moved > 1 ? 's' : ''}</div></div><div class="map" id="lm${i}"></div></div>`;
    }).join('');
    const ortho = $('#optOrtho').checked, showBase = $('#optBase').checked;
    LAB.sel.forEach((id, i) => {
        const sc = getScen(id), s = sumOf(sc), assign = sc.assign;
        const map = L.map('lm' + i, { preferCanvas: true, scrollWheelZoom: false, zoomSnap: .25 }).fitBounds(GIRONDE_VIEW);
        baseLayer(ortho ? 'ortho' : 'plan').addTo(map);
        const byK = {};
        const geo = L.geoJSON(OBS.com, {
            style: f => ({ fillColor: winColor(s.det[assign[f.properties.k]].w), fillOpacity: .62, color: '#fff', weight: .4, opacity: .6 }),
            onEachFeature: (f, l) => {
                byK[f.properties.k] = l;
                const p = f.properties, d = assign[p.k], e = s.det[d];
                l.bindTooltip(`<strong>${esc(p.nom)}</strong><br>${fmt(p.pop)} hab. · circonscription n° ${d + 1}<br>Dans cette circonscription : ${BL_SHORT[e.w]}`, { sticky: true });
            }
        }).addTo(map);
        L.polyline(boundaryLines(assign), { color: '#09131F', weight: 3, interactive: false }).addTo(map);
        if (showBase && sc.id !== 'ref') L.polyline(boundaryLines(BASE), { color: '#D4A017', weight: 2.5, dashArray: '7 5', interactive: false }).addTo(map);
        // numéros
        for (let d = 0; d < ND; d++) {
            let w = 0, la = 0, ln = 0;
            for (let k = 0; k < N; k++) if (assign[k] === d) { w += POP[k]; la += CEN[k][0] * POP[k]; ln += CEN[k][1] * POP[k]; }
            if (!w) continue;
            L.marker([la / w, ln / w], { interactive: false, icon: L.divIcon({ className: '', html: `<span class="dist-label">${d + 1}</span>`, iconSize: [0, 0] }) }).addTo(map);
        }
        LAB.maps.push({ map, id });
    });
    // synchronisation
    LAB.maps.forEach(m => m.map.on('moveend', () => {
        if (!$('#optSync').checked || LAB.syncing) return;
        LAB.syncing = true;
        LAB.maps.forEach(o => { if (o !== m) o.map.setView(m.map.getCenter(), m.map.getZoom(), { animate: false }); });
        LAB.syncing = false;
    }));
}

/* --------------------------------------------------------- générateur SA */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function saStart(cfg) {
    const rnd = rng(cfg.seed), K = 300;
    const P = cfg.party, tol = cfg.tol, Ws = cfg.w_seat || 0, Wd = cfg.w_dev || 0, Wc = cfg.w_cut || 0, Wm = cfg.w_mix || 0, Wv = cfg.w_move || 0, Wp = cfg.w_prop || 0;
    const assign = cfg.start.slice();
    const S1 = [], SP = [], SI = new Array(ND).fill(0), SE = new Array(ND).fill(0), SPOP = new Array(ND).fill(0), CNT = new Array(ND).fill(0), MT = new Array(ND).fill(0), mem = [];
    for (let d = 0; d < ND; d++) { S1.push([0, 0, 0, 0, 0]); SP.push([0, 0, 0, 0, 0, 0]); mem.push(new Set()); }
    for (let k = 0; k < N; k++) { const d = assign[k]; for (let q = 0; q < 5; q++) S1[d][q] += T1[k][q]; for (let q = 0; q < 6; q++) SP[d][q] += PR[k][q]; SI[d] += INS[k]; SE[d] += EXP[k]; SPOP[d] += POP[k]; CNT[d]++; MT[d] += METRO[k]; mem[d].add(k); }
    const winOf = d => evalD(S1[d], SI[d], SE[d], SP[d]).w;
    function local(d) {
        const w = winOf(d), dev = SPOP[d] / MEANPOP - 1;
        let e = K * Math.max(0, Math.abs(dev) - tol) + Wd * dev * dev * 100;
        if (P != null && Ws) e -= Ws * ((w === P ? 1 : 0) + 0.3 * (SE[d] ? S1[d][P] / SE[d] : 0));
        if (Wm) e += Wm * Math.min(MT[d], CNT[d] - MT[d]) / 20;
        return [e, w];
    }
    const glob = wl => { if (!Wp) return 0; const c = [0, 0, 0, 0, 0]; wl.forEach(w => c[w]++); let s = 0; for (let b = 0; b < 5; b++) s += Math.abs(c[b] - IDEAL[b]); return Wp * s; };
    const loc = [], win = [];
    for (let d = 0; d < ND; d++) { const r = local(d); loc.push(r[0]); win.push(r[1]); }
    let cut = 0; for (let a = 0; a < N; a++) NB[a].forEach((b, i) => { if (b > a && assign[a] !== assign[b]) cut += NW[a][i]; });
    let moved = 0; for (let k = 0; k < N; k++) if (assign[k] !== BASE[k]) moved++;
    let E = loc.reduce((a, b) => a + b, 0) + glob(win) + Wc * cut + Wv * moved / N * 10;
    let best = { E, assign: assign.slice() }, it = 0, acc = 0;
    const iters = cfg.iters, T0 = cfg.t0, TF = cfg.t1;
    function step(n) {
        const end = Math.min(iters, it + n);
        for (; it < end; it++) {
            const T = T0 * Math.pow(TF / T0, it / iters);
            const u = Math.floor(rnd() * N), a = assign[u], nbs = NB[u];
            const v = nbs[Math.floor(rnd() * nbs.length)], b = assign[v];
            if (a === b || CNT[a] <= 1) continue;
            const t = T1[u], p = PR[u];
            for (let q = 0; q < 5; q++) { S1[a][q] -= t[q]; S1[b][q] += t[q]; }
            for (let q = 0; q < 6; q++) { SP[a][q] -= p[q]; SP[b][q] += p[q]; }
            SI[a] -= INS[u]; SI[b] += INS[u]; SE[a] -= EXP[u]; SE[b] += EXP[u]; SPOP[a] -= POP[u]; SPOP[b] += POP[u]; CNT[a]--; CNT[b]++; MT[a] -= METRO[u]; MT[b] += METRO[u];
            const [ea, wa] = local(a), [eb, wb] = local(b);
            let dcut = 0; NB[u].forEach((x, i) => { const ax = assign[x]; if (ax === a) dcut += NW[u][i]; else if (ax === b) dcut -= NW[u][i]; });
            let dE = ea + eb - loc[a] - loc[b] + Wc * dcut + Wv * ((b !== BASE[u] ? 1 : 0) - (a !== BASE[u] ? 1 : 0)) / N * 10;
            if (Wp) { const wl = win.slice(); wl[a] = wa; wl[b] = wb; dE += glob(wl) - glob(win); }
            let ok = dE <= 0 || rnd() < Math.exp(-dE / T);
            if (ok) { // contiguïté du district source
                let start = -1; for (const x of mem[a]) if (x !== u) { start = x; break; }
                const seen = new Set([start]), st = [start];
                while (st.length) { const x = st.pop(); NB[x].forEach(y => { if (y !== u && !seen.has(y) && assign[y] === a) { seen.add(y); st.push(y); } }); }
                ok = seen.size === CNT[a];
            }
            if (ok) {
                assign[u] = b; mem[a].delete(u); mem[b].add(u); loc[a] = ea; loc[b] = eb; win[a] = wa; win[b] = wb; E += dE; acc++;
                if (E < best.E - 1e-9) best = { E, assign: assign.slice() };
            } else {
                for (let q = 0; q < 5; q++) { S1[a][q] += t[q]; S1[b][q] -= t[q]; }
                for (let q = 0; q < 6; q++) { SP[a][q] += p[q]; SP[b][q] -= p[q]; }
                SI[a] += INS[u]; SI[b] -= INS[u]; SE[a] += EXP[u]; SE[b] -= EXP[u]; SPOP[a] += POP[u]; SPOP[b] -= POP[u]; CNT[a]++; CNT[b]--; MT[a] += METRO[u]; MT[b] -= METRO[u];
            }
        }
        return it >= iters;
    }
    return { step, progress: () => it / iters, best: () => best, acc: () => acc };
}

const EFFORT = [0, 60000, 150000, 300000, 700000, 1500000], EFFORT_LABEL = ['', 'léger', 'modéré', 'moyen', 'soutenu', 'intensif'];
function genConfig() {
    const obj = $('#genObj').value, tol = +$('#genTol').value / 100, cmp = +$('#genCmp').value, fid = +$('#genFid').value, eff = +$('#genEff').value;
    const cfg = { tol, w_cut: cmp * 0.04, w_move: fid * 0.15, iters: EFFORT[eff], t0: .5, t1: .008, start: BASE.slice(), seed: 1000 + LAB.custom.length * 17 + Math.floor(Math.random() * 1e4) };
    let label;
    if (['0', '1', '2'].includes(obj)) { cfg.party = +obj; cfg.w_seat = 1; label = 'Avantage ' + BL_SHORT[+obj]; }
    else if (obj === 'eq') { cfg.w_dev = 6; label = 'Populations égalisées'; }
    else if (obj === 'prop') { cfg.w_prop = 1; label = 'Proche de la proportionnelle'; }
    else { cfg.w_mix = 1.2; cfg.w_dev = .5; label = 'Métropole séparée du rural'; }
    return { cfg, label };
}
function initGenerator() {
    const upd = () => { $('#vTol').textContent = '±' + $('#genTol').value + ' %'; $('#vCmp').textContent = (+$('#genCmp').value / 10).toFixed(1).replace('.', ','); $('#vFid').textContent = $('#genFid').value; $('#vEff').textContent = EFFORT_LABEL[+$('#genEff').value]; };
    ['genTol', 'genCmp', 'genFid', 'genEff'].forEach(id => $('#' + id).addEventListener('input', upd)); upd();
    $('#genObj').addEventListener('change', e => {
        const v = e.target.value, t = { eq: 5, prop: 15, met: 10 }[v] || 15;
        $('#genTol').value = t; if (v === 'eq') $('#genCmp').value = 1; upd();
    });
    $('#btnGen').addEventListener('click', () => {
        if (LAB.gen) return;
        const { cfg, label } = genConfig();
        const run = saStart(cfg), bar = $('#genProg'), btn = $('#btnGen');
        LAB.gen = run; btn.disabled = true; btn.textContent = 'Calcul en cours…'; bar.style.display = 'block'; $('#genMsg').textContent = '';
        const tick = () => {
            const done = run.step(15000);
            bar.firstElementChild.style.width = Math.round(run.progress() * 100) + '%';
            if (!done) return setTimeout(tick, 0);
            const best = run.best().assign;
            const sc = { id: 'perso' + (LAB.custom.length + 1), titre: `${label} (n° ${LAB.custom.length + 1})`, groupe: 'Mes découpages', desc: `Généré dans votre navigateur : tolérance ±${Math.round(cfg.tol * 100)} %, compacité ${$('#vCmp').textContent}, proximité 2024 ${$('#vFid').textContent}.`, assign: best };
            const s = sumOf(sc); LAB.custom.push(sc);
            LAB.gen = null; btn.disabled = false; btn.textContent = 'Générer la carte'; bar.style.display = 'none';
            const b = cfg.party; const n = b != null ? s.seats[b] : null;
            $('#genMsg').textContent = `Résultat : NFP ${s.seats[1]}, Ensemble ${s.seats[2]}, RN ${s.seats[0]} · écart de population max ±${(s.devmax * 100).toFixed(1).replace('.', ',')} %.` + (n != null && n < MAJ ? ` ${BL_SHORT[b]} n'atteint pas la majorité absolue (${MAJ}) avec ces contraintes ; élargir la tolérance ou relancer peut aider.` : '');
            setSel(LAB.sel.filter(i => i === 'ref').concat(LAB.sel.filter(i => i !== 'ref').slice(-2)).concat([sc.id]), '');
        };
        setTimeout(tick, 20);
    });
}

/* --------------------------------------------------------------- atelier */
const ED = { map: null, assign: null, geo: null, byK: {}, line: null, labels: [], sel: null, base: null, name: '' };
function startEditor() {
    const sc = getScen($('#edBase').value);
    ED.assign = sc.assign.slice(); ED.name = sc.titre; ED.sel = null;
    $('#edBody').style.display = 'block';
    if (ED.map) { ED.map.remove(); ED.map = null; }
    ED.map = L.map('edMap', { preferCanvas: true, scrollWheelZoom: false, zoomSnap: .25 }).fitBounds(GIRONDE_VIEW);
    baseLayer($('#optOrtho').checked ? 'ortho' : 'plan').addTo(ED.map);
    ED.geo = L.geoJSON(OBS.com, { onEachFeature: (f, l) => { ED.byK[f.properties.k] = l; l.on('click', () => { ED.sel = f.properties.k; edRender(); }); } }).addTo(ED.map);
    ED.line = null; ED.labels = [];
    edRender(); setTimeout(() => ED.map.invalidateSize(), 100);
}
function edRender() {
    const s = summary(ED.assign);
    for (let k = 0; k < N; k++) {
        const l = ED.byK[k], sel = k === ED.sel;
        l.setStyle({ fillColor: winColor(s.det[ED.assign[k]].w), fillOpacity: sel ? .95 : .6, color: sel ? '#000' : '#fff', weight: sel ? 3 : .4, opacity: sel ? 1 : .6 });
        l.unbindTooltip(); l.bindTooltip(`<strong>${esc(U[k].nom)}</strong> · circo ${ED.assign[k] + 1}`, { sticky: true });
    }
    if (ED.line) ED.map.removeLayer(ED.line);
    ED.line = L.polyline(boundaryLines(ED.assign), { color: '#09131F', weight: 3, interactive: false }).addTo(ED.map);
    ED.labels.forEach(m => ED.map.removeLayer(m)); ED.labels = [];
    for (let d = 0; d < ND; d++) {
        let w = 0, la = 0, ln = 0; for (let k = 0; k < N; k++) if (ED.assign[k] === d) { w += POP[k]; la += CEN[k][0] * POP[k]; ln += CEN[k][1] * POP[k]; }
        if (w) ED.labels.push(L.marker([la / w, ln / w], { interactive: false, icon: L.divIcon({ className: '', html: `<span class="dist-label">${d + 1}</span>`, iconSize: [0, 0] }) }).addTo(ED.map));
    }
    // panneau
    let h = '';
    if (ED.sel != null) {
        const k = ED.sel, a = ED.assign[k], u = U[k];
        const targets = [...new Set(NB[k].map(j => ED.assign[j]).filter(d => d !== a))].sort((x, y) => x - y);
        const canLeave = connectedWithout(ED.assign, a, k);
        h += `<div class="note" style="margin-bottom:12px"><strong>${esc(u.nom)}</strong> — ${fmt(u.pop)} hab., circonscription ${a + 1}.<br>${canLeave ? 'Rattacher à :' : '<span style="color:#B91C1C">Cette commune ne peut pas quitter sa circonscription : elle la couperait en deux (ou la viderait).</span>'}
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${canLeave ? targets.map(d => {
                const newPopT = s.S.pop[d] + u.pop, newPopS = s.S.pop[a] - u.pop, ok = Math.abs(newPopT / MEANPOP - 1) <= TOL_LEGAL && Math.abs(newPopS / MEANPOP - 1) <= TOL_LEGAL;
                return `<button class="btn btn-outline sm" data-to="${d}" ${ok ? '' : 'title="Dépasse ±20 % de la moyenne"'}>Circo ${d + 1}${ok ? '' : ' ⚠'}</button>`;
            }).join('') : ''}</div>${canLeave ? '<div class="small muted" style="margin-top:6px">⚠ : un déplacement qui fait dépasser ±20 % d\'écart à la moyenne départementale.</div>' : ''}</div>`;
    } else h += `<div class="note" style="margin-bottom:12px">Cliquez sur une commune de la carte pour la déplacer vers une circonscription voisine.</div>`;
    h += `<table class="t"><thead><tr><th>Circo</th><th class="num">Population</th><th class="num">Écart</th><th>Résultat</th></tr></thead><tbody>` + s.det.map((e, d) => {
        const dv = s.dev[d] * 100, bad = Math.abs(dv) > TOL_LEGAL * 100;
        return `<tr><td>${d + 1}</td><td class="num">${fmt(s.S.pop[d])}</td><td class="num" style="${bad ? 'color:#B91C1C;font-weight:700' : ''}">${sgn(dv)} %</td><td>${tag(e.w)} <span class="small muted">${e.elu1 ? '1er tour' : BL_SHORT[e.a] + '–' + BL_SHORT[e.b] + ' (' + fmt(Math.round(e.va)) + ' / ' + fmt(Math.round(e.vb)) + ')'}</span></td></tr>`;
    }).join('') + `</tbody></table>
        <p style="margin-top:10px"><strong>Sièges :</strong> NFP ${s.seats[1]} · Ensemble ${s.seats[2]} · RN ${s.seats[0]} · ${s.moved} commune${s.moved > 1 ? 's' : ''} déplacée${s.moved > 1 ? 's' : ''}</p>
        <div class="flex gap flex-wrap" style="margin-top:10px"><button class="btn btn-outline sm" id="edReset">Réinitialiser</button><button class="btn btn-primary sm" id="edSave">Afficher comme carte</button><button class="btn btn-outline sm" id="edCsv">Exporter (CSV)</button></div>`;
    $('#edSide').innerHTML = h;
    $$('#edSide [data-to]').forEach(b => b.addEventListener('click', () => { ED.assign[ED.sel] = +b.dataset.to; ED.sel = null; edRender(); }));
    $('#edReset').addEventListener('click', () => { ED.assign = getScen($('#edBase').value).assign.slice(); ED.sel = null; edRender(); });
    $('#edSave').addEventListener('click', () => {
        const sc = { id: 'perso' + (LAB.custom.length + 1), titre: `Atelier : ${ED.name} retouchée (n° ${LAB.custom.length + 1})`, groupe: 'Mes découpages', desc: `Retouchée à la main à partir de « ${ED.name} ».`, assign: ED.assign.slice() };
        LAB.custom.push(sc); setSel(LAB.sel.filter(i => i === 'ref').concat(LAB.sel.filter(i => i !== 'ref').slice(-2)).concat([sc.id]), '');
        $('#labSummary').scrollIntoView({ behavior: 'smooth' });
    });
    $('#edCsv').addEventListener('click', () => csv('decoupage_gironde.csv', ['Unité', 'Code', 'Circonscription'], U.map((u, k) => [u.nom, u.id, ED.assign[k] + 1])));
}

/* ------------------------------------------------------------- démarrage */
window.initLab = async function () {
    try { EDGES = await fetch('data/edges.json').then(r => r.json()); } catch (e) { $('#labSummary').textContent = 'Données du laboratoire indisponibles : ' + e.message; return; }
    prepModel();
    LAB.sel = ['ref', 'rn_modere', 'nfp_modere', 'ens_modere'].filter(id => getScen(id));
    $$('[data-quick]').forEach(b => b.addEventListener('click', () => quick(b.dataset.quick)));
    ['optBase', 'optOrtho'].forEach(id => $('#' + id).addEventListener('change', renderMaps));
    $('#edStart').addEventListener('click', startEditor);
    initGenerator();
    refresh();
    window.addEventListener('tabshown', e => {
        if (e.detail !== 'tab-lab') return;
        setTimeout(() => { LAB.maps.forEach(m => { m.map.invalidateSize(); m.map.fitBounds(GIRONDE_VIEW); }); ED.map && ED.map.invalidateSize(); }, 150);
    });
};
