// Authentication: Token Pool — PSTN2 v1.1 (SPECIFICATION.md §5.2)
// Alpha Telecom (originating) creates a token; Bravo Networks (receiving) checks it.
// The token ID travels in the SIP INVITE (X-PSTN2-Token). Numbers are from Ofcom's
// reserved TV/drama ranges; providers are fictional.
import { createDeck } from '../../shared/pstn2-player.js';

const TOKEN = 'TK-7fQm2Rx9LpA4wZ3k';
const SIG = 'kV6QbUqP3vD0aXk2…';

function node(s, { x, y, iconName, name, colour, big = false }) {
    return s.el(`<div>${s.icon(iconName, { size: big ? 54 : 40 })}<div>${name}</div></div>`, { x, y, cls: `tp-node ${big ? 'tp-big' : ''}`, colour, hidden: true, from: 'scale' });
}
const cap = (s, x, y, w, html) => s.el(html, { x, y, w, cls: 'tp-cap', hidden: true, from: 'fade' });
const col = (s, x, y, w, h, iconName, title, colour) =>
    s.el(`<h3>${s.icon(iconName, { size: 38 })}${title}</h3>`, { x, y, w, h, cls: 'p2-col tp-col', colour, hidden: true });
const big = (el, px = 24) => { el.style.fontSize = `${px}px`; return el; };

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        alternative: {
            build(s) {
                s.col1 = col(s, 0, 0, 820, 560, 'circle-help', 'Option 1 · Direct query', 'blue');
                s.a1 = node(s, { x: 110, y: 200, iconName: 'building-2', name: 'Alpha<br>Telecom', colour: 'blue' });
                s.b1 = node(s, { x: 560, y: 200, iconName: 'building-2', name: 'Bravo<br>Networks', colour: 'green' });
                s.cap1 = [cap(s, 35, 372, 300, 'Caller’s provider'), cap(s, 485, 372, 300, 'Receiving provider')];
                s.note1 = s.lead({ x: 40, y: 450, w: 740, size: 28, html: 'Bravo asks Alpha about <b style="color:#fff">every call</b>' });
                s.col2 = col(s, 908, 0, 820, 560, 'ticket', 'Option 2 · Token pool', 'violet');
                s.a2 = node(s, { x: 958, y: 200, iconName: 'building-2', name: 'Alpha<br>Telecom', colour: 'blue' });
                s.p2 = node(s, { x: 1243, y: 200, iconName: 'inbox', name: 'Token<br>pool', colour: 'violet' });
                s.b2 = node(s, { x: 1528, y: 200, iconName: 'building-2', name: 'Bravo<br>Networks', colour: 'green' });
                s.capT = cap(s, 1168, 372, 300, 'Valid for 30 seconds');
                s.note2 = s.lead({ x: 948, y: 450, w: 740, size: 28, html: 'Bravo <b style="color:#fff">checks the pool</b> instead' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.col1);
                    await s.reveal([s.a1, s.b1, ...s.cap1]);
                    const c = s.connect(s.b1, s.a1, { from: 'l', to: 'r', colour: 'blue', label: 'did you place it?' });
                    s.q1 = c;
                    await c.done;
                    s.reveal(s.note1);
                    for (let i = 0; i < 3; i += 1) { await s.packet(c, { colour: 'blue', duration: 700 }); }
                },
                b: async (s) => { if (s.q1) s.q1.g.transition().duration(s.t(600)).attr('opacity', 0.28); s.dim(s.col1); [s.a1, s.b1, s.note1, ...s.cap1].forEach((e) => s.dim(e)); await s.reveal(s.col2); },
                c: async (s) => {
                    await s.reveal([s.a2, s.p2]);
                    const c = s.connect(s.a2, s.p2, { from: 'r', to: 'l', colour: 'violet', label: 'token' });
                    await c.done;
                    await s.packet(c, { colour: 'violet', duration: 900 });
                    s.activate(s.p2); s.reveal(s.capT);
                },
                d: async (s) => {
                    await s.reveal(s.b2);
                    const c = s.connect(s.b2, s.p2, { from: 'l', to: 'r', colour: 'green', label: 'check' });
                    await c.done;
                    await s.packet(c, { colour: 'green', duration: 900 });
                    s.reveal(s.note2);
                },
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        create: {
            build(s) {
                s.alpha = s.card({ x: 0, y: 20, w: 520, h: 270, title: 'Alpha Telecom', sub: 'Originating provider', iconName: 'building-2', colour: 'blue',
                    body: '<div class="tp-label">Customer calls</div><div class="tp-num">0161 496 0123</div><div class="tp-label" style="margin-top:12px">From</div><div class="tp-num" style="font-size:28px;color:var(--ink-2)">020 7946 0100</div>' });
                s.token = s.el(`<div class="tp-token">${s.icon('ticket', { size: 44 })}<div><div class="tp-id" style="font-size:24px;white-space:nowrap">${TOKEN}</div><small>Unique, random token ID</small></div><div class="tp-timer"><b>30 s</b><span>valid for</span></div></div>`, { x: 0, y: 340, w: 520, hidden: true, from: 'scale' });
                s.req = s.msg({ x: 580, y: 20, w: 580, title: 'POST /pstn2/v1/auth/tokens', colour: 'blue', iconName: 'send',
                    json: { originatingCP: 'CP1-UK-0101', callerID: '+442079460100', calledID: '+441614960123', callReference: '7c9e6679-7425-…', ttl: 30, signature: SIG } });
                s.pool = s.card({ x: 1228, y: 20, w: 500, title: 'Token pool', sub: 'Short-lived tokens', iconName: 'inbox', colour: 'violet', compact: true, body: ' ' });
                s.pT = s.table(s.pool, { columns: [{ key: 't', label: 'Token', num: true }, { key: 'e', label: 'Expires' }], colour: 'violet' });
                s.pT.add({ t: 'TK-Qa81vN0cTe…', e: 'in 12 s' });
                s.pT.add({ t: 'TK-m3ZtW7yHbs…', e: 'in 27 s' });
                s.invite = s.msg({ x: 580, y: 380, w: 580, title: 'SIP INVITE · Alpha → Bravo', colour: 'green', iconName: 'phone-forwarded',
                    text: `INVITE sip:+441614960123@bravo.example\nFrom: <sip:+442079460100@alpha.example>\nX-PSTN2-Token: ${TOKEN}` });
                s.bravo = s.pill({ x: 1248, y: 440, text: 'Call goes to Bravo', iconName: 'phone-forwarded', colour: 'green' });
            },
            cues: {
                a: (s) => { s.reveal(s.alpha); s.activate(s.alpha); },
                b: (s) => { s.reveal(s.token); },
                c: async (s) => {
                    await s.reveal(s.req);
                    s.c1 = s.connect(s.alpha, s.req, { from: 'r', to: 'l', colour: 'blue', toOpts: { dy: -30 }, fromOpts: { dy: -30 } });
                },
                d: async (s) => {
                    await s.reveal(s.pool);
                    const c = s.connect(s.req, s.pool, { from: 'r', to: 'l', colour: 'violet' });
                    await c.done;
                    await s.packet(c, { colour: 'violet', label: 'token', duration: 1000 });
                    s.pT.add({ t: 'TK-7fQm2Rx9Lp…', e: 'in 30 s' }, { flash: true });
                    s.pT.highlight(2, 'violet');
                    s.activate(s.alpha, false);
                    await s.reveal(s.invite);
                    await s.reveal(s.bravo);
                    const c2 = s.connect(s.invite, s.bravo, { from: 'r', to: 'l', colour: 'green' });
                    await c2.done;
                    s.packet(c2, { colour: 'green', duration: 900 });
                },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        verify: {
            build(s) {
                s.bravo = s.card({ x: 0, y: 20, w: 540, h: 400, title: 'Bravo Networks', sub: 'Receives the call', iconName: 'building-2', colour: 'green',
                    body: `<div class="tp-label">Token in the invite</div><div class="tp-mono" style="font-size:26px;margin-top:4px">${TOKEN}</div>
                        <ul class="tp-checks"><li>${s.icon('circle-check', { size: 28 })}Same caller · 020 7946 0100</li><li>${s.icon('circle-check', { size: 28 })}Same number called</li><li>${s.icon('circle-check', { size: 28 })}Still in date</li></ul>
                        <div class="tp-status">${s.icon('circle-help', { size: 30 })}<span>Not yet verified</span></div>` });
                s.pool = s.card({ x: 1188, y: 20, w: 540, h: 400, title: 'Token pool', sub: 'One entry per call', iconName: 'inbox', colour: 'violet', body: ' ' });
                s.pT = s.table(s.pool, { columns: [{ key: 'k', label: 'Field' }, { key: 'v', label: 'Value', num: true }], colour: 'violet' });
                s.pT.add({ k: 'Token', v: 'TK-7fQm2Rx9Lp…' });
                s.pT.add({ k: 'Caller', v: '020 7946 0100' });
                s.pT.add({ k: 'Called', v: '0161 496 0123' });
                s.exp = s.pT.add({ k: 'Expires', v: 'in 30 s' });
                s.exp.children[1].classList.add('tp-exp');
                s.req = s.msg({ x: 594, y: 20, w: 540, title: 'Request · Bravo → pool', colour: 'green', iconName: 'send', text: `GET /pstn2/v1/auth/tokens\n    /${TOKEN}` });
                s.res = s.msg({ x: 594, y: 160, w: 540, title: 'Answer · pool → Bravo', colour: 'violet', iconName: 'circle-check',
                    json: { verified: true, originatingCP: 'CP1-UK-0101', callerID: '+442079460100', calledID: '+441614960123', expiresAt: '2026-10-06T09:30:30Z' } });
                s.fail = s.pill({ x: 0, y: 470, text: 'No token, or expired → not verified', iconName: 'circle-x', colour: 'red' });
                s.dead = s.pill({ x: 1188, y: 470, text: 'Expired · now worthless', iconName: 'hourglass', colour: 'amber' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.bravo); s.ring(s.bravo.querySelector('.tp-mono'), { colour: 'green', size: 140 }); },
                b: async (s) => {
                    await s.reveal(s.pool);
                    s.c = s.connect(s.bravo, s.pool, { from: 'r', to: 'l', colour: 'green', fromOpts: { dy: 165 }, toOpts: { dy: 165 } });
                    s.reveal(s.req);
                    await s.c.done;
                    await s.packet(s.c, { colour: 'green', label: 'GET', duration: 1200 });
                    s.activate(s.pool);
                },
                c: async (s) => {
                    await s.packet(s.c, { colour: 'violet', label: 'details', duration: 1100, reverse: true });
                    s.reveal(s.res); s.activate(s.pool, false); s.activate(s.bravo);
                    for (const li of s.bravo.querySelectorAll('.tp-checks li')) { await s.wait(500); li.classList.add('tp-on'); }
                    const st = s.bravo.querySelector('.tp-status');
                    st.classList.add('tp-ok');
                    st.innerHTML = `${s.icon('badge-check', { size: 30 })}<span>Verified</span>`;
                },
                d: (s) => s.reveal(s.fail),
                e: async (s) => {
                    const cell = s.exp.children[1];
                    for (let t = 30; t >= 0; t -= 5) { cell.textContent = t ? `in ${t} s` : 'expired'; await s.wait(260); }
                    cell.textContent = 'expired';
                    s.pT.rows.slice(0, 3).forEach((r) => r.classList.add('tp-dead'));
                    s.reveal(s.dead);
                },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        governance: {
            build(s) {
                s.pool = s.card({ x: 614, y: 400, w: 500, title: 'Shared token pool', sub: 'Used by many providers', iconName: 'inbox', colour: 'violet' });
                s.cps = [
                    s.pill({ x: 40, y: 420, text: 'Alpha Telecom', iconName: 'building-2', colour: 'blue' }),
                    s.pill({ x: 40, y: 530, text: 'Charlie Comms', iconName: 'building-2', colour: 'amber' }),
                    s.pill({ x: 1240, y: 476, text: 'Bravo Networks', iconName: 'building-2', colour: 'green' }),
                ];
                s.op = s.card({ x: 614, y: 20, w: 500, title: 'Pool operator', sub: 'Such as a consortium of providers', iconName: 'handshake', colour: 'gold' });
                s.rules = s.card({ x: 1228, y: 0, w: 500, title: 'The rules', sub: 'Set by the operator', iconName: 'list-checks', colour: 'slate', compact: true,
                    body: `<ul class="tp-pm">
                        <li class="tp-plus p2-reveal p2-from-up">${s.icon('ticket', { size: 28 })}<div>Token format<small>TK- plus 16 characters</small></div></li>
                        <li class="tp-plus p2-reveal p2-from-up">${s.icon('timer', { size: 28 })}<div>Lifetime<small>30 seconds</small></div></li>
                        <li class="tp-plus p2-reveal p2-from-up">${s.icon('id-card', { size: 28 })}<div>Access<small>Authenticated providers only</small></div></li></ul>` });
                s.sum = s.statement({ x: 0, y: 30, w: 560, size: 46, html: 'Accountable, with <em>nothing kept for long.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.pool);
                    await s.reveal(s.cps);
                    s.cps.forEach((p, i) => s.connect(p, s.pool, { from: i < 2 ? 'r' : 'l', to: i < 2 ? 'l' : 'r', colour: 'violet', arrow: false, width: 3, opacity: 0.8 }));
                },
                b: async (s) => {
                    await s.reveal(s.op);
                    const c = s.connect(s.op, s.pool, { from: 'b', to: 't', colour: 'gold', dashed: true, label: 'runs' });
                    await c.done;
                    s.activate(s.op);
                },
                c: async (s) => {
                    s.activate(s.op, false);
                    await s.reveal(s.rules);
                    for (const li of s.rules.querySelectorAll('li')) { await s.reveal(li); await s.wait(500); }
                },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        scale: {
            build(s) {
                s.col1 = col(s, 0, 0, 840, 560, 'circle-help', 'Direct query', 'blue');
                s.col2 = col(s, 888, 0, 840, 560, 'ticket', 'Token pool', 'violet');
                s.small1 = node(s, { x: 345, y: 170, iconName: 'store', name: 'Small<br>provider', colour: 'cyan' });
                s.ins = [[40, 130], [40, 230], [40, 330], [660, 130], [660, 230], [660, 330]].map(([x, y]) => s.pill({ x, y, text: 'CP', iconName: 'building-2', colour: 'slate' }));
                s.lead1 = s.lead({ x: 40, y: 440, w: 760, size: 28, html: 'Runs an API that answers <b style="color:#fff">every incoming query</b>' });
                s.small2 = node(s, { x: 950, y: 170, iconName: 'store', name: 'Small<br>provider', colour: 'cyan' });
                s.pool = node(s, { x: 1330, y: 170, iconName: 'inbox', name: 'Token<br>pool', colour: 'violet' });
                s.readers = [s.pill({ x: 1580, y: 110, text: 'CP', iconName: 'building-2', colour: 'slate' }), s.pill({ x: 1580, y: 330, text: 'CP', iconName: 'building-2', colour: 'slate' })];
                s.lead2 = s.lead({ x: 928, y: 440, w: 760, size: 28, html: 'Simply <b style="color:#fff">writes to the pool</b>, and reads from it' });
                s.shared = s.pill({ x: 520, y: 594, text: 'Shared infrastructure · less burden for each provider', iconName: 'users', colour: 'green' });
            },
            cues: {
                a: (s) => s.reveal([s.col1, s.col2]),
                b: async (s) => {
                    s.activate(s.col1);
                    await s.reveal(s.small1);
                    await s.reveal(s.ins);
                    const cs = s.ins.map((p, i) => s.connect(p, s.small1, { from: i < 3 ? 'r' : 'l', to: i < 3 ? 'l' : 'r', colour: 'blue', width: 3 }));
                    await cs[0].done;
                    s.reveal(s.lead1);
                    cs.forEach((c, i) => s.wait(i * 120).then(() => s.packet(c, { colour: 'blue', duration: 800 })));
                },
                c: async (s) => {
                    s.activate(s.col1, false); s.activate(s.col2);
                    await s.reveal([s.small2, s.pool]);
                    const w = s.connect(s.small2, s.pool, { from: 'r', to: 'l', colour: 'violet', label: 'write' });
                    await w.done;
                    s.packet(w, { colour: 'violet', duration: 900 });
                    await s.reveal(s.readers);
                    s.readers.forEach((r) => s.connect(r, s.pool, { from: 'l', to: 'r', colour: 'slate', width: 3, label: '' }));
                    s.reveal(s.lead2);
                },
                d: (s) => { s.dim(s.col1); s.reveal(s.shared); },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        redundancy: {
            build(s) {
                s.alpha = node(s, { x: 80, y: 245, iconName: 'building-2', name: 'Alpha<br>Telecom', colour: 'blue' });
                s.pools = [0, 245, 490].map((y, i) => node(s, { x: 789, y, iconName: 'server', name: `Pool ${'ABC'[i]}`, colour: 'violet' }));
                s.bravo = node(s, { x: 1498, y: 245, iconName: 'building-2', name: 'Bravo<br>Networks', colour: 'green' });
                s.capA = cap(s, 5, 410, 300, 'Writes each token<br>to two pools');
                s.down = s.pill({ x: 980, y: 46, text: 'Unavailable', iconName: 'circle-x', colour: 'red' });
                s.ok = s.pill({ x: 1340, y: 430, text: 'Token checked · verified', iconName: 'circle-check', colour: 'green' });
                s.sum = s.statement({ x: 1060, y: 540, w: 668, size: 44, html: 'Verification <em>stays available.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.pools),
                b: async (s) => {
                    await s.reveal(s.alpha);
                    s.w1 = s.connect(s.alpha, s.pools[0], { from: 'r', to: 'l', colour: 'blue', bend: -0.1 });
                    s.w2 = s.connect(s.alpha, s.pools[1], { from: 'r', to: 'l', colour: 'blue' });
                    await s.w1.done;
                    s.packet(s.w1, { colour: 'violet', label: 'token', duration: 1100 });
                    await s.packet(s.w2, { colour: 'violet', label: 'token', duration: 1100 });
                    s.reveal(s.capA);
                },
                c: async (s) => {
                    s.pools[0].classList.add('tp-down'); s.w1.fade();
                    s.reveal(s.down);
                    await s.reveal(s.bravo);
                    const r = s.connect(s.bravo, s.pools[1], { from: 'l', to: 'r', colour: 'green' });
                    await r.done;
                    await s.packet(r, { colour: 'green', label: 'check', duration: 1000 });
                    s.activate(s.pools[1]);
                    await s.packet(r, { colour: 'violet', duration: 1000, reverse: true });
                    s.reveal(s.ok);
                },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        security: {
            build(s) {
                s.vault = node(s, { x: 754, y: 210, iconName: 'lock-keyhole', name: 'Token pool', colour: 'violet', big: true });
                const c = (x, y, title, sub, iconName, colour) => s.card({ x, y, w: 560, title, sub, iconName, colour, compact: true });
                s.k1 = c(0, 20, 'Signed and encrypted', 'Ed25519 signatures · TLS 1.3', 'fingerprint', 'blue');
                s.k2 = c(1168, 20, 'Providers only', 'Authenticated access, nobody else', 'id-card', 'green');
                s.k3 = c(0, 480, 'Rate limited', 'Floods get 429 Too Many Requests', 'gauge', 'amber');
                s.k4 = c(1168, 480, 'Audit log', 'Every access recorded', 'scroll-text', 'violet');
                s.forged = s.pill({ x: 60, y: 266, text: 'Forged token → rejected', iconName: 'shield-x', colour: 'red' });
                s.stranger = s.pill({ x: 1268, y: 266, text: 'Unknown party → refused', iconName: 'ban', colour: 'red' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.vault);
                    await s.reveal(s.k1);
                    s.connect(s.k1, s.vault, { from: 'b', to: 'l', colour: 'blue', dashed: true, arrow: false, fromOpts: { dx: 180 }, toOpts: { dy: -60 } });
                    s.reveal(s.forged);
                },
                b: async (s) => {
                    await s.reveal(s.k2);
                    s.connect(s.k2, s.vault, { from: 'b', to: 'r', colour: 'green', dashed: true, arrow: false, fromOpts: { dx: -180 }, toOpts: { dy: -60 } });
                    s.reveal(s.stranger);
                },
                c: async (s) => {
                    await s.reveal(s.k3);
                    s.connect(s.k3, s.vault, { from: 't', to: 'l', colour: 'amber', dashed: true, arrow: false, fromOpts: { dx: 180 }, toOpts: { dy: 60 } });
                },
                d: async (s) => {
                    await s.reveal(s.k4);
                    s.connect(s.k4, s.vault, { from: 't', to: 'r', colour: 'violet', dashed: true, arrow: false, fromOpts: { dx: -180 }, toOpts: { dy: 60 } });
                    s.activate(s.vault);
                },
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        small: {
            build(s) {
                s.cp = s.card({ x: 0, y: 20, w: 560, title: 'Small provider', sub: 'High call volume, small team', iconName: 'store', colour: 'cyan' });
                s.no = s.el(`<ul class="tp-strike"><li class="p2-reveal p2-from-left">${s.icon('ban', { size: 30 })}<span>Its own authentication servers</span></li><li class="p2-reveal p2-from-left">${s.icon('ban', { size: 30 })}<span>A service answering inbound queries</span></li></ul>`, { x: 10, y: 170, w: 600 });
                s.m1 = big(s.msg({ x: 680, y: 20, w: 1048, title: 'Create · before the call', colour: 'violet', iconName: 'ticket', text: 'POST {poolUrl}/pstn2/v1/auth/tokens' }), 26);
                s.m2 = big(s.msg({ x: 680, y: 160, w: 1048, title: 'Check · when a call arrives', colour: 'green', iconName: 'search', text: 'GET  {poolUrl}/pstn2/v1/auth/tokens/{tokenId}' }), 26);
                s.cheap = s.pill({ x: 680, y: 310, text: 'Simpler, and cheaper, to build', iconName: 'piggy-bank', colour: 'green' });
                s.sum = s.statement({ x: 0, y: 470, w: 1728, size: 52, cls: 'tp-center', html: 'Two API calls. <em>Strong authentication.</em>' });
            },
            cues: {
                a: (s) => { s.reveal(s.cp); s.activate(s.cp); },
                b: async (s) => {
                    for (const li of s.no.querySelectorAll('li')) {
                        await s.reveal(li); await s.wait(500); li.classList.add('tp-on'); await s.wait(500);
                    }
                },
                c: async (s) => {
                    s.activate(s.cp, false);
                    await s.reveal(s.m1);
                    await s.wait(700);
                    await s.reveal(s.m2);
                    await s.wait(500);
                    await s.reveal(s.cheap);
                    s.reveal(s.sum);
                },
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        hybrid: {
            build(s) {
                s.start = s.card({ x: 0, y: 200, w: 330, title: 'Incoming call', sub: 'at Bravo Networks', iconName: 'phone-incoming', colour: 'green', compact: true });
                s.dec = s.card({ x: 410, y: 200, w: 400, title: 'Token in the invite?', sub: 'X-PSTN2-Token header', iconName: 'circle-help', colour: 'slate', compact: true });
                s.o1 = s.card({ x: 900, y: 10, w: 500, title: 'Check the token pool', sub: 'GET …/auth/tokens/{tokenId}', iconName: 'ticket', colour: 'violet', compact: true,
                    body: `<span class="p2-reveal p2-from-up" style="display:inline-block">${s.tag('Small providers · simplicity', 'violet')}</span>` });
                s.o2 = s.card({ x: 900, y: 330, w: 500, title: 'Direct query', sub: 'POST …/auth/verify', iconName: 'send', colour: 'blue', compact: true,
                    body: `<span class="p2-reveal p2-from-up" style="display:inline-block">${s.tag('Large providers · full control', 'blue')}</span>` });
                s.v1 = s.pill({ x: 1460, y: 60, text: 'Verified', iconName: 'circle-check', colour: 'green' });
                s.v2 = s.pill({ x: 1460, y: 374, text: 'Verified', iconName: 'circle-check', colour: 'green' });
                s.fb = s.pill({ x: 900, y: 574, text: 'Neither available → today’s network', iconName: 'phone', colour: 'slate' });
            },
            cues: {
                a: (s) => s.reveal([s.o1, s.o2]),
                b: async (s) => {
                    await s.reveal(s.o2.querySelector('.p2-reveal'));
                    await s.wait(1600);
                    s.reveal(s.o1.querySelector('.p2-reveal'));
                },
                c: async (s) => {
                    await s.reveal([s.start, s.dec]);
                    const a = s.connect(s.start, s.dec, { from: 'r', to: 'l', colour: 'green' });
                    await a.done;
                    const y = s.connect(s.dec, s.o1, { from: 't', to: 'l', colour: 'violet', bend: 0.25, label: 'yes', labelDy: -14 });
                    await y.done;
                    s.activate(s.o1);
                    const r1 = s.connect(s.o1, s.v1, { from: 'r', to: 'l', colour: 'green' });
                    await r1.done; await s.reveal(s.v1);
                    await s.wait(500);
                    s.activate(s.o1, false);
                    const n = s.connect(s.dec, s.o2, { from: 'b', to: 'l', colour: 'blue', bend: -0.25, label: 'no token', labelDy: 36 });
                    await n.done;
                    s.activate(s.o2);
                    const r2 = s.connect(s.o2, s.v2, { from: 'r', to: 'l', colour: 'green' });
                    await r2.done; s.reveal(s.v2);
                },
                d: async (s) => {
                    s.activate(s.o2, false);
                    s.connect(s.o2, s.fb, { from: 'b', to: 't', colour: 'slate', dashed: true, fromOpts: { dx: -150 }, toOpts: { dx: -152 } });
                    await s.wait(300);
                    s.reveal(s.fb);
                },
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        tradeoffs: {
            build(s) {
                const li = (kind, iconName, text, sub) => `<li class="tp-${kind} p2-reveal p2-from-up">${s.icon(iconName, { size: 30 })}<div>${text}<small>${sub}</small></div></li>`;
                s.dq = s.el(`<h3>${s.icon('send', { size: 38 })}Direct query</h3><ul class="tp-pm">
                    ${li('plus', 'circle-check', 'No shared infrastructure', 'Nothing extra to govern')}
                    ${li('minus', 'triangle-alert', 'A query for every call', 'Every originator must answer')}
                    ${li('plus', 'circle-check', 'Full control', 'Each provider answers for itself')}</ul>`, { x: 0, y: 0, w: 840, h: 410, cls: 'p2-col tp-col', colour: 'blue', hidden: true });
                s.tp = s.el(`<h3>${s.icon('ticket', { size: 38 })}Token pool</h3><ul class="tp-pm">
                    ${li('minus', 'triangle-alert', 'Needs governance', 'Someone must run the pool')}
                    ${li('minus', 'triangle-alert', 'A shared component', 'More to secure and keep available')}
                    ${li('plus', 'circle-check', 'Scales for high volume', 'One write and one check per call')}</ul>`, { x: 888, y: 0, w: 840, h: 410, cls: 'p2-col tp-col', colour: 'violet', hidden: true });
                s.dqL = [...s.dq.querySelectorAll('li')];
                s.tpL = [...s.tp.querySelectorAll('li')];
                s.f = [
                    s.pill({ x: 330, y: 470, text: 'Provider size', iconName: 'building-2', colour: 'cyan' }),
                    s.pill({ x: 650, y: 470, text: 'Call volume', iconName: 'activity', colour: 'cyan' }),
                    s.pill({ x: 950, y: 470, text: 'Control or simplicity', iconName: 'scale', colour: 'cyan' }),
                ];
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.dq, s.tp]);
                    await s.reveal(s.tpL[0]); await s.wait(400); await s.reveal(s.tpL[1]);
                    await s.wait(600); s.reveal(s.dqL[0]);
                },
                b: async (s) => { await s.reveal(s.tpL[2]); await s.wait(500); s.reveal(s.dqL[1]); },
                c: async (s) => { s.reveal(s.dqL[2]); await s.wait(500); s.reveal(s.f); },
            },
        },

        // 11 ────────────────────────────────────────────────────────────
        path: {
            build(s) {
                s.ops = [
                    s.card({ x: 0, y: 0, w: 520, title: 'Industry groups', sub: 'Run by providers together', iconName: 'users', colour: 'gold', compact: true }),
                    s.card({ x: 604, y: 0, w: 520, title: 'Regulators', sub: 'Run as a public service', iconName: 'landmark', colour: 'gold', compact: true }),
                    s.card({ x: 1208, y: 0, w: 520, title: 'Commercial operators', sub: 'Run as a service', iconName: 'store', colour: 'gold', compact: true }),
                ];
                s.pool = node(s, { x: 789, y: 200, iconName: 'inbox', name: 'Token<br>pool', colour: 'violet' });
                s.neutral = s.pill({ x: 400, y: 245, text: 'Neutral', iconName: 'scale', colour: 'green' });
                s.open = s.pill({ x: 1080, y: 245, text: 'Open access', iconName: 'lock-open', colour: 'green' });
                const names = [['Alpha Telecom', 'blue', 229], ['Bravo Networks', 'green', 509], ['Charlie Comms', 'amber', 809], ['Small CP', 'cyan', 1099], ['Small CP', 'cyan', 1319]];
                s.cps = names.map(([t, c, x]) => s.pill({ x, y: 500, text: t, iconName: 'building-2', colour: c }));
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.pool);
                    for (const o of s.ops) {
                        await s.reveal(o);
                        s.connect(o, s.pool, { from: 'b', to: 't', colour: 'gold', dashed: true, arrow: false });
                        await s.wait(400);
                    }
                },
                b: (s) => s.reveal([s.neutral, s.open]),
                c: async (s) => {
                    await s.reveal(s.cps);
                    s.cps.forEach((p) => s.connect(p, s.pool, { from: 't', to: 'b', colour: 'violet', width: 3, arrow: false, opacity: 0.85 }));
                    s.activate(s.pool);
                },
            },
        },
    },
});
