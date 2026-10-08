// Caller Authentication — PSTN2 v1.1 (SPECIFICATION.md §5, §9)
// Alpha Telecom is the receiving (terminating) provider and always sits on the left.
// Numbers are from Ofcom's reserved TV/drama ranges; providers are fictional.
import { createDeck } from '../../shared/pstn2-player.js';

const REF = '0d1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
const SIG = 'kV6QbUqP3vD0aXk2…';

const status = (s, cls = '', iconName = '', text = '') =>
    `<div class="aq-status ${cls}">${iconName ? s.icon(iconName, { size: 28 }) : ''}<span>${text}</span></div>`;
function setStatus(s, card, cls, iconName, text) {
    const el = card.querySelector('.aq-status');
    el.className = `aq-status ${cls}`;
    el.innerHTML = `${s.icon(iconName, { size: 28 })}<span>${text}</span>`;
}
const numBlock = (label, num = '', cls = '') => `<div class="aq-label">${label}</div><div class="aq-num ${cls}">${num}</div>`;

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        problem: {
            build(s) {
                s.net = s.card({ x: 644, y: 120, w: 440, h: 230, title: 'Phone network', sub: 'Today’s PSTN', iconName: 'network', colour: 'slate',
                    body: status(s, '', 'circle-help', 'No way to check the caller') });
                s.cust = s.card({ x: 1288, y: 120, w: 440, h: 230, title: 'Customer', sub: 'Incoming call', iconName: 'smartphone', colour: 'blue',
                    body: `<div class="aq-label">Caller ID shows</div><div class="aq-name"></div><div class="aq-num"></div>` });
                s.fraud = s.card({ x: 0, y: 120, w: 440, h: 230, title: 'Fraudster', sub: 'Any internet phone line', iconName: 'user-x', colour: 'red',
                    body: `<div class="aq-label">Claims to be</div><div class="aq-name" style="color:var(--red-2)"></div><div class="aq-num aq-bad"></div>` });
                s.through = s.pill({ x: 686, y: 420, text: 'Passed straight through', iconName: 'arrow-right', colour: 'amber' });
                s.scale = s.statement({ x: 0, y: 530, w: 1728, size: 62, cls: 'aq-center aq-red', html: 'Fraud on a <em>massive scale.</em>' });
            },
            cues: {
                a: (s) => s.reveal([s.net, s.cust]),
                b: async (s) => {
                    await s.reveal(s.fraud);
                    await s.type(s.fraud.querySelector('.aq-name'), 'Your Bank', { cps: 18 });
                    await s.type(s.fraud.querySelector('.aq-num'), '020 7946 0555', { cps: 16 });
                },
                c: async (s) => {
                    const c1 = s.connect(s.fraud, s.net, { from: 'r', to: 'l', colour: 'red' });
                    await c1.done;
                    s.reveal(s.through);
                    await s.packet(c1, { colour: 'red', duration: 900 });
                    const c2 = s.connect(s.net, s.cust, { from: 'r', to: 'l', colour: 'red' });
                    await c2.done;
                    await s.packet(c2, { colour: 'red', duration: 900 });
                    s.cust.querySelector('.aq-name').textContent = 'Your Bank';
                    s.cust.querySelector('.aq-num').textContent = '020 7946 0555';
                    s.activate(s.cust);
                    s.ring(s.cust, { colour: 'red', size: 240 });
                },
                d: (s) => s.reveal(s.scale),
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        ask: {
            build(s) {
                s.big = s.statement({ x: 0, y: 0, w: 1728, size: 66, cls: 'aq-center', html: 'Just <em>ask.</em>' });
                s.alpha = s.card({ x: 0, y: 140, w: 520, h: 250, title: 'Alpha Telecom', sub: 'Receives the call', iconName: 'building-2', colour: 'blue',
                    body: numBlock('Incoming caller ID', '0161 496 0123') + status(s, '', 'circle-help', 'Not yet verified') });
                s.bravo = s.card({ x: 1208, y: 140, w: 520, h: 250, title: 'Bravo Networks', sub: 'Holds 0161 496 0xxx', iconName: 'building-2', colour: 'green',
                    body: numBlock('Its customer is calling', '0161 496 0123') });
                s.q = s.pill({ x: 664, y: 96, text: 'Did you place this call?', iconName: 'circle-help', colour: 'blue' });
                s.res = s.msg({ x: 594, y: 400, w: 540, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { verified: true, callerID: '+441614960123', trustLevel: 'verified', signature: SIG } });
                s.fast = s.pill({ x: 60, y: 470, text: 'Typically under 100 ms', iconName: 'timer', colour: 'green' });
            },
            cues: {
                a: (s) => s.reveal(s.big),
                b: async (s) => {
                    s.hide(s.big);
                    await s.reveal([s.alpha, s.bravo]);
                    s.call = s.connect(s.bravo, s.alpha, { from: 'l', to: 'r', colour: 'slate', dashed: true, label: 'Incoming call', labelDy: 34, fromOpts: { dy: 70 }, toOpts: { dy: 70 } });
                    await s.call.done;
                    s.packet(s.call, { colour: 'slate', duration: 1400 });
                },
                c: async (s) => {
                    s.activate(s.alpha);
                    s.qc = s.connect(s.alpha, s.bravo, { from: 'r', to: 'l', colour: 'blue', bend: -0.16, fromOpts: { dy: -40 }, toOpts: { dy: -40 } });
                    await s.qc.done;
                    s.reveal(s.q);
                    await s.packet(s.qc, { colour: 'blue', duration: 1300 });
                    s.activate(s.alpha, false); s.activate(s.bravo);
                },
                d: async (s) => {
                    await s.packet(s.qc, { colour: 'green', duration: 1300, reverse: true });
                    s.activate(s.bravo, false); s.activate(s.alpha);
                    setStatus(s, s.alpha, 'aq-ok', 'circle-check', 'Verified by Bravo');
                    s.reveal([s.res, s.fast]);
                },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        flow: {
            build(s) {
                s.st = s.steps({ x: 0, y: 0, w: 1728, items: ['Find the caller’s provider', 'Send a signed request', 'Check call records', 'Answer'] });
                s.alpha = s.card({ x: 0, y: 112, w: 520, title: 'Alpha Telecom', sub: 'Receives the call', iconName: 'building-2', colour: 'blue', compact: true,
                    body: numBlock('Incoming caller ID', '0161 496 0123')
                        + `<div class="aq-label" style="margin-top:14px">Number discovery</div><ul class="aq-trace">
                            <li style="--c:var(--ink-3)">${s.icon('database', { size: 26 })}<span>Cache · no entry</span></li>
                            <li style="--c:var(--gold)">${s.icon('file-text', { size: 26 })}<span>Ofcom list · Range Holder <b>Bravo</b></span></li>
                            <li style="--c:var(--green-2)">${s.icon('circle-check', { size: 26 })}<span>Bravo answers · <b>held</b></span></li></ul>`
                        + status(s, '', 'circle-help', 'Not yet verified') });
                s.bravo = s.card({ x: 1208, y: 112, w: 520, title: 'Bravo Networks', sub: 'The caller’s provider', iconName: 'building-2', colour: 'green', compact: true, body: '<div class="aq-label">Calls just placed</div>' });
                s.calls = s.table(s.bravo, { columns: [{ key: 'a', label: 'Caller', num: true }, { key: 'b', label: 'Called', num: true }], colour: 'green' });
                s.calls.add({ a: '0161 496 0777', b: '07700 900123' });
                s.calls.add({ a: '0161 496 0123', b: '020 7946 0100' });
                s.calls.add({ a: '0161 496 0500', b: '0113 496 0789' });
                s.req = s.msg({ x: 574, y: 104, w: 580, title: 'POST /pstn2/v1/auth/verify', colour: 'blue', iconName: 'send',
                    json: { callerID: '+441614960123', calledID: '+442079460100', callReference: '0d1f2a3b-4c5d-…', signature: SIG } });
                s.res = s.msg({ x: 574, y: 392, w: 580, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { verified: true, callReference: '0d1f2a3b-4c5d-…', trustLevel: 'verified', signature: 'Hq3xW9mLp2Tz…' } });
                s.otherwise = s.pill({ x: 1240, y: 440, text: 'No record → not verified', iconName: 'circle-x', colour: 'red' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.st.el, s.alpha, s.bravo]);
                    s.dim(s.bravo);
                    s.st.set(0); s.activate(s.alpha);
                    const lis = [...s.alpha.querySelectorAll('.aq-trace li')];
                    for (const li of lis) { li.classList.add('aq-on'); await s.wait(900); }
                },
                b: async (s) => {
                    s.st.set(1); s.dim(s.bravo, false);
                    s.c = s.connect(s.alpha, s.bravo, { from: 'r', to: 'l', colour: 'blue', fromOpts: { dy: 56 }, toOpts: { dy: 107 } });
                    s.reveal(s.req);
                    await s.c.done;
                    await s.packet(s.c, { colour: 'blue', duration: 1300 });
                    s.activate(s.alpha, false); s.activate(s.bravo);
                },
                c: (s) => { s.st.set(2); s.wait(600).then(() => s.calls.highlight(1, 'green')); },
                d: async (s) => {
                    s.st.set(3);
                    await s.packet(s.c, { colour: 'green', duration: 1200, reverse: true });
                    s.reveal(s.res);
                    await s.wait(1600);
                    s.reveal(s.otherwise);
                },
                e: (s) => {
                    s.st.done(); s.activate(s.bravo, false); s.activate(s.alpha);
                    setStatus(s, s.alpha, 'aq-ok', 'circle-check', 'Caller ID confirmed');
                    s.ring(s.alpha.querySelector('.aq-status'), { colour: 'green', size: 160 });
                },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        ported: {
            build(s) {
                s.st = s.steps({ x: 0, y: 0, w: 1728, items: ['Numbering list', 'Ask the Range Holder', 'Follow the redirect', 'Verify with the holder'] });
                s.alpha = s.card({ x: 0, y: 104, w: 540, h: 220, title: 'Alpha Telecom', sub: 'Receives the call', iconName: 'building-2', colour: 'blue', compact: true,
                    body: numBlock('Incoming caller ID', '') + status(s, '', 'circle-help', 'Who holds this number?') });
                s.charlie = s.card({ x: 1188, y: 104, w: 540, title: 'Charlie Comms', sub: 'Range Holder · 0113 496 0xxx', iconName: 'building-2', colour: 'amber', compact: true, body: ' ' });
                s.cT = s.table(s.charlie, { columns: [{ key: 'n', label: 'Number database', num: true }, { key: 'st', label: 'Status' }], colour: 'amber' });
                s.cT.add({ n: '0113 496 0789', st: 'In service' });
                s.cT.add({ n: '0113 496 0456', st: 'Ported out → Bravo' });
                s.bravo = s.card({ x: 1188, y: 392, w: 540, title: 'Bravo Networks', sub: 'Holds the number today', iconName: 'building-2', colour: 'green', compact: true, body: ' ' });
                s.bT = s.table(s.bravo, { columns: [{ key: 'n', label: 'Number database', num: true }, { key: 'st', label: 'Status' }], colour: 'green' });
                s.bT.add({ n: '0161 496 0123', st: 'In service' });
                s.bT.add({ n: '0113 496 0456', st: 'Ported in · from Charlie' });
                s.list = s.pill({ x: 0, y: 360, text: 'Ofcom list → Charlie Comms', iconName: 'file-text', colour: 'gold' });
                s.redir = s.msg({ x: 586, y: 214, w: 560, expand: true, title: 'Answer · Charlie → Alpha', colour: 'amber', iconName: 'forward',
                    json: { result: 'redirect', portedTo: { cpName: 'Bravo Networks', url: 'https://pstn2.bravo-networks.example' } } });
                s.ok = s.msg({ x: 586, y: 214, w: 560, title: 'Verification · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { verified: true, callerID: '+441134960456', trustLevel: 'verified' } });
                s.stale = s.msg({ x: 566, y: 214, w: 600, title: 'Stale cache · wrong provider replies', colour: 'red', iconName: 'refresh-cw',
                    json: { verified: false, result: 'not_held', cache: { invalidate: true, scope: 'number' } } });
                s.hops = s.pill({ x: 640, y: 420, text: 'Rediscover and retry · max 5 hops', iconName: 'repeat', colour: 'violet' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.st.el, s.alpha, s.charlie, s.bravo]);
                    s.dim(s.charlie); s.dim(s.bravo);
                    s.ring(s.alpha.querySelector('.aq-status'), { colour: 'blue', size: 150 });
                },
                b: async (s) => {
                    s.type(s.alpha.querySelector('.aq-num'), '0113 496 0456', { cps: 14 });
                    s.st.set(0); s.reveal(s.list);
                    await s.wait(1400);
                    s.st.set(1); s.dim(s.charlie, false); s.activate(s.charlie);
                    s.c1 = s.connect(s.alpha, s.charlie, { from: 'r', to: 'l', colour: 'blue', fromOpts: { dy: -30 }, toOpts: { dy: -27 } });
                    await s.c1.done;
                    s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1300 });
                },
                c: async (s) => {
                    s.cT.highlight(1, 'amber');
                    await s.wait(900);
                    s.st.set(2);
                    await s.packet(s.c1, { colour: 'amber', label: 'redirect', duration: 1300, reverse: true });
                    s.reveal(s.redir);
                },
                d: async (s) => {
                    s.st.set(3);
                    s.activate(s.charlie, false); s.dim(s.charlie); s.dim(s.bravo, false); s.activate(s.bravo);
                    s.hide(s.list); s.hide(s.redir); s.c1.fade();
                    s.c2 = s.connect(s.alpha, s.bravo, { from: 'b', to: 'l', colour: 'blue', bend: 0.32, fromOpts: { dx: 40 }, toOpts: { dy: 10 } });
                    await s.c2.done;
                    await s.packet(s.c2, { colour: 'blue', label: 'verify', duration: 1200 });
                    s.bT.highlight(1, 'green');
                    await s.packet(s.c2, { colour: 'green', label: 'verified', duration: 1200, reverse: true });
                    s.reveal(s.ok);
                    setStatus(s, s.alpha, 'aq-ok', 'circle-check', 'Verified by Bravo, the holder');
                    s.st.done();
                },
                e: (s) => {
                    s.hide(s.ok); s.c2.fade(); s.activate(s.bravo, false);
                    s.wait(400).then(() => s.reveal([s.stale, s.hops]));
                },
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        speed: {
            build(s) {
                s.stat = s.stat({ x: 0, y: 10, w: 900, value: '0 ms', label: 'typical time to verify a caller ID', colour: 'green' });
                s.stat.querySelector('.p2-stat-value').style.fontSize = '150px';
                s.tl = s.el(`<div class="aq-tlhead"><b>Call setup</b><span>under one second in total</span></div>
                    <div class="aq-tl"><div class="aq-d" style="flex:0 0 6%">Discover</div><div class="aq-v" style="flex:0 0 10%">Verify</div><div class="aq-r" style="flex:0 0 20%">Route &amp; connect</div><div class="aq-rest" style="flex:1 1 auto">${s.icon('phone-incoming', { size: 28 })}Phone rings</div></div>
                    <div class="aq-scale"><span>0</span><span>250 ms</span><span>500 ms</span><span>750 ms</span><span>1 s</span></div>`, { x: 0, y: 250, w: 1728, hidden: true });
                s.before = s.pill({ x: 324, y: 450, text: 'Finished before the phone rings', iconName: 'circle-check', colour: 'green' });
                s.seam = s.statement({ x: 0, y: 560, w: 1728, size: 52, cls: 'aq-center', html: 'No delay. <em>A seamless experience.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.stat);
                    await s.countUp(s.stat, 100, { format: (v) => `${Math.round(v)} ms`, duration: 1200 });
                    s.stat.querySelector('.p2-stat-value').textContent = '< 100 ms';
                },
                b: async (s) => {
                    await s.reveal(s.tl);
                    for (const seg of s.tl.querySelectorAll('.aq-tl > div')) { seg.classList.add('aq-on'); await s.wait(500); }
                    s.reveal(s.before);
                },
                c: (s) => s.reveal(s.seam),
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        fraud: {
            build(s) {
                s.fraud = s.card({ x: 0, y: 30, w: 440, h: 210, title: 'Fraudster', sub: 'Spoofs a Bravo number', iconName: 'user-x', colour: 'red', body: numBlock('Fake caller ID', '0161 496 0123', 'aq-bad') });
                s.alpha = s.card({ x: 644, y: 30, w: 440, h: 210, title: 'Alpha Telecom', sub: 'Receives the call', iconName: 'building-2', colour: 'blue', body: status(s, '', 'circle-help', 'Checking the caller…') });
                s.cust = s.card({ x: 1288, y: 30, w: 440, h: 210, title: 'Alpha customer', sub: '020 7946 0100', iconName: 'smartphone', colour: 'blue', body: status(s, '', 'phone-off', 'Not ringing yet') });
                s.bravo = s.card({ x: 644, y: 374, w: 440, title: 'Bravo Networks', sub: 'Holds 0161 496 0123', iconName: 'building-2', colour: 'green', compact: true, body: '<div class="aq-label">Calls just placed</div>' });
                s.bT = s.table(s.bravo, { columns: [{ key: 'a', label: 'Caller', num: true }, { key: 'b', label: 'Called', num: true }], colour: 'green' });
                s.bT.add({ a: '0161 496 0777', b: '07700 900123' });
                s.bT.add({ a: '0161 496 0500', b: '0113 496 0789' });
                s.res = s.msg({ x: 1150, y: 400, w: 578, title: 'Answer · Bravo → Alpha', colour: 'red', iconName: 'circle-x',
                    json: { verified: false, error: 'call_not_found', message: 'No matching call found' } });
                s.blocked = s.pill({ x: 1094, y: 112, text: 'Blocked', iconName: 'ban', colour: 'red' });
                s.sum = s.statement({ x: 0, y: 400, w: 600, size: 50, html: 'Spoofing a PSTN2 number <em>simply stops working.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.fraud, s.alpha, s.cust]);
                    const c = s.connect(s.fraud, s.alpha, { from: 'r', to: 'l', colour: 'red' });
                    await c.done;
                    await s.packet(c, { colour: 'red', label: 'call', duration: 1100 });
                    s.activate(s.alpha);
                },
                b: async (s) => {
                    await s.reveal(s.bravo);
                    s.q = s.connect(s.alpha, s.bravo, { from: 'b', to: 't', colour: 'blue', fromOpts: { dx: -60 }, toOpts: { dx: -60 } });
                    s.r = s.connect(s.bravo, s.alpha, { from: 't', to: 'b', colour: 'red', fromOpts: { dx: 60 }, toOpts: { dx: 60 } });
                    await s.q.done;
                    await s.packet(s.q, { colour: 'blue', label: 'verify?', duration: 1100 });
                    s.activate(s.alpha, false); s.activate(s.bravo);
                    s.bT.rows.forEach((r) => r.classList.add('p2-strike'));
                    await s.wait(700);
                    await s.packet(s.r, { colour: 'red', label: 'not verified', duration: 1100 });
                    s.reveal(s.res);
                    setStatus(s, s.alpha, 'aq-bad-s', 'circle-x', 'Caller ID not verified');
                    s.activate(s.bravo, false);
                },
                c: async (s) => {
                    s.activate(s.alpha);
                    s.connect(s.alpha, s.cust, { from: 'r', to: 'l', colour: 'red', dashed: true, arrow: false });
                    await s.reveal(s.blocked);
                    setStatus(s, s.cust, 'aq-ok', 'shield-check', 'Protected · never rang');
                    s.ring(s.cust, { colour: 'green', size: 230 });
                },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        stir: {
            build(s) {
                const row = (head, body, sub) => `<div class="aq-row p2-reveal p2-from-up"><div class="aq-row-h">${head}</div><div class="aq-row-b">${body}</div>${sub ? `<div class="aq-row-s">${sub}</div>` : ''}</div>`;
                s.left = s.el(`<h3>${s.icon('stamp', { size: 40 })}STIR/SHAKEN</h3>
                    ${row('The answer', '<span class="aq-grade">A</span><span class="aq-grade">B</span><span class="aq-grade">C</span><span>Attestation level</span>', 'How confident is the originating carrier?')}
                    ${row('What it needs', `<div class="aq-chain"><span>Certificate authorities</span>${s.icon('arrow-right', { size: 24 })}<span>Certificates</span>${s.icon('arrow-right', { size: 24 })}<span>Governance</span></div>`, 'A certificate infrastructure to build and run')}`,
                    { x: 0, y: 30, w: 840, h: 490, cls: 'p2-col aq-col', colour: 'amber', hidden: true, from: 'left' });
                s.right = s.el(`<h3>${s.icon('shield-check', { size: 40 })}PSTN2</h3>
                    ${row('The answer', `<span class="aq-yes">${s.icon('circle-check', { size: 28 })}Yes, we placed it</span><span class="aq-no">${s.icon('circle-x', { size: 28 })}No, we did not</span>`, 'A definitive answer from the caller’s own provider')}
                    ${row('What it needs', 'Direct, signed messages', '<span class="aq-mono">GET {cpUrl}/pstn2/v1/keys</span><br>Each provider publishes its own keys')}`,
                    { x: 888, y: 30, w: 840, h: 490, cls: 'p2-col aq-col', colour: 'green', hidden: true, from: 'right' });
                s.lr = [...s.left.querySelectorAll('.aq-row')];
                s.rr = [...s.right.querySelectorAll('.aq-row')];
            },
            cues: {
                a: (s) => s.reveal(s.left),
                b: (s) => s.reveal(s.lr[0]),
                c: async (s) => { await s.reveal(s.right); s.reveal(s.rr[0]); },
                d: (s) => s.reveal(s.lr[1]),
                e: (s) => s.reveal(s.rr[1]),
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        security: {
            build(s) {
                s.tls = s.el(`<div class="aq-layer-t">${s.icon('lock', { size: 30 })}TLS 1.3<small>encrypted connection</small></div>`, { x: 0, y: 0, w: 1000, h: 580, cls: 'aq-layer', colour: 'blue', hidden: true, from: 'scale' });
                s.sig = s.el(`<div class="aq-layer-t">${s.icon('fingerprint', { size: 30 })}Ed25519 signature<small>cannot be forged or altered</small></div>`, { x: 50, y: 74, w: 900, h: 470, cls: 'aq-layer', colour: 'green', hidden: true, from: 'scale' });
                s.m = s.msg({ x: 100, y: 150, w: 800, title: 'Verification request · Alpha → Bravo', colour: 'slate', iconName: 'send',
                    json: { messageId: '550e8400-e29b-41d4-a716-446655440000', timestamp: '2026-10-06T09:30:00.000Z', requestingCP: 'CP1-UK-0101', callerID: '+441614960123', signature: SIG } });
                s.replay = s.pill({ x: 100, y: 446, text: 'Unique ID + timestamp · replays rejected', iconName: 'history', colour: 'green' });
                s.rate = s.card({ x: 1060, y: 0, w: 668, title: 'Rate limiting', sub: 'Floods get 429 Too Many Requests', iconName: 'gauge', colour: 'amber', compact: true });
                s.log = s.card({ x: 1060, y: 150, w: 668, title: 'Audit log', sub: 'Every request recorded', iconName: 'scroll-text', colour: 'violet', compact: true, body: ' ' });
                s.lT = s.table(s.log, { columns: [{ key: 't', label: 'Time', num: true }, { key: 'r', label: 'Result' }, { key: 'n', label: 'Caller ID', num: true }], colour: 'violet' });
                s.lT.add({ t: '09:30:00', r: 'verified', n: '0161 496 0123' }).children[1].classList.add('aq-okc');
                s.lT.add({ t: '09:30:04', r: 'not verified', n: '0161 496 0123' }).children[1].classList.add('aq-noc');
                s.lT.add({ t: '09:30:09', r: 'verified', n: '0113 496 0456' }).children[1].classList.add('aq-okc');
                s.sum = s.statement({ x: 1060, y: 470, w: 668, size: 50, html: 'Resilient <em>under attack.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.tls),
                b: async (s) => { await s.reveal([s.sig, s.m]); await s.wait(1600); s.reveal(s.replay); },
                c: (s) => { s.reveal(s.rate); s.ring(s.rate.querySelector('.p2-chip'), { colour: 'amber', size: 120 }); },
                d: async (s) => { await s.reveal(s.log); await s.wait(400); s.lT.highlight(1, 'red'); },
                e: (s) => s.reveal(s.sum),
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        implement: {
            build(s) {
                s.ask = s.card({ x: 0, y: 70, w: 400, h: 240, title: 'Alpha Telecom', sub: 'Any PSTN2 provider', iconName: 'building-2', colour: 'blue', compact: true,
                    body: '<div class="aq-label">Asks</div><div style="font-size:26px;color:#fff;font-weight:600;margin-top:6px">Did you place this call?</div>' });
                s.srv = s.card({ x: 520, y: 70, w: 640, h: 240, title: 'Your PSTN2 endpoint', sub: 'One API to build', iconName: 'server', colour: 'violet',
                    body: `<div class="aq-mono" style="font-size:28px;color:#fff">POST /pstn2/v1/auth/verify</div>${status(s, '', '', '')}` });
                s.db = s.card({ x: 1280, y: 70, w: 448, h: 240, title: 'Recent calls', sub: 'Your own records', iconName: 'database', colour: 'cyan', compact: true, body: ' ' });
                s.dbT = s.table(s.db, { columns: [{ key: 'a', label: 'Caller', num: true }, { key: 'b', label: 'Called', num: true }], colour: 'cyan' });
                s.dbT.add({ a: '0161 496 0123', b: '020 7946 0100' });
                s.dbT.add({ a: '0161 496 0500', b: '0113 496 0789' });
                s.noDb = s.pill({ x: 190, y: 420, text: 'No central database', iconName: 'ban', colour: 'red' });
                s.noCa = s.pill({ x: 560, y: 420, text: 'No certificate authority', iconName: 'ban', colour: 'red' });
                s.ofcom = s.pill({ x: 1000, y: 420, text: 'Providers found via Ofcom’s S1–S9 lists', iconName: 'file-text', colour: 'gold' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.srv);
                    await s.reveal(s.ask);
                    s.c1 = s.connect(s.ask, s.srv, { from: 'r', to: 'l', colour: 'blue', fromOpts: { dy: 0 }, toOpts: { dy: 0 } });
                    await s.c1.done;
                    s.packet(s.c1, { colour: 'blue', label: 'request', duration: 1100 });
                },
                b: async (s) => {
                    await s.reveal(s.db);
                    s.c2 = s.connect(s.srv, s.db, { from: 'r', to: 'l', colour: 'cyan', toOpts: { dy: 0 } });
                    await s.c2.done;
                    await s.packet(s.c2, { colour: 'cyan', duration: 900 });
                    s.activate(s.db); s.dbT.highlight(0, 'cyan');
                    await s.packet(s.c2, { colour: 'cyan', duration: 900, reverse: true });
                    s.activate(s.db, false);
                    setStatus(s, s.srv, 'aq-ok', 'badge-check', 'Checks recent calls · signs the answer');
                    await s.packet(s.c1, { colour: 'green', label: 'signed answer', duration: 1100, reverse: true });
                },
                c: (s) => s.reveal([s.noDb, s.noCa]),
                d: (s) => s.reveal(s.ofcom),
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        impact: {
            build(s) {
                s.stat = s.stat({ x: 0, y: 20, w: 760, value: '0%', label: 'potential reduction in fraud rates', colour: 'green' });
                s.stat.querySelector('.p2-stat-value').style.fontSize = '180px';
                s.list = s.bullets({ x: 860, y: 30, w: 868, gap: 30, items: [
                    { icon: 'shield-check', colour: 'green', text: 'Victims protected', sub: 'Spoofed calls stopped before they ring' },
                    { icon: 'ban', colour: 'red', text: 'Fraudsters stopped', sub: 'A faked caller ID simply fails' },
                    { icon: 'handshake', colour: 'blue', text: 'Trust restored', sub: 'People can answer the phone with confidence' },
                ] });
                s.sum = s.statement({ x: 0, y: 450, w: 1728, size: 56, cls: 'aq-center', html: 'Using technology <em>available today.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.stat);
                    await s.countUp(s.stat, 80, { format: (v) => `${Math.round(v)}%`, duration: 1500 });
                    s.stat.querySelector('.p2-stat-value').textContent = '80%+';
                },
                b: (s) => s.reveal(s.list.items.slice(0, 2)),
                c: async (s) => { await s.reveal(s.list.items[2]); s.reveal(s.sum); },
            },
        },
    },
});
