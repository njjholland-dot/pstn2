// Emergency Services — real-time caller location (PSTN2 v1.1, SPECIFICATION.md §8, §9)
// Providers are fictional and numbers come from Ofcom's reserved TV/drama ranges.
import { createDeck } from '../../shared/pstn2-player.js';

const CALLER = '07700 900321';
const DISCOVERY = ['Check the cache', 'Ofcom S1–S9 list', 'Ask the Range Holder', 'Follow the redirect', 'Cache the answer'];
const SIG = 'q3Xc9LmZ0pTf7vKa…';

/** Message bubble whose header shows an HTTP path in its real case. */
function endpointMsg(s, opts) {
    const m = s.msg(opts);
    const h = m.querySelector('.p2-msg-h');
    if (h) h.classList.add('es-path');
    return m;
}

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        seconds: {
            build(s) {
                s.clock = s.stat({ x: 564, y: 0, w: 600, value: '0:00', label: 'since the emergency call connected', colour: 'amber' });
                s.clock.classList.add('es-center');
                s.caller = s.card({ x: 0, y: 190, w: 470, title: 'Emergency call', sub: '999 · 112', iconName: 'phone-call', colour: 'red',
                    body: `<div class="es-loc">${s.icon('map-pin', { size: 28 })}<span>Caller’s location:</span><b class="es-q">?</b></div>` });
                s.resp = s.card({ x: 1258, y: 190, w: 470, title: 'Responders', sub: 'Ambulance · police · fire', iconName: 'ambulance', colour: 'blue',
                    body: `<div class="es-loc">${s.icon('navigation', { size: 28 })}<span>Heading to:</span><b class="es-q">?</b></div>` });
                s.stale = s.pill({ x: 560, y: 336, text: 'Out of date', iconName: 'history', colour: 'red' });
                s.vague = s.pill({ x: 834, y: 336, text: 'Too vague to act on', iconName: 'circle-help', colour: 'red' });
                s.lives = s.statement({ x: 0, y: 480, w: 1728, size: 60, cls: 'es-center', html: 'Lives depend on <em>finding people fast.</em>' });
            },
            cues: {
                a: (s) => {
                    s.reveal([s.caller, s.clock]);
                    s.ring(s.caller, { colour: 'red', size: 220 });
                    s.countUp(s.clock, 47, { duration: 16000, format: (v) => `0:${String(Math.floor(v)).padStart(2, '0')}` });
                },
                b: async (s) => {
                    await s.reveal(s.resp);
                    s.link = s.connect(s.caller, s.resp, { from: 'r', to: 'l', colour: 'slate', dashed: true, width: 4 });
                },
                c: (s) => s.reveal(s.lives),
                d: (s) => {
                    s.reveal([s.stale, s.vague]);
                    if (s.link) s.link.fade();
                    s.connect(s.caller, s.resp, { from: 'r', to: 'l', colour: 'red', dashed: true, width: 4 });
                    s.activate(s.resp);
                },
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        batch: {
            build(s) {
                s.cp = s.card({ x: 0, y: 60, w: 500, title: 'Provider', sub: 'Customer location records', iconName: 'database', colour: 'blue' });
                s.ess = s.card({ x: 1228, y: 60, w: 500, title: 'Emergency services', sub: 'Location database', iconName: 'siren', colour: 'red' });
                s.file = s.pill({ x: 636, y: 0, text: 'Batch file · once every 24 hours', iconName: 'file-text', colour: 'amber' });
                s.age = s.stat({ x: 564, y: 190, w: 600, value: '0 h', label: 'how old the data can be', colour: 'amber' });
                s.age.classList.add('es-center');
                s.rec = s.card({ x: 314, y: 420, w: 1100, compact: true, title: 'One customer’s record', sub: 'What the emergency services receive', iconName: 'file-x', colour: 'red', body: ' ' });
                s.recT = s.table(s.rec, { columns: [{ key: 'f', label: 'Field' }, { key: 'b', label: 'Yesterday’s batch file' }, { key: 'n', label: 'The truth today' }], colour: 'red' });
                s.recT.add({ f: 'Address', b: 'Previous home', n: 'Moved house this morning' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.cp, s.ess]);
                    s.c = s.connect(s.cp, s.ess, { from: 'r', to: 'l', colour: 'amber', dashed: true, width: 4 });
                },
                b: async (s) => {
                    s.reveal(s.file);
                    await s.wait(400);
                    if (s.c) await s.packet(s.c, { colour: 'amber', label: 'daily batch', duration: 2600 });
                },
                c: (s) => { s.reveal(s.age); s.countUp(s.age, 24, { duration: 1800, format: (v) => `${Math.round(v)} h` }); },
                d: (s) => { s.reveal(s.rec); s.recT.highlight(0, 'red'); s.activate(s.ess); },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        precision: {
            build(s) {
                s.area = s.el(`<div class="es-area-label">${s.tag('Postcode area · several km²', 'amber')}</div>`, { x: 0, y: 0, w: 1100, h: 640, cls: 'es-area', hidden: true, from: 'fade' });
                s.blds = [];
                for (let r = 0; r < 3; r += 1) {
                    for (let c = 0; c < 8; c += 1) {
                        s.blds.push(s.el(s.icon(r === 1 && c % 3 === 0 ? 'building-2' : 'building', { size: 44 }), { x: 60 + c * 126, y: 92 + r * 140, w: 96, h: 96, cls: 'es-bld', hidden: true, from: 'scale' }));
                    }
                }
                s.target = s.blds[13];
                s.pin = s.el(`${s.icon('map-pin', { size: 34 })}<span>The caller</span>`, { x: 690 - 40, y: 232 - 66, cls: 'es-pin', hidden: true, from: 'down' });
                s.search = s.pill({ x: 60, y: 548, text: 'Searching, building by building', iconName: 'search', colour: 'amber' });
                s.rural = s.card({ x: 1160, y: 0, w: 568, h: 640, title: 'Rural areas', sub: 'Even worse', iconName: 'house', colour: 'red',
                    body: `<div class="es-rural"><span style="left:20px;top:10px">${s.icon('house', { size: 40 })}</span><span style="left:330px;top:70px">${s.icon('house', { size: 40 })}</span><span style="left:120px;top:200px">${s.icon('house', { size: 40 })}</span><em class="es-km" style="left:150px;top:44px">km</em><em class="es-km" style="left:250px;top:170px">km</em></div><div class="es-rural-copy">One postcode can stretch across farms, lanes and fields, with kilometres between homes.</div>` });
            },
            cues: {
                a: (s) => s.reveal(s.area),
                b: async (s) => {
                    for (let i = 0; i < s.blds.length; i += 1) { s.reveal(s.blds[i]); await s.wait(70); }
                },
                c: async (s) => {
                    s.reveal(s.search);
                    for (const i of [0, 1, 2, 8, 9, 10]) { s.blds[i].classList.add('es-checked'); await s.wait(260); }
                    s.target.classList.add('es-found');
                    s.reveal(s.pin);
                },
                d: (s) => s.reveal(s.rural),
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        realtime: {
            build(s) {
                s.ecc = s.card({ x: 0, y: 70, w: 500, h: 210, title: 'Emergency call centre', sub: 'Receives the 999 call', iconName: 'headphones', colour: 'red',
                    body: `<div class="es-num">${CALLER}</div><div class="es-small">Caller ID</div>` });
                s.cp = s.card({ x: 1228, y: 70, w: 500, h: 210, title: 'Bravo Networks', sub: 'The caller’s provider', iconName: 'building-2', colour: 'green',
                    body: `<div class="es-live">${s.icon('activity', { size: 28 })}<span>Live device location</span></div><div class="es-small">Known now, not yesterday</div>` });
                s.no = s.pill({ x: 653, y: 0, text: 'No batch file: ask in real time', iconName: 'zap', colour: 'amber' });
                s.ans = s.msg({ x: 540, y: 250, w: 648, expand: true, title: 'Answer · Bravo → call centre', colour: 'green', iconName: 'map-pin',
                    json: { location: { latitude: 53.8012, longitude: -1.548, accuracy: 15, source: 'gps' }, timestamp: '2026-10-06T09:41:07.050Z' } });
                s.fix = s.el(`<div class="es-fix-ring"></div><div class="es-fix-pin">${s.icon('map-pin', { size: 46 })}</div><div class="es-fix-label">GPS fix · ±15 m</div>`, { x: 1228, y: 320, w: 500, h: 220, cls: 'es-fix', hidden: true, from: 'scale' });
                s.sum = s.statement({ x: 0, y: 584, w: 1728, size: 50, cls: 'es-center', html: 'Current data, <em>in milliseconds.</em>' });
            },
            cues: {
                a: (s) => { s.reveal([s.ecc, s.cp]); s.wait(300).then(() => s.reveal(s.no)); },
                b: async (s) => {
                    s.activate(s.ecc);
                    s.c = s.connect(s.ecc, s.cp, { from: 'r', to: 'l', colour: 'blue', width: 4 });
                    await s.c.done;
                    await s.packet(s.c, { colour: 'blue', label: 'Where is this device?', duration: 1600 });
                    s.activate(s.ecc, false); s.activate(s.cp);
                },
                c: async (s) => {
                    if (s.c) await s.packet(s.c, { colour: 'green', label: 'location', duration: 1400, reverse: true });
                    s.reveal(s.ans);
                    await s.wait(500);
                    s.reveal(s.fix);
                },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        query: {
            build(s) {
                s.st = s.steps({ x: 0, y: 0, w: 1728, items: DISCOVERY });
                s.ecc = s.card({ x: 0, y: 120, w: 470, h: 470, title: '999 call centre', sub: 'PSAP', iconName: 'headphones', colour: 'red',
                    body: `<div class="es-dialled"><span>Dialled</span><b>999</b></div><div class="es-small">Caller ID</div><div class="es-num">${CALLER}</div><div class="es-reg">${s.tag('Registered PSAP', 'red')} ${s.tag('TLS client certificate', 'red')}</div>` });
                s.reg = s.ecc.querySelector('.es-reg');
                s.charlie = s.card({ x: 1258, y: 120, w: 470, compact: true, title: 'Charlie Comms', sub: 'Range Holder · 07700 900xxx', iconName: 'building-2', colour: 'amber' });
                s.bravo = s.card({ x: 1258, y: 400, w: 470, compact: true, title: 'Bravo Networks', sub: `Holds ${CALLER} · ported in`, iconName: 'building-2', colour: 'green' });
                s.list = s.pill({ x: 545, y: 230, text: 'Ofcom list → Range Holder: Charlie', iconName: 'file-text', colour: 'gold' });
                s.cached = s.pill({ x: 545, y: 520, text: `Cached · ${CALLER} → Bravo`, iconName: 'database-zap', colour: 'blue' });
                s.req = endpointMsg(s, { x: 530, y: 196, w: 680, title: 'POST /pstn2/v1/emergency/location', colour: 'red', iconName: 'send',
                    json: { requestingPSAP: 'UK-999-NORTH-01', callerID: '+447700900321', callReference: 'f47ac10b-58cc-…', signature: SIG } });
                s.res = s.msg({ x: 530, y: 120, w: 680, expand: true, title: 'Answer · Bravo → call centre', colour: 'green', iconName: 'map-pin',
                    json: { location: { latitude: 53.8012, longitude: -1.548, accuracy: 15, source: 'gps' }, timestamp: '2026-10-06T09:41:07.050Z' } });
            },
            cues: {
                a: (s) => { s.reveal([s.st.el, s.ecc]); s.wait(400).then(() => s.ring(s.ecc, { colour: 'red', size: 240 })); },
                b: async (s) => {
                    s.st.set(0);
                    await s.wait(1300);
                    s.st.set(1); s.reveal(s.list);
                    await s.wait(1800);
                    s.st.set(2); s.reveal(s.charlie); s.activate(s.charlie);
                    s.c1 = s.connect({ x: 470, y: s.anchor(s.charlie, 'l').y }, s.charlie, { from: 'r', to: 'l', colour: 'blue' });
                    await s.c1.done;
                    s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1200 });
                },
                c: async (s) => {
                    s.st.set(3);
                    s.hide(s.list);
                    if (s.c1) await s.packet(s.c1, { colour: 'amber', label: 'redirect', duration: 1200, reverse: true });
                    s.activate(s.charlie, false); s.dim(s.charlie);
                    s.reveal(s.bravo); s.activate(s.bravo);
                    s.c2 = s.connect({ x: 470, y: s.anchor(s.bravo, 'l').y }, s.bravo, { from: 'r', to: 'l', colour: 'blue' });
                    await s.c2.done;
                    await s.packet(s.c2, { colour: 'blue', label: 'GET', duration: 1100 });
                    await s.packet(s.c2, { colour: 'green', label: 'held', duration: 1100, reverse: true });
                    s.st.set(4);
                    s.reveal(s.cached);
                },
                d: async (s) => {
                    s.st.done();
                    if (s.c1) s.c1.fade();
                    s.reg.classList.add('es-on');
                    s.reveal(s.req);
                    if (s.c2) await s.packet(s.c2, { colour: 'red', label: 'location?', duration: 1300 });
                },
                e: async (s) => {
                    s.bravo.querySelector('.p2-card-sub').textContent = 'Checks its live records';
                    if (s.c2) await s.packet(s.c2, { colour: 'green', label: 'location', duration: 1100, reverse: true });
                    s.hide(s.req);
                    s.reveal(s.res);
                },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        mobile: {
            build(s) {
                const src = (y, iconName, title, sub, colour) => s.card({ x: 0, y, w: 520, compact: true, title, sub, iconName, colour });
                s.gps = src(30, 'satellite', 'GPS satellites', 'Typically ±5–15 m', 'blue');
                s.wifi = src(260, 'wifi', 'Wi-Fi access points', 'About ±20–50 m', 'violet');
                s.cell = src(490, 'radio-tower', 'Serving cell', '±100 m to 1 km', 'amber');
                s.phone = s.el(`<div>${s.icon('smartphone', { size: 64 })}<div>Caller’s phone</div></div>`, { x: 724, y: 200, w: 230, h: 230, cls: 'es-node', colour: 'blue', hidden: true, from: 'scale' });
                s.cp = s.card({ x: 1228, y: 120, w: 500, title: 'Bravo Networks', sub: 'Gathers every source', iconName: 'building-2', colour: 'green', body: ' ' });
                s.cpT = s.table(s.cp, { columns: [{ key: 's', label: 'Source' }, { key: 'a', label: 'Accuracy' }], colour: 'green' });
                [['GPS', '±5–15 m'], ['Wi-Fi', '±20–50 m'], ['Cell', '±100 m–1 km']].forEach(([a, b]) => s.cpT.add({ s: a, a: b }));
                s.best = s.pill({ x: 1228, y: 490, text: 'Best fix · sent in real time', iconName: 'locate-fixed', colour: 'green' });
                s.notBatch = s.pill({ x: 1228, y: 576, text: 'Not yesterday’s batch file', iconName: 'ban', colour: 'red' });
            },
            cues: {
                a: (s) => { s.reveal(s.phone); s.ring(s.phone, { colour: 'blue', size: 260 }); },
                b: async (s) => { await s.reveal(s.gps); s.l1 = s.connect(s.gps, s.phone, { from: 'r', to: 'l', colour: 'blue', bend: 0.12, toOpts: { dy: -60 } }); },
                c: async (s) => { await s.reveal(s.wifi); s.l2 = s.connect(s.wifi, s.phone, { from: 'r', to: 'l', colour: 'violet' }); },
                d: async (s) => { await s.reveal(s.cell); s.l3 = s.connect(s.cell, s.phone, { from: 'r', to: 'l', colour: 'amber', bend: -0.12, toOpts: { dy: 60 } }); },
                e: async (s) => {
                    await s.reveal(s.cp);
                    const c = s.connect(s.phone, s.cp, { from: 'r', to: 'l', colour: 'green', width: 4 });
                    await c.done;
                    await s.packet(c, { colour: 'green', label: 'location', duration: 1200 });
                    s.cpT.highlight(0, 'green');
                    s.reveal([s.best, s.notBatch]);
                },
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        fixed: {
            build(s) {
                s.old = s.card({ x: 0, y: 20, w: 680, h: 560, title: 'Today', sub: 'An address from an old database', iconName: 'file-x', colour: 'red',
                    body: `<div class="es-file">${s.icon('house', { size: 56 })}<div><b>Address on file</b><small>Last updated a year ago</small></div></div>
                           <div class="es-file es-stamp">${s.icon('calendar', { size: 56 })}<div><b>Static</b><small>Nobody checks it at the moment of the call</small></div></div>` });
                s.nw = s.card({ x: 1048, y: 20, w: 680, h: 560, title: 'With PSTN2', sub: 'Answered from live records', iconName: 'house', colour: 'green' });
                s.list = s.bullets({ x: 1080, y: 160, w: 620, gap: 26, items: [
                    { icon: 'badge-check', colour: 'green', text: 'Verified billing address', sub: 'Recently confirmed' },
                    { icon: 'wrench', colour: 'green', text: 'Installation records', sub: 'Where the line was actually fitted' },
                    { icon: 'user-check', colour: 'green', text: 'Customer-confirmed location', sub: 'Updated by the customer' },
                ] });
                s.now = s.pill({ x: 1080, y: 486, text: 'Up to date at the moment of the call', iconName: 'clock', colour: 'green' });
            },
            cues: {
                a: (s) => s.reveal(s.nw),
                b: (s) => { s.reveal(s.old); s.activate(s.old); },
                c: async (s) => {
                    s.activate(s.old, false); s.old.classList.add('es-faded');
                    s.connect(s.old, s.nw, { from: 'r', to: 'l', colour: 'green', label: 'Much better', labelDy: -20 });
                    s.activate(s.nw);
                    s.reveal(s.list.items[0]);
                    await s.wait(1600);
                    s.reveal(s.list.items[1]);
                },
                d: (s) => { s.reveal(s.list.items[2]); s.wait(900).then(() => s.reveal(s.now)); },
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        impact: {
            build(s) {
                const vals = [100, 90, 80, 70, 60, 50, 40];
                const bars = vals.map((v, i) => `<div class="es-bar" style="--h:${v}%"><b>${v}%</b><i></i><span>${i} min</span></div>`).join('');
                s.chart = s.el(`<div class="es-chart-h">Chance of survival in cardiac arrest, by minutes of delay</div><div class="es-bars">${bars}</div><div class="es-chart-note">${s.tag('Illustrative · about 10% lower per minute', 'slate')}</div>`,
                    { x: 0, y: 0, w: 980, h: 640, cls: 'es-chart', hidden: true, from: 'fade' });
                s.mins = s.stat({ x: 1080, y: 10, w: 648, value: 'Minutes', label: 'cut from response times by real-time location', colour: 'green' });
                s.pct = s.stat({ x: 1080, y: 250, w: 648, value: '~10%', label: 'lower chance of survival for every minute of delay', colour: 'red' });
                s.sum = s.statement({ x: 1080, y: 500, w: 648, size: 52, html: 'Faster location.<br><em>More lives saved.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.mins),
                b: async (s) => {
                    await s.reveal(s.chart);
                    const bars = [...s.chart.querySelectorAll('.es-bar')];
                    for (const b of bars) { b.classList.add('es-on'); await s.wait(260); }
                    s.reveal(s.pct);
                },
                c: (s) => {
                    [...s.chart.querySelectorAll('.es-bar')].slice(0, 2).forEach((b) => b.classList.add('es-good'));
                    s.reveal(s.sum);
                },
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        regulation: {
            build(s) {
                s.head = s.statement({ x: 0, y: 0, w: 1728, size: 50, cls: 'es-center', html: 'Regulators expect <em>accurate, real-time location.</em>' });
                const reg = (x, iconName, title, sub, colour, lines) => s.card({ x, y: 110, w: 540, h: 262, title, sub, iconName, colour,
                    body: lines.map((l) => `<div class="es-req">${s.icon('check', { size: 24 })}<span>${l}</span></div>`).join('') });
                s.regs = [
                    reg(0, 'car', 'eCall', 'European Union', 'blue', ['Automatic call after a crash', 'Vehicle location sent with it']),
                    reg(594, 'map-pin', 'Enhanced 911', 'United States', 'green', ['Wireless location accuracy', 'Indoor positioning']),
                    reg(1188, 'smartphone', 'Advanced Mobile Location', 'United Kingdom', 'amber', ['Handset location with 999 calls', 'GPS and Wi-Fi from the phone']),
                ];
                s.band = s.card({ x: 214, y: 500, w: 1300, title: 'PSTN2 goes further', sub: 'Real-time location from every participating provider, for every call', iconName: 'radio-tower', colour: 'green' });
            },
            cues: {
                a: (s) => s.reveal(s.head),
                b: (s) => s.reveal(s.regs),
                c: async (s) => {
                    await s.reveal(s.band);
                    s.activate(s.band);
                    s.regs.forEach((r, i) => s.connect(r, s.band, { from: 'b', to: 't', colour: 'green', width: 3, toOpts: { dx: (i - 1) * 420 } }));
                },
            },
        },
    },
});
