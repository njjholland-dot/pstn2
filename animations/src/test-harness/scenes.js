// PSTN2 test harness — three CPs (Range Holders with ported numbers) and Ofcom,
// answering "who has this number?" with the real Number Discovery engine.
//
// The narrated tour replays events recorded from harness-engine.js running the
// fixture scenarios (test-environment/fixtures/scenarios.json); the final scene runs
// the same engine live. Every message shown is the engine's actual request/answer.
import { createDeck } from '../../shared/pstn2-player.js';
import { jsonHtml } from '../../shared/pstn2-components.js';
import { Network, DiscoveryClient, networkTransport, digitsOf, displayNumber, findBlock } from './harness-engine.js';

const fixture = await fetch('harness-network.json').then((r) => r.json());
const { scenarios } = await fetch('scenarios.json').then((r) => r.json());
const clone = (v) => JSON.parse(JSON.stringify(v));

const CPS = fixture.cps;
const NAME = Object.fromEntries(CPS.map((c) => [c.cpId, c.cpName]));
const COLOUR = { 'CP1-UK-0101': 'blue', 'CP1-UK-0102': 'green', 'CP1-UK-0103': 'amber' };
const BLOCK_OF = Object.fromEntries(fixture.numberingList.blocks.map((b) => [b.cpId, b.display]));
const short = (cpId) => (NAME[cpId] || cpId).split(' ')[0];
const ISSUED = '2026-10-06T09:00:00Z';

// ---------------------------------------------------------------------------
// Record the tour: run scenarios A–F in order through the engine, keeping caches.
// ---------------------------------------------------------------------------
function snapshot(net, clients) {
    return {
        cps: clone([...net.cps.values()]),
        caches: Object.fromEntries([...clients].map(([id, c]) => [id, c.cacheEntries().map((e) => ({ number: e.number, holder: e.holder.cpId }))])),
    };
}
function makeNetwork() {
    const net = new Network(fixture);
    const clients = new Map(CPS.map((cp) => [cp.cpId, new DiscoveryClient({ cpId: cp.cpId, numberingList: net.numberingList, transport: networkTransport(net) })]));
    return { net, clients };
}
async function record() {
    const { net, clients } = makeNetwork();
    const out = { initial: snapshot(net, clients) };
    for (const sc of scenarios) {
        const rec = { before: snapshot(net, clients) };
        if (sc.before?.port) {
            const p = sc.before.port;
            net.port(p.number, p.fromCpId, p.toCpId);
            rec.afterPort = snapshot(net, clients);
        }
        rec.events = [];
        rec.result = await clients.get(sc.callerCp).discover(sc.number, { onEvent: (e) => { rec.events.push(clone(e)); } });
        rec.after = snapshot(net, clients);
        out[sc.id] = rec;
    }
    return out;
}
const TOUR = await record();

// ---------------------------------------------------------------------------
// The diagram
// ---------------------------------------------------------------------------
const L = {
    call: { x: 0, y: 0, w: 400 },
    ofcom: { x: 430, y: 0, w: 868 },
    insp: { x: 1328, y: 0, w: 400, h: 296 },
    cpY: 330,
    cpW: 556,
    cpX: [0, 586, 1172],
};

function dbRows(cp) {
    const rows = cp.ranges.map((p) => ({ key: 'range', n: fixture.numberingList.blocks.find((b) => b.prefix === p)?.display || p, st: 'Range · allocated by Ofcom', cls: 'range' }));
    for (const n of cp.inService) rows.push({ key: n, n: displayNumber(n), st: 'In service', cls: '' });
    for (const p of cp.portedIn) rows.push({ key: p.number, n: displayNumber(p.number), st: `Ported in ← ${short(p.fromCpId)}`, cls: 'in' });
    for (const p of cp.portedOut) rows.push({ key: p.number, n: displayNumber(p.number), st: `Ported out → ${short(p.toCpId)}`, cls: 'out' });
    return rows;
}

function world(s, snap, { callerId = 'CP1-UK-0101', interactive = false, hidden = false } = {}) {
    const ui = { s, panels: {}, dbBody: {}, cacheBody: {}, conns: [], snap: clone(snap), callerId };

    // Ofcom numbering list
    const rows = fixture.numberingList.blocks.map((b) => `<tr data-prefix="${b.prefix}"><td class="n">${b.display}</td><td>${b.cpName}</td><td class="url ${b.rangeHolderUrl ? '' : 'none'}">${b.rangeHolderUrl ? b.rangeHolderUrl.replace('https://', '') : '— none (not participating)'}</td></tr>`).join('');
    ui.ofcom = s.el(`<div class="th-head"><div class="p2-chip">${s.icon('landmark', { size: 28 })}</div><div><div class="th-name">Ofcom</div><div class="th-sub">Numbering list S1–S9 · simulated</div></div></div>
        <table class="th-t" style="margin-top:10px"><thead><tr><th>Number block</th><th>Allocated to (Range Holder)</th><th class="new">Range Holder URL · PSTN2 field</th></tr></thead><tbody>${rows}</tbody></table>`,
    { ...L.ofcom, cls: 'th-panel th-ofcom', colour: 'gold', hidden, from: 'down' });

    // Call panel / form
    if (interactive) ui.form = buildForm(s, ui);
    else {
        ui.call = s.el(`<div class="th-head"><div class="p2-chip" style="--c:var(--blue)">${s.icon('phone-outgoing', { size: 26 })}</div><div><div class="th-name">Call</div><div class="th-sub" data-who>${NAME[callerId]} dials</div></div></div>
            <div class="th-dial" data-dial></div><ul class="th-trace" data-trace></ul><div class="th-result" data-result></div>`,
        { ...L.call, cls: 'th-panel th-call', colour: 'blue', hidden, from: 'left', style: 'height:300px;overflow:hidden;' });
    }
    // Inspector
    ui.insp = s.el(`<div class="th-label" style="margin-top:0">Message <span class="th-flag" data-status>—</span></div><div class="req" data-req>Waiting for a call…</div><pre data-json></pre>`,
        { ...L.insp, cls: 'th-panel th-insp', colour: 'violet', hidden, from: 'right', style: `height:${L.insp.h}px;overflow:hidden;` });

    // CP panels
    CPS.forEach((cp, i) => {
        const panel = s.el(`<div class="th-head"><div class="p2-chip">${s.icon('building-2', { size: 28 })}</div><div><div class="th-name">${cp.cpName}</div><div class="th-sub">Range Holder · ${BLOCK_OF[cp.cpId]}</div></div></div>
            <div class="th-label">Number database</div><table class="th-t"><tbody data-db></tbody></table>
            <div class="th-label">Cache <span class="th-flag" data-cacheflag>empty</span></div><table class="th-t"><tbody data-cache></tbody></table>`,
        { x: L.cpX[i], y: L.cpY, w: L.cpW, cls: 'th-panel', colour: COLOUR[cp.cpId], hidden, from: 'up' });
        ui.panels[cp.cpId] = panel;
        ui.dbBody[cp.cpId] = panel.querySelector('[data-db]');
        ui.cacheBody[cp.cpId] = panel.querySelector('[data-cache]');
    });
    renderDb(ui, ui.snap);
    renderCaches(ui, ui.snap);
    return ui;
}

function renderDb(ui, snap, { flash = [] } = {}) {
    for (const cp of snap.cps) {
        ui.dbBody[cp.cpId].innerHTML = dbRows(cp).map((r) => `<tr class="${r.cls} ${flash.includes(`${cp.cpId}|${r.key}`) ? 'flash' : ''}" data-n="${r.key}"><td class="n">${r.n}</td><td class="st">${r.st}</td></tr>`).join('');
    }
}
function renderCaches(ui, snap, { flash = null } = {}) {
    for (const cp of CPS) {
        const entries = snap.caches[cp.cpId] || [];
        const body = ui.cacheBody[cp.cpId];
        body.innerHTML = entries.length
            ? entries.map((e) => `<tr data-n="${e.number}" class="${flash === `${cp.cpId}|${e.number}` ? 'flash' : ''}"><td class="n">${displayNumber(e.number)}</td><td class="st">→ ${NAME[e.holder]}</td><td class="st" style="color:var(--ink-4)">24 h</td></tr>`).join('')
            : '<tr class="empty"><td colspan="3">no entries yet</td></tr>';
        const flag = ui.panels[cp.cpId].querySelector('[data-cacheflag]');
        flag.textContent = entries.length ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}` : 'empty';
        flag.className = `th-flag ${entries.length ? 'ok' : ''}`;
    }
}
function hlRow(ui, tbody, key, colour) {
    tbody.querySelectorAll('tr').forEach((tr) => tr.classList.remove('hl'));
    const tr = tbody.querySelector(`tr[data-n="${CSS.escape(key)}"]`);
    if (tr) { tr.classList.add('hl'); tr.style.setProperty('--hl', ui.s.colour(colour)); }
    return tr;
}
function clearHl(ui) {
    ui.s.root.querySelectorAll('tr.hl').forEach((tr) => tr.classList.remove('hl'));
    Object.values(ui.panels).forEach((p) => ui.s.activate(p, false));
    ui.s.activate(ui.ofcom, false);
}

function trace(ui, iconName, colour, html) {
    if (!ui.call) return;
    const li = document.createElement('li');
    li.innerHTML = `${ui.s.icon(iconName, { size: 20, colour: ui.s.colour(colour) })}<span>${html}</span>`;
    const list = ui.call.querySelector('[data-trace]');
    list.append(li);
    while (list.children.length > 3) list.firstElementChild.remove();
}
function result(ui, kind, html) {
    const el = ui.call ? ui.call.querySelector('[data-result]') : ui.insp.querySelector('[data-status]');
    if (ui.call) { el.className = `th-result show ${kind}`; el.innerHTML = html; } else { el.className = `th-flag ${kind === 'ok' ? 'ok' : kind === 'warn' ? 'warn' : 'bad'}`; el.innerHTML = html; }
}
function startCall(ui, callerId, number) {
    ui.callerId = callerId;
    clearHl(ui);
    ui.conns.forEach((c) => c.fade(300));
    ui.conns = [];
    if (ui.call) {
        ui.call.querySelector('[data-who]').textContent = `${NAME[callerId]} dials`;
        ui.call.querySelector('[data-trace]').innerHTML = '';
        ui.call.querySelector('[data-result]').className = 'th-result';
        inspect(ui, { req: 'Waiting for the first message…', status: '—', body: undefined });
        return ui.s.type(ui.call.querySelector('[data-dial]'), displayNumber(number), { cps: 18 });
    }
    return Promise.resolve();
}
function inspect(ui, { req, status, statusKind = '', body }) {
    if (req) ui.insp.querySelector('[data-req]').textContent = req;
    const st = ui.insp.querySelector('[data-status]');
    if (status) { st.textContent = status; st.className = `th-flag ${statusKind}`; }
    if (body && typeof body === 'object') {
        body = JSON.parse(JSON.stringify(body).replaceAll('https://', ''));
        delete body.version; delete body.issued;
    }
    ui.insp.querySelector('[data-json]').innerHTML = body === undefined ? '' : body === null ? '<span class="p">404 · no body</span>' : jsonHtml(body, { expand: true });
}

function connectCps(ui, fromId, toId, colour = 'blue') {
    const s = ui.s;
    const a = ui.panels[fromId], b = ui.panels[toId];
    const ia = CPS.findIndex((c) => c.cpId === fromId), ib = CPS.findIndex((c) => c.cpId === toId);
    const dir = Math.sign(ib - ia);
    const dx = (L.cpX[ib] - L.cpX[ia]);
    const conn = s.connect(a, b, { from: 't', to: 't', colour, width: 4, bend: -dir * Math.min(0.2, 90 / Math.abs(dx)), fromOpts: { dx: dir * 120 }, toOpts: { dx: -dir * 120 }, duration: 600 });
    ui.conns.push(conn);
    return conn;
}

/** Animate one engine event. `voice` = speak a stock phrase (interactive mode). */
async function play(ui, ev, { voice = false, pace = 1 } = {}) {
    const s = ui.s;
    const caller = ui.callerId;
    const say = (id) => (voice && s.phrase ? s.phrase(id) : Promise.resolve());
    const n = ev.number;
    switch (ev.type) {
    case 'cache-miss': {
        s.activate(ui.panels[caller]);
        const flag = ui.panels[caller].querySelector('[data-cacheflag]');
        flag.className = 'th-flag bad'; flag.textContent = 'no entry';
        trace(ui, 'circle-x', 'red', 'Cache: <b>no entry</b>');
        await Promise.all([say('cache-miss'), s.wait(700 * pace)]);
        break;
    }
    case 'cache-hit': {
        s.activate(ui.panels[caller]);
        hlRow(ui, ui.cacheBody[caller], n, 'green');
        trace(ui, 'circle-check', 'green', `Cache: <b>${NAME[ev.entry.holder.cpId]}</b> · go direct`);
        await Promise.all([say('cache-hit'), s.wait(700 * pace)]);
        break;
    }
    case 'list-lookup': {
        s.activate(ui.ofcom);
        ui.ofcom.querySelectorAll('tr').forEach((tr) => tr.classList.remove('hl'));
        if (ev.block) {
            const tr = ui.ofcom.querySelector(`tr[data-prefix="${ev.block.prefix}"]`);
            tr.classList.add('hl'); tr.style.setProperty('--hl', s.colour('gold'));
            trace(ui, 'file-text', 'gold', ev.block.rangeHolderUrl ? `List: Range Holder <b>${short(ev.block.cpId)}</b>` : `List: <b>${ev.block.cpName}</b> · no PSTN2 URL`);
        } else trace(ui, 'file-x', 'red', 'List: <b>not allocated</b>');
        const pc = s.anchor(ui.panels[caller], 't');
        const ob = s.anchor(ui.ofcom, 'b');
        const conn = s.connect({ x: pc.x - 150, y: pc.y }, { x: Math.min(Math.max(pc.x - 150, L.ofcom.x + 40), L.ofcom.x + L.ofcom.w - 40), y: ob.y }, { colour: 'gold', dashed: true, width: 3 });
        ui.conns.push(conn);
        await Promise.all([say('list'), s.wait(900 * pace)]);
        break;
    }
    case 'query': {
        const to = ev.to.cpId;
        s.activate(ui.panels[to]);
        inspect(ui, { req: `GET ${ev.url.replace('https://', '')}`, status: `${short(caller)} → ${short(to)}`, statusKind: '', body: undefined });
        trace(ui, 'send', 'blue', `Ask <b>${short(to)}</b>: who has ${displayNumber(n)}?`);
        if (to !== caller) {
            ui.last = connectCps(ui, caller, to, 'blue');
            await ui.last.done;
            await s.packet(ui.last, { colour: 'blue', label: 'GET', duration: 1000 * pace });
        } else { ui.last = null; await s.wait(500 * pace); }
        break;
    }
    case 'response': {
        const from = ev.from.cpId;
        const r = ev.status === 404 ? 'unknown' : ev.body?.result;
        const look = { held: ['green', 'held', 'ok'], redirect: ['amber', 'redirect', 'warn'], not_held: ['red', 'not held', 'bad'], unknown: ['slate', '404', ''] }[r] || ['red', 'error', 'bad'];
        hlRow(ui, ui.dbBody[from], n, look[0]);
        inspect(ui, { status: `${short(from)} → ${short(caller)} · ${ev.status} ${look[1]}`, statusKind: look[2], body: ev.status === 404 ? null : { ...ev.body, issued: ISSUED } });
        const phrase = { held: null, redirect: 'redirect', not_held: 'not-held', unknown: 'unknown' }[r];
        const p = ui.last ? s.packet(ui.last, { colour: look[0], label: look[1], duration: 1000 * pace, reverse: true }) : Promise.resolve();
        if (r === 'redirect') trace(ui, 'forward', 'amber', `${short(from)}: <b>redirect → ${short(ev.body.portedTo.cpId)}</b>`);
        else if (r === 'held') trace(ui, 'circle-check', 'green', `${short(from)}: <b>held</b>${ev.body.ported ? ' (ported in)' : ''}`);
        else if (r === 'not_held') trace(ui, 'refresh-cw', 'red', `${short(from)}: <b>not held · invalidate</b>`);
        else trace(ui, 'circle-x', 'slate', `${short(from)}: <b>404 not in service</b>`);
        await Promise.all([p, phrase ? say(phrase) : null]);
        break;
    }
    case 'redirect':
        break;
    case 'cache-purge': {
        const tr = ui.cacheBody[caller].querySelector(`tr[data-n="${CSS.escape(n)}"]`);
        if (tr) tr.classList.add('strike');
        await s.wait(800 * pace);
        const snap = ui.snap;
        snap.caches[caller] = (snap.caches[caller] || []).filter((e) => e.number !== n);
        renderCaches(ui, snap);
        trace(ui, 'trash-2', 'red', 'Cache entry <b>deleted</b>');
        break;
    }
    case 'cache-store': {
        const snap = ui.snap;
        const list = (snap.caches[caller] || []).filter((e) => e.number !== n);
        list.push({ number: n, holder: ev.entry.holder.cpId });
        snap.caches[caller] = list;
        renderCaches(ui, snap, { flash: `${caller}|${n}` });
        hlRow(ui, ui.cacheBody[caller], n, 'green');
        await Promise.all([say('held'), s.wait(500 * pace)]);
        break;
    }
    case 'result': {
        const r = ev.result;
        const q = r.hops.length;
        const qs = `${q} ${q === 1 ? 'query' : 'queries'}`;
        if (r.result === 'held') result(ui, 'ok', `Held by ${r.holder.cpName}${r.ported ? ' (ported)' : ''} · ${qs}`);
        else if (r.result === 'unknown') result(ui, 'bad', `Not in service · ${qs}`);
        else if (r.result === 'not_participating') { result(ui, 'warn', `${r.rangeHolder.cpName.split(' ')[0]}: not in PSTN2 → today’s network`); await say('not-participating'); }
        else if (r.result === 'unallocated') { result(ui, 'bad', 'Not allocated by Ofcom'); await say('unallocated'); }
        else { result(ui, 'bad', `Failed (${r.error}) · today’s network`); await say('error'); }
        break;
    }
    default:
        break;
    }
}

/** Queue playback of recorded events so cues never overlap. */
function player(ui, events) {
    let i = 0;
    let chain = Promise.resolve();
    return {
        take(nOrType) {
            chain = chain.then(async () => {
                if (typeof nOrType === 'number') {
                    for (let k = 0; k < nOrType && i < events.length; k += 1) await play(ui, events[i++]);
                } else {
                    // play up to and including the next event of this type
                    while (i < events.length) { const ev = events[i++]; await play(ui, ev); if (ev.type === nOrType) break; }
                }
            });
            return chain;
        },
        rest() { chain = chain.then(async () => { while (i < events.length) await play(ui, events[i++]); }); return chain; },
    };
}

function tourScene(id, cues, { snapKey = 'before' } = {}) {
    return {
        build(s) {
            const rec = TOUR[id];
            s.ui = world(s, rec[snapKey]);
            s.p = player(s.ui, rec.events);
            s.rec = rec;
        },
        cues,
    };
}
const sc = (id) => scenarios.find((x) => x.id === id);

// ---------------------------------------------------------------------------
// Interactive form (final scene)
// ---------------------------------------------------------------------------
const QUICK = ['+441614960123', '+441134960456', '+442079460321', '+442079460100', '+441614960999', '+441174960555', '+441154960555'];
const EXAMPLE_NOTE = {
    '+441614960123': 'Bravo, unported', '+441134960456': 'ported to Bravo', '+442079460321': 'ported to Charlie',
    '+442079460100': 'Alpha, unported', '+441614960999': 'not in service', '+441174960555': 'not participating', '+441154960555': 'not allocated',
};
function normalise(input) {
    const t = String(input).replace(/[^\d+]/g, '');
    if (t.startsWith('+')) return t;
    if (t.startsWith('00')) return '+' + t.slice(2);
    if (t.startsWith('0')) return '+44' + t.slice(1);
    if (t.startsWith('44')) return '+' + t;
    return '+' + t;
}
function buildForm(s, ui) {
    const seg = (name) => `<div class="th-seg" data-interactive data-group="${name}">${CPS.map((c, i) => `<button type="button" data-cp="${c.cpId}" style="--c:var(--${COLOUR[c.cpId]})" class="${i === 0 ? 'on' : ''}">${short(c.cpId)}</button>`).join('')}</div>`;
    const examples = QUICK.map((n) => `<option value="${n}">${displayNumber(n)} · ${EXAMPLE_NOTE[n]}</option>`).join('');
    return s.el(`<div class="th-head"><div class="p2-chip" style="--c:var(--blue)">${s.icon('phone-outgoing', { size: 26 })}</div><div><div class="th-name">Try it · live engine</div></div></div>
        <div class="th-form" data-interactive>
          <div class="row"><span class="lbl">Caller</span>${seg('caller')}</div>
          <div class="row"><input class="th-input" data-number value="0113 496 0456" aria-label="Number to discover" spellcheck="false"><button class="th-btn" data-go type="button">Discover</button></div>
          <div class="row"><select class="th-select wide" data-quick aria-label="Example numbers"><option value="">Example numbers…</option>${examples}</select></div>
          <div class="row"><span class="lbl">Port</span><select class="th-select wide2" data-pnum aria-label="Number to port"></select></div>
          <div class="row"><span class="lbl sm">to</span>${seg('portto')}<button class="th-btn ghost" data-port type="button">Port</button><button class="th-btn ghost icon" data-reset type="button" title="Reset the network" aria-label="Reset the network">${s.icon('rotate-ccw', { size: 18 })}</button></div>
        </div>`, { ...L.call, cls: 'th-panel th-call', colour: 'blue', hidden: false, style: 'height:300px;' });
}

function interactive(s) {
    let { net, clients } = makeNetwork();
    const ui = world(s, snapshot(net, clients), { interactive: true });
    const f = ui.form;
    const pick = (group) => f.querySelector(`[data-group="${group}"] .on`)?.dataset.cp;
    f.querySelectorAll('.th-seg').forEach((g) => g.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    const portable = () => {
        const nums = new Set();
        for (const cp of net.cps.values()) { cp.inService.forEach((n) => nums.add(n)); cp.portedIn.forEach((p) => nums.add(p.number)); }
        const sel = f.querySelector('[data-pnum]');
        const cur = sel.value;
        sel.innerHTML = [...nums].sort().map((n) => `<option value="${n}">${displayNumber(n)} · now with ${short(net.currentHolder(n).cpId)}</option>`).join('');
        if (cur && nums.has(cur)) sel.value = cur; else sel.value = '+441134960456';
    };
    portable();
    let busy = false;
    const setBusy = (b) => { busy = b; f.querySelectorAll('button').forEach((x) => { if (x.dataset.go !== undefined || x.dataset.port !== undefined || x.dataset.reset !== undefined) x.disabled = b; }); };
    const go = async () => {
        if (busy) return;
        const number = normalise(f.querySelector('[data-number]').value);
        if (!/^\+[1-9]\d{6,14}$/.test(number)) { s.setCaption('Enter a UK number such as 0161 496 0123.'); return; }
        const callerId = pick('caller');
        setBusy(true);
        s.player.pause();
        await startCall(ui, callerId, number);
        s.setCaption(`${NAME[callerId]} asks: who has ${displayNumber(number)}?`);
        try {
            await clients.get(callerId).discover(number, { onEvent: (ev) => play(ui, ev, { voice: true }) });
        } finally {
            ui.snap = snapshot(net, clients);
            renderCaches(ui, ui.snap);
            setBusy(false);
        }
    };
    f.querySelector('[data-go]').addEventListener('click', go);
    f.querySelector('[data-number]').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    f.querySelector('[data-quick]').addEventListener('change', (e) => { if (!e.target.value) return; f.querySelector('[data-number]').value = displayNumber(e.target.value); e.target.value = ''; go(); });
    f.querySelector('[data-port]').addEventListener('click', async () => {
        if (busy) return;
        const number = f.querySelector('[data-pnum]').value;
        const to = pick('portto');
        const from = net.currentHolder(number)?.cpId;
        if (!from || from === to) { s.setCaption(`${displayNumber(number)} is already with ${NAME[to]}.`); return; }
        net.port(number, from, to);
        const snap = snapshot(net, clients);
        renderDb(ui, snap, { flash: [`${from}|${number}`, `${to}|${number}`, ...[...net.cps.keys()].map((id) => `${id}|${number}`)] });
        hlRow(ui, ui.dbBody[to], number, 'green');
        ui.snap = snap;
        portable();
        await s.phrase('ported', { text: `${displayNumber(number)} ported from ${NAME[from]} to ${NAME[to]}. Caches elsewhere are now stale — try calling it.` });
    });
    f.querySelector('[data-reset]').addEventListener('click', async () => {
        if (busy) return;
        ({ net, clients } = makeNetwork());
        ui.snap = snapshot(net, clients);
        clearHl(ui);
        ui.conns.forEach((c) => c.fade(200)); ui.conns = [];
        renderDb(ui, ui.snap); renderCaches(ui, ui.snap); portable();
        inspect(ui, { req: 'Waiting for a call…', status: '—', body: undefined });
        await s.phrase('reset');
    });
    return ui;
}

// ---------------------------------------------------------------------------
createDeck({
    scenes: {
        intro: {
            build(s) {
                s.ui = world(s, TOUR.initial, { hidden: true });
                s.ui.call.querySelector('[data-who]').textContent = 'Waiting for the first call';
            },
            cues: {
                a: (s) => s.reveal([s.ui.ofcom, ...Object.values(s.ui.panels), s.ui.call, s.ui.insp]),
                b: (s) => { s.activate(s.ui.ofcom); s.ui.ofcom.querySelectorAll('td.url').forEach((td) => td.closest('tr').classList.add('flash')); },
                c: async (s) => { s.activate(s.ui.ofcom, false); for (const cp of CPS) { s.activate(s.ui.panels[cp.cpId]); await s.wait(700); s.activate(s.ui.panels[cp.cpId], false); } },
                d: (s) => { CPS.forEach((cp) => hlRow(s.ui, s.ui.dbBody[cp.cpId], 'range', 'gold')); },
                e: async (s) => {
                    clearHl(s.ui);
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0103'], '+441134960456', 'amber');
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0102'], '+441134960456', 'green');
                    await s.wait(3600);
                    clearHl(s.ui);
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0101'], '+442079460321', 'amber');
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0103'], '+442079460321', 'green');
                },
                f: (s) => { clearHl(s.ui); s.ring(s.ui.ofcom, { colour: 'green', size: 220 }); },
            },
        },
        download: {
            build(s) { s.ui = world(s, TOUR.initial); s.ui.call.querySelector('[data-who]').textContent = 'Waiting for the first call'; },
            cues: {
                a: async (s) => {
                    s.activate(s.ui.ofcom);
                    for (const cp of CPS) {
                        const c = s.connect(s.ui.ofcom, s.ui.panels[cp.cpId], { from: 'b', to: 't', colour: 'gold', dashed: true, width: 3, fromOpts: { dx: (CPS.indexOf(cp) - 1) * 260 } });
                        s.wait(400).then(() => s.packet(c, { colour: 'gold', label: 'daily download', duration: 1400 }));
                        await s.wait(500);
                    }
                },
                b: (s) => { s.activate(s.ui.ofcom, false); CPS.forEach((cp) => { const f = s.ui.panels[cp.cpId].querySelector('[data-cacheflag]'); f.className = 'th-flag warn'; }); },
            },
        },
        unported: tourScene('A', {
            a: (s) => startCall(s.ui, sc('A').callerCp, sc('A').number),
            b: (s) => s.p.take('cache-miss'),
            c: (s) => s.p.take('list-lookup'),
            d: (s) => s.p.take('query').then(() => hlRow(s.ui, s.ui.dbBody['CP1-UK-0102'], sc('A').number, 'green')),
            e: (s) => s.p.rest(),
        }),
        ported: tourScene('B', {
            a: (s) => startCall(s.ui, sc('B').callerCp, sc('B').number),
            b: (s) => { s.p.take('cache-miss'); s.p.take('list-lookup'); return s.p.take('query'); },
            c: (s) => s.p.take('response'),
            d: (s) => { s.p.take('redirect'); s.p.take('query'); return s.p.take('response'); },
            e: (s) => s.p.rest(),
        }),
        cached: tourScene('C', {
            a: (s) => startCall(s.ui, sc('C').callerCp, sc('C').number),
            b: (s) => { s.p.take('cache-hit'); return s.p.take('query'); },
            c: (s) => s.p.rest(),
        }),
        invalidate: {
            build(s) {
                s.rec = TOUR.D;
                s.ui = world(s, s.rec.before);
                s.p = player(s.ui, s.rec.events);
            },
            cues: {
                a: (s) => {
                    s.ui.call.querySelector('[data-who]').textContent = 'Number porting: Bravo → Charlie';
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0102'], '+441134960456', 'green');
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0103'], '+441134960456', 'amber');
                    s.activate(s.ui.panels['CP1-UK-0102']); s.activate(s.ui.panels['CP1-UK-0103']);
                },
                b: async (s) => {
                    s.ui.dbBody['CP1-UK-0102'].querySelector('tr[data-n="+441134960456"]')?.classList.add('strike');
                    await s.wait(1200);
                    renderDb(s.ui, s.rec.afterPort, { flash: ['CP1-UK-0103|+441134960456'] });
                    s.ui.snap = clone(s.rec.afterPort);
                    hlRow(s.ui, s.ui.dbBody['CP1-UK-0103'], '+441134960456', 'green');
                    s.activate(s.ui.panels['CP1-UK-0102'], false);
                },
                c: async (s) => {
                    await startCall(s.ui, sc('D').callerCp, sc('D').number);
                    s.p.take('cache-hit'); s.p.take('query'); s.p.take('response'); return s.p.take('cache-purge');
                },
                d: (s) => { s.p.take('list-lookup'); s.p.take('query'); s.p.take('response'); return s.p.take('cache-store'); },
                e: (s) => s.p.rest(),
            },
        },
        edges: {
            build(s) {
                s.ui = world(s, TOUR.E.before);
                s.pE = player(s.ui, TOUR.E.events);
                s.pF = player(s.ui, TOUR.F.events);
            },
            cues: {
                b: async (s) => { await startCall(s.ui, sc('E').callerCp, sc('E').number); return s.pE.rest(); },
                c: async (s) => { await startCall(s.ui, sc('F').callerCp, sc('F').number); return s.pF.rest(); },
            },
        },
        try: {
            interactive: true,
            build(s) { s.ui = interactive(s); },
            cues: {
                a: (s) => s.activate(s.ui.form),
                b: (s) => { s.activate(s.ui.form, false); },
            },
        },
    },
});
