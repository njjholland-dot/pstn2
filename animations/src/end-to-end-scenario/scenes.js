// End-to-End Scenario — one PSTN2 v1.1 call from Alice to Bob (SPECIFICATION.md Appendix A)
// Providers are fictional; numbers come from Ofcom's reserved TV/drama ranges.
// Alice: Alpha Telecom, 07700 900123. Bob: Bravo Networks, 0113 496 0456 (ported in from Charlie Comms).
import { createDeck } from '../../shared/pstn2-player.js';

const ALICE = '07700 900123';
const BOB = '0113 496 0456';
const SIG = 'kV6QbUqP3vD0aXk2…';
const RAIL = ['Dial', 'Discover', 'Verify', 'Encrypt', 'Media path', 'Caller ID', 'Answer'];

/** Centre a row of created elements horizontally using their measured widths. */
function row(els, { y, gap = 28, x0 = 0, w = 1728 }) {
    const widths = els.map((e) => e.offsetWidth);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (els.length - 1);
    let x = x0 + (w - total) / 2;
    els.forEach((e, i) => { e.style.left = `${Math.round(x)}px`; e.style.top = `${y}px`; x += widths[i] + gap; });
}

/** Elapsed-time readout, bottom right. */
function clock(s, ms) {
    return s.el(`<span>Elapsed</span><b>${ms}</b>`, { x: 1328, y: 600, w: 400, cls: 'e2-clock', hidden: true, from: 'fade' });
}

/** Header-less path label for HTTP endpoints in message bubbles. */
function pathMsg(s, opts) {
    const m = s.msg(opts);
    m.querySelector('.p2-msg-h')?.classList.add('e2-path');
    return m;
}

/** The call stage used by scenes 2, 4, 5, 6 and 8: rail, Alice, Alpha, Bravo, Bob. */
function stage(s, { step = 0, show = true } = {}) {
    const rail = s.steps({ x: 0, y: 0, w: 1728, items: RAIL });
    rail.set(step);
    const alice = s.card({ x: 0, y: 110, w: 250, compact: true, title: 'Alice', sub: ALICE, iconName: 'smartphone', colour: 'blue' });
    const alpha = s.card({ x: 330, y: 110, w: 360, compact: true, title: 'Alpha Telecom', sub: 'Alice’s provider', iconName: 'building-2', colour: 'blue' });
    const bravo = s.card({ x: 1038, y: 110, w: 360, compact: true, title: 'Bravo Networks', sub: 'Bob’s provider', iconName: 'building-2', colour: 'green' });
    const bob = s.card({ x: 1478, y: 110, w: 250, compact: true, title: 'Bob', sub: BOB, iconName: 'phone', colour: 'green' });
    const all = [rail.el, alice, alpha, bravo, bob];
    if (show) s.reveal(all);
    return { rail, alice, alpha, bravo, bob, all };
}

const LINK = { from: 'r', to: 'l', width: 4 };

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        meet: {
            build(s) {
                s.alice = s.card({ x: 0, y: 30, w: 500, title: 'Alice', sub: `Mobile · ${ALICE}`, iconName: 'smartphone', colour: 'blue' });
                s.alpha = s.card({ x: 0, y: 270, w: 500, title: 'Alpha Telecom', sub: 'A large mobile carrier', iconName: 'building-2', colour: 'blue' });
                s.bob = s.card({ x: 1228, y: 30, w: 500, title: 'Bob', sub: `Fixed line · ${BOB}`, iconName: 'phone', colour: 'green' });
                s.bravo = s.card({ x: 1228, y: 270, w: 500, title: 'Bravo Networks', sub: 'Regional fixed-line provider', iconName: 'building-2', colour: 'green' });
                s.tagA = s.pill({ x: 0, y: 410, text: 'PSTN2 deployed', iconName: 'circle-check', colour: 'blue' });
                s.tagB = s.pill({ x: 1228, y: 410, text: 'PSTN2 deployed', iconName: 'circle-check', colour: 'green' });
                s.rail = s.steps({ x: 0, y: 560, w: 1728, items: RAIL });
            },
            cues: {
                a: async (s) => { await s.reveal(s.alice); await s.reveal(s.alpha); s.connect(s.alice, s.alpha, { from: 'b', to: 't', colour: 'blue', width: 3 }); },
                b: async (s) => { await s.reveal(s.bob); await s.reveal(s.bravo); s.connect(s.bob, s.bravo, { from: 'b', to: 't', colour: 'green', width: 3 }); },
                c: async (s) => {
                    const c = s.connect(s.alice, s.bob, { ...LINK, colour: 'slate', dashed: true, label: 'Alice calls Bob' });
                    await c.done;
                    s.reveal([s.tagA, s.tagB]);
                    s.connect(s.alpha, s.bravo, { ...LINK, colour: 'green', width: 4, label: 'PSTN2' });
                },
                d: async (s) => { await s.reveal(s.rail.el); for (let i = 0; i < RAIL.length; i += 1) { s.rail.set(i); await s.wait(420); } s.rail.set(-1); },
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        dial: {
            build(s) {
                s.n = stage(s, { step: 0, show: false });
                s.dialling = s.pill({ x: 0, y: 216, text: `Dialling ${BOB}`, iconName: 'phone-outgoing', colour: 'blue' });
                s.invite = s.msg({ x: 0, y: 310, w: 760, title: 'SIP INVITE · Alice → Alpha', colour: 'blue', iconName: 'send',
                    text: 'INVITE sip:+441134960456@alpha-telecom.example SIP/2.0\nFrom: <sip:+447700900123@alpha-telecom.example>\nTo: <sip:+441134960456@alpha-telecom.example>' });
                s.bg = s.pill({ x: 860, y: 340, text: 'PSTN2 steps begin, in the background', iconName: 'workflow', colour: 'green' });
                s.clock = clock(s, '50 ms');
            },
            cues: {
                a: (s) => {
                    s.reveal(s.n.all);
                    s.dim(s.n.bravo); s.dim(s.n.bob);
                    s.activate(s.n.alice);
                    s.reveal(s.dialling);
                },
                b: async (s) => {
                    const c = s.connect(s.n.alice, s.n.alpha, { ...LINK, colour: 'blue' });
                    await c.done;
                    s.reveal(s.invite);
                    await s.packet(c, { colour: 'blue', label: 'INVITE', duration: 1200 });
                    s.activate(s.n.alice, false); s.activate(s.n.alpha);
                },
                c: (s) => s.reveal(s.clock),
                d: (s) => { s.n.rail.set(1); s.reveal(s.bg); },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        discover: {
            build(s) {
                s.rail = s.steps({ x: 0, y: 0, w: 1728, items: RAIL });
                s.rail.set(1);
                s.alpha = s.card({ x: 0, y: 110, w: 460, compact: true, title: 'Alpha Telecom', sub: `Looking up ${BOB}`, iconName: 'building-2', colour: 'blue', body: '<div class="e2-section">Cache</div>' });
                s.cache = s.table(s.alpha, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'h', label: 'Held by' }], colour: 'blue' });
                s.cache.add({ n: '—', h: 'no entry yet' }, { cls: 'e2-empty' });
                s.list = s.card({ x: 0, y: 350, w: 460, compact: true, title: 'Ofcom numbering list', sub: 'Alpha’s local copy · S1–S9', iconName: 'file-text', colour: 'gold', body: ' ' });
                s.listT = s.table(s.list, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }], colour: 'gold' });
                [['020 7946 0xxx', 'Alpha Telecom'], ['0161 496 0xxx', 'Bravo Networks'], ['0113 496 0xxx', 'Charlie Comms']].forEach(([b, r]) => s.listT.add({ b, r }));
                s.charlie = s.card({ x: 1288, y: 110, w: 440, compact: true, title: 'Charlie Comms', sub: 'Range Holder · 0113 496 0xxx', iconName: 'building-2', colour: 'amber' });
                s.bravo = s.card({ x: 1288, y: 400, w: 440, compact: true, title: 'Bravo Networks', sub: 'Serves Bob · ported in', iconName: 'building-2', colour: 'green' });
                s.url = s.pill({ x: 540, y: 470, text: 'pstn2.charlie-comms.example', iconName: 'link', colour: 'gold' });
                s.redir = s.msg({ x: 540, y: 200, w: 680, expand: true, title: 'Answer · Charlie → Alpha', colour: 'amber', iconName: 'forward',
                    json: { result: 'redirect', number: '+441134960456', portedTo: { cpName: 'Bravo Networks', url: 'https://pstn2.bravo-networks.example' } } });
                s.held = s.msg({ x: 540, y: 200, w: 680, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { result: 'held', number: '+441134960456', holder: { cpName: 'Bravo Networks' }, ported: true, cache: { ttl: 86400 }, signature: SIG } });
                s.clock = clock(s, '~100 ms');
            },
            cues: {
                a: async (s) => {
                    s.reveal([s.rail.el, s.alpha]);
                    await s.wait(900);
                    s.cache.highlight(0, 'red');
                },
                b: async (s) => {
                    s.cache.clearHighlight();
                    await s.reveal(s.list);
                    s.listT.highlight(2, 'gold');
                    await s.wait(700);
                    s.reveal(s.url);
                },
                c: async (s) => {
                    s.hide(s.url);
                    await s.reveal(s.charlie);
                    s.activate(s.charlie);
                    s.c1 = s.connect({ x: 460, y: s.anchor(s.charlie, 'l').y }, s.charlie, { ...LINK, colour: 'blue' });
                    await s.c1.done;
                    await s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1100 });
                    await s.packet(s.c1, { colour: 'amber', label: 'redirect', duration: 1100, reverse: true });
                    s.reveal(s.redir);
                },
                d: async (s) => {
                    s.activate(s.charlie, false); s.dim(s.charlie);
                    if (s.c1) s.c1.fade();
                    await s.reveal(s.bravo);
                    s.activate(s.bravo);
                    s.c2 = s.connect({ x: 460, y: s.anchor(s.bravo, 'l').y }, s.bravo, { ...LINK, colour: 'blue' });
                    await s.c2.done;
                    s.hide(s.redir);
                    await s.packet(s.c2, { colour: 'blue', label: 'GET', duration: 1000 });
                    await s.packet(s.c2, { colour: 'green', label: 'held', duration: 1000, reverse: true });
                    s.reveal(s.held);
                    s.cache.remove(0);
                    s.cache.add({ n: BOB, h: 'Bravo Networks' }, { flash: true });
                    s.cache.highlight(0, 'green');
                },
                e: (s) => { s.reveal(s.clock); s.rail.set(2); },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        verify: {
            build(s) {
                s.n = stage(s, { step: 2 });
                s.req = s.msg({ x: 120, y: 300, w: 680, title: 'Routing request · Alpha → Bravo', colour: 'blue', iconName: 'send',
                    json: { callerID: '+447700900123', destinationNumber: '+441134960456', callReference: '9b2f8c44-…', signature: SIG } });
                s.found = s.pill({ x: 1038, y: 214, text: `${ALICE} → Alpha`, iconName: 'search', colour: 'green' });
                s.ask = pathMsg(s, { x: 928, y: 300, w: 680, title: 'POST /pstn2/v1/auth/verify', colour: 'green', iconName: 'circle-help',
                    json: { requestingCP: 'CP1-UK-0102', callerID: '+447700900123', calledID: '+441134960456', callReference: '0d1f2a3b-…' } });
                s.ans = s.msg({ x: 120, y: 300, w: 680, title: 'Answer · Alpha → Bravo', colour: 'blue', iconName: 'badge-check',
                    json: { verified: true, trustLevel: 'verified', callReference: '0d1f2a3b-…', signature: SIG } });
                s.genuine = s.pill({ x: 0, y: 560, text: 'Genuine, not spoofed', iconName: 'shield-check', colour: 'green' });
                s.clock = clock(s, '150 ms');
            },
            cues: {
                a: async (s) => {
                    s.activate(s.n.alpha);
                    s.c = s.connect(s.n.alpha, s.n.bravo, { ...LINK, colour: 'blue' });
                    await s.c.done;
                    s.reveal(s.req);
                    await s.packet(s.c, { colour: 'blue', label: 'call request', duration: 1300 });
                },
                b: async (s) => {
                    s.activate(s.n.alpha, false); s.activate(s.n.bravo);
                    s.reveal(s.found);
                    await s.wait(1400);
                    s.reveal(s.ask);
                    if (s.c) await s.packet(s.c, { colour: 'green', label: 'verify?', duration: 1300, reverse: true });
                },
                c: async (s) => {
                    s.activate(s.n.bravo, false); s.activate(s.n.alpha);
                    s.hide(s.req);
                    if (s.c) await s.packet(s.c, { colour: 'blue', label: 'verified', duration: 1200 });
                    s.reveal(s.ans);
                },
                d: (s) => { s.activate(s.n.alpha, false); row([s.genuine], { y: 610 - 50 }); s.reveal([s.genuine, s.clock]); s.ring(s.genuine, { colour: 'green', size: 180 }); },
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        encrypt: {
            build(s) {
                s.n = stage(s, { step: 3 });
                s.kA = s.pill({ x: 330, y: 214, text: 'Ed25519 identity key', iconName: 'key-round', colour: 'blue' });
                s.kB = s.pill({ x: 1038, y: 214, text: 'Ed25519 identity key', iconName: 'key-round', colour: 'green' });
                s.agree = s.msg({ x: 524, y: 290, w: 680, title: 'Agreed in the routing exchange', colour: 'violet', iconName: 'handshake',
                    json: { agreedCapabilities: { encryption: ['srtp-aes256'] }, publicKey: 'base64-ed25519…' } });
                s.session = s.pill({ x: 0, y: 486, text: 'DTLS 1.3 · fresh keys for this call only', iconName: 'lock-keyhole', colour: 'violet' });
                s.e2e = s.pill({ x: 0, y: 574, text: 'SRTP · encrypted end to end', iconName: 'lock', colour: 'green' });
                s.clock = clock(s, '250 ms');
            },
            cues: {
                a: (s) => { s.reveal([s.kA, s.kB]); s.activate(s.n.alpha); s.activate(s.n.bravo); },
                b: (s) => s.reveal(s.agree),
                c: async (s) => {
                    row([s.session], { y: 486 });
                    s.activate(s.n.alpha, false); s.activate(s.n.bravo, false);
                    const c = s.connect(s.n.alpha, s.n.bravo, { ...LINK, colour: 'violet', dashed: true });
                    await c.done;
                    await s.packet(c, { colour: 'violet', label: 'DTLS', duration: 900 });
                    await s.packet(c, { colour: 'violet', label: 'DTLS', duration: 900, reverse: true });
                    s.reveal(s.session);
                },
                d: (s) => { row([s.e2e], { y: 574 }); s.reveal([s.e2e, s.clock]); },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        media: {
            build(s) {
                s.n = stage(s, { step: 4 });
                s.ans = s.msg({ x: 584, y: 222, w: 560, expand: true, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'route',
                    json: { accepted: true, connectionDetails: { fqdn: 'media.bravo-networks.example', ipv4: '203.0.113.42', port: 5060, protocol: 'udp' } } });
                s.transit = [380, 790, 1200].map((x, i) => s.pill({ x, y: 540, text: `Transit ${i + 1}`, iconName: 'router', colour: 'slate' }));
                s.opus = s.pill({ x: 0, y: 214, text: 'Codec: Opus', iconName: 'audio-lines', colour: 'green' });
                s.ringing = s.pill({ x: 1478, y: 214, text: 'Ringing', iconName: 'phone-incoming', colour: 'green' });
                s.clock = clock(s, '400 ms');
            },
            cues: {
                a: async (s) => {
                    s.activate(s.n.bravo);
                    await s.reveal(s.ans);
                },
                b: async (s) => {
                    s.activate(s.n.bravo, false);
                    await s.reveal(s.transit);
                    const pts = [s.n.alpha, ...s.transit, s.n.bravo];
                    s.old = pts.slice(1).map((p, i) => s.connect(pts[i], p, { from: i === 0 ? 'b' : 'r', to: i === pts.length - 2 ? 'b' : 'l', colour: 'slate', dashed: true, width: 3, arrow: false }));
                    await s.wait(900);
                    s.transit.forEach((t) => { t.classList.add('e2-struck'); s.dim(t); });
                    s.old.forEach((c) => c.g.attr('opacity', 0.25));
                    const d = s.connect(s.n.alpha, s.n.bravo, { ...LINK, colour: 'green', width: 6, label: 'direct' });
                    await d.done;
                    s.packet(d, { colour: 'green', duration: 900 });
                },
                c: (s) => s.reveal(s.opus),
                d: (s) => { s.reveal([s.clock, s.ringing]); s.activate(s.n.bob); s.ring(s.n.bob, { colour: 'green', size: 220 }); },
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        brand: {
            build(s) {
                s.rail = s.steps({ x: 0, y: 0, w: 1728, items: RAIL });
                s.rail.set(5);
                s.alpha = s.card({ x: 0, y: 120, w: 400, compact: true, title: 'Alpha Telecom', sub: 'Knows its customer', iconName: 'building-2', colour: 'blue' });
                s.bravo = s.card({ x: 0, y: 520, w: 400, compact: true, title: 'Bravo Networks', sub: 'Shows it to Bob', iconName: 'building-2', colour: 'green' });
                s.ans = s.msg({ x: 460, y: 120, w: 700, title: 'Verification answer · Alpha → Bravo', colour: 'blue', iconName: 'badge-check',
                    json: { verified: true, callerName: 'Alice', trustLevel: 'verified', branding: { displayName: 'Alice', logo: '(optional)' } } });
                s.p1 = s.pill({ x: 460, y: 390, text: 'Display name, verified by Alpha', iconName: 'user-check', colour: 'blue' });
                s.p2 = s.pill({ x: 460, y: 470, text: 'Optional business logo', iconName: 'id-card', colour: 'blue' });
                s.phone = s.el(`
                    <div class="e2-ph-top">Incoming call</div>
                    <div class="e2-ph-avatar">A</div>
                    <div class="e2-ph-name">Alice</div>
                    <div class="e2-ph-badge">${s.icon('shield-check', { size: 22 })}Verified by Alpha Telecom</div>
                    <div class="e2-ph-num">${ALICE}</div>
                    <div class="e2-ph-btns"><span class="e2-no">${s.icon('phone-off', { size: 30 })}</span><span class="e2-yes">${s.icon('phone', { size: 30 })}</span></div>`,
                { x: 1300, y: 112, w: 360, h: 548, cls: 'e2-phone', hidden: true, from: 'scale' });
            },
            cues: {
                a: async (s) => {
                    s.reveal([s.rail.el, s.alpha]);
                    await s.wait(300);
                    s.reveal(s.ans);
                },
                b: (s) => s.reveal([s.p1, s.p2]),
                c: async (s) => {
                    await s.reveal(s.bravo);
                    const c1 = s.connect(s.alpha, s.bravo, { from: 'b', to: 't', colour: 'blue', width: 4 });
                    await c1.done;
                    await s.packet(c1, { colour: 'blue', duration: 900 });
                    await s.reveal(s.phone);
                    s.connect(s.bravo, { x: 1300, y: s.anchor(s.bravo, 'r').y }, { from: 'r', to: 'l', colour: 'green', width: 4 });
                    s.ring(s.phone, { colour: 'green', size: 300 });
                },
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        answer: {
            build(s) {
                s.n = stage(s, { step: 6 });
                s.answered = s.pill({ x: 1478, y: 214, text: 'Answered', iconName: 'phone-call', colour: 'green' });
                s.priv = s.pill({ x: 0, y: 300, text: 'Private: SRTP encryption', iconName: 'lock', colour: 'violet' });
                s.clear = s.pill({ x: 0, y: 300, text: 'Clear: the direct path', iconName: 'route', colour: 'green' });
                s.setup = s.stat({ x: 220, y: 400, w: 600, value: '< 0.5 s', label: 'call setup', colour: 'green' });
                s.total = s.stat({ x: 908, y: 400, w: 600, value: '3.2 s', label: 'from dialling to talking, with ringing', colour: 'white' });
            },
            cues: {
                a: (s) => { s.activate(s.n.bob); s.reveal(s.answered); },
                b: async (s) => {
                    s.activate(s.n.bob, false);
                    const legs = [[s.n.alice, s.n.alpha], [s.n.alpha, s.n.bravo], [s.n.bravo, s.n.bob]].map(([a, b]) => s.connect(a, b, { ...LINK, colour: 'green', width: 6, arrow: false }));
                    await legs[1].done;
                    for (let k = 0; k < 3; k += 1) {
                        for (const l of legs) s.packet(l, { colour: 'green', duration: 700 });
                        await s.wait(800);
                    }
                },
                c: (s) => { row([s.priv, s.clear], { y: 300, gap: 40 }); s.reveal([s.priv, s.clear]); },
                d: (s) => { s.n.rail.done(); s.reveal([s.setup, s.total]); },
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        quality: {
            build(s) {
                const bars = Array.from({ length: 64 }, (_, i) => `<i style="--d:${(i * 0.37) % 1.3}s;--h:${30 + Math.round(60 * Math.abs(Math.sin(i * 0.7)))}%"></i>`).join('');
                s.wave = s.el(`<div class="e2-wave-bars">${bars}</div><div class="e2-wave-label">HD audio</div>`, { x: 0, y: 0, w: 1728, h: 200, cls: 'e2-wave', hidden: true, from: 'fade' });
                const tile = (x, iconName, big, title, sub, colour) => s.card({ x, y: 250, w: 540, h: 260, title, sub, iconName, colour, body: `<div class="e2-big" style="color:var(--c)">${big}</div>` });
                s.t1 = tile(0, 'audio-lines', 'Opus', 'Codec', 'Natural, wideband voice', 'green');
                s.t2 = tile(594, 'timer', '~40 ms', 'Latency', 'Low, on the direct path', 'blue');
                s.t3 = tile(1188, 'route', 'Fewer hops', 'Path', 'Less jitter and packet loss', 'violet');
                s.sum = s.statement({ x: 0, y: 570, w: 1728, size: 50, cls: 'e2-center', html: 'The conversation is <em>crystal clear.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.wave),
                b: (s) => s.reveal(s.t1),
                c: (s) => s.reveal(s.t2),
                d: async (s) => { await s.reveal(s.t3); s.reveal(s.sum); },
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        emergency: {
            build(s) {
                s.alice = s.card({ x: 0, y: 40, w: 400, title: 'Alice', sub: ALICE, iconName: 'smartphone', colour: 'blue', body: '<div class="e2-999"><span>Dials</span><b>999</b></div>' });
                s.alpha = s.card({ x: 664, y: 40, w: 400, title: 'Alpha Telecom', sub: 'Alice’s provider', iconName: 'building-2', colour: 'blue', body: `<div class="e2-recog">${s.tag('Emergency number recognised', 'red')}</div>` });
                s.ecc = s.card({ x: 1328, y: 40, w: 400, title: 'Emergency centre', sub: 'PSAP · answers 999', iconName: 'headphones', colour: 'red' });
                                s.src = [['GPS', 'satellite'], ['Serving cell', 'radio-tower'], ['Nearby Wi-Fi', 'wifi']].map(([t, i], k) => s.pill({ x: 0, y: 290 + k * 84, text: t, iconName: i, colour: 'blue' }));
                s.loc = s.msg({ x: 1000, y: 290, w: 728, expand: true, title: 'Answer · Alpha → emergency centre', colour: 'green', iconName: 'map-pin',
                    json: { location: { latitude: 51.5125, longitude: -0.0841, accuracy: 12, source: 'gps' }, timestamp: '2026-10-06T09:41:07.050Z' } });
                s.batch = s.pill({ x: 0, y: 590, text: 'Yesterday’s batch file', iconName: 'ban', colour: 'red' });
                s.now = s.pill({ x: 420, y: 590, text: 'Right now', iconName: 'zap', colour: 'green' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.alice);
                    s.ring(s.alice, { colour: 'red', size: 220 });
                    await s.reveal(s.alpha);
                    const c = s.connect({ x: 400, y: s.anchor(s.alpha, 'l').y }, s.alpha, { ...LINK, colour: 'red' });
                    await c.done;
                    await s.packet(c, { colour: 'red', label: '999', duration: 900 });
                    s.alpha.querySelector('.e2-recog').classList.add('e2-on'); s.activate(s.alpha);
                },
                b: async (s) => {
                    await s.reveal(s.src);
                    s.src.forEach((p, k) => s.connect(p, s.alpha, { from: 'r', to: 'b', colour: 'blue', width: 3, toOpts: { dx: -120 + k * 60 } }));
                },
                c: async (s) => {
                    s.activate(s.alpha, false);
                    await s.reveal(s.ecc);
                    s.activate(s.ecc);
                    const c = s.connect({ x: 1328, y: s.anchor(s.alpha, 'r').y }, s.alpha, { from: 'l', to: 'r', colour: 'red', width: 4 });
                    await c.done;
                    await s.packet(c, { colour: 'red', label: 'location?', duration: 1000 });
                    await s.packet(c, { colour: 'green', label: 'location', duration: 1000, reverse: true });
                    s.reveal(s.loc);
                },
                d: async (s) => { await s.reveal(s.batch); s.batch.classList.add('e2-struck'); s.dim(s.batch); s.reveal(s.now); },
            },
        },

        // 11 ────────────────────────────────────────────────────────────
        learn: {
            build(s) {
                s.alpha = s.card({ x: 0, y: 30, w: 560, compact: true, title: 'Alpha Telecom', sub: 'Its cache', iconName: 'building-2', colour: 'blue', body: ' ' });
                s.cache = s.table(s.alpha, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'h', label: 'Held by' }, { key: 't', label: 'Expires' }], colour: 'blue' });
                s.cache.add({ n: '0161 496 0500', h: 'Bravo Networks', t: '6 h' });
                s.bravo = s.card({ x: 1268, y: 30, w: 460, compact: true, title: 'Bravo Networks', sub: 'Serves Bob', iconName: 'building-2', colour: 'green' });
                s.skip1 = s.pill({ x: 640, y: 200, text: 'Ofcom list · skipped', iconName: 'file-text', colour: 'slate' });
                s.skip2 = s.pill({ x: 640, y: 276, text: 'Range Holder · skipped', iconName: 'building-2', colour: 'slate' });
                s.inv = s.msg({ x: 640, y: 360, w: 640, title: 'If Bob moves again · Bravo → Alpha', colour: 'red', iconName: 'refresh-cw',
                    json: { result: 'not_held', number: '+441134960456', cache: { invalidate: true, scope: 'number' } } });
                s.again = s.pill({ x: 1300, y: 420, text: 'Discover again', iconName: 'rotate-ccw', colour: 'amber' });
                s.sum = s.statement({ x: 0, y: 380, w: 580, size: 48, html: 'The network learns,<br><em>call by call.</em>' });
            },
            cues: {
                a: (s) => { s.reveal(s.alpha); s.activate(s.alpha); s.wait(600).then(() => { s.cache.add({ n: BOB, h: 'Bravo Networks', t: '24 h' }, { flash: true }); s.cache.highlight(1, 'green'); }); },
                b: async (s) => {
                    s.activate(s.alpha, false);
                    await s.reveal([s.skip1, s.skip2]);
                    [s.skip1, s.skip2].forEach((p) => { p.classList.add('e2-struck'); s.dim(p); });
                    await s.reveal(s.bravo);
                    const c = s.connect({ x: 560, y: s.anchor(s.bravo, 'l').y }, s.bravo, { ...LINK, colour: 'green', label: '1 query' });
                    await c.done;
                    await s.packet(c, { colour: 'green', label: 'GET', duration: 1000 });
                    s.packet(c, { colour: 'green', label: 'held', duration: 1000, reverse: true });
                },
                c: async (s) => { await s.reveal(s.inv); await s.wait(1500); s.reveal(s.again); },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 12 ────────────────────────────────────────────────────────────
        compare: {
            build(s) {
                const col = (x, title, sub, iconName, colour) => s.card({ x, y: 0, w: 840, h: 580, title, sub, iconName, colour });
                s.old = col(0, 'Today’s PSTN', 'What every call gets now', 'phone', 'red');
                s.nw = col(888, 'PSTN2', 'What participating calls get', 'shield-check', 'green');
                const L = [['Caller ID can’t be trusted', 'Verified caller'], ['Several transit hops', 'Direct connection'], ['No encryption', 'Encrypted end to end'],
                    ['Basic voice quality', 'HD voice'], ['Emergency location a day old', 'Real-time location'], ['Setup in 5–8 seconds', 'Setup in under 1 second']];
                s.lo = s.bullets({ x: 30, y: 140, w: 780, gap: 14, items: L.map(([a]) => ({ icon: 'x', colour: 'red', text: a })) });
                s.ln = s.bullets({ x: 918, y: 140, w: 780, gap: 14, items: L.map(([, b]) => ({ icon: 'check', colour: 'green', text: b })) });
                s.lo.el.classList.add('e2-cmp'); s.ln.el.classList.add('e2-cmp');
            },
            cues: {
                a: async (s) => { await s.reveal([s.old, s.nw]); s.reveal(s.lo.items[0]); await s.wait(1500); s.reveal(s.ln.items[0]); },
                b: async (s) => { s.reveal(s.lo.items.slice(1, 3)); await s.wait(1800); s.reveal(s.ln.items.slice(1, 3)); },
                c: async (s) => { s.reveal(s.lo.items.slice(3, 5)); await s.wait(2200); s.reveal(s.ln.items.slice(3, 5)); },
                d: async (s) => { s.reveal(s.lo.items[5]); await s.wait(900); s.reveal(s.ln.items[5]); s.activate(s.nw); },
            },
        },

        // 13 ────────────────────────────────────────────────────────────
        cost: {
            build(s) {
                const side = (x, title, sub, iconName, colour, value, label, pct) => {
                    const c = s.card({ x, y: 0, w: 840, h: 380, title, sub, iconName, colour });
                    const st = s.stat({ x: x + 40, y: 140, w: 760, value, label, colour });
                    const bar = s.el('<i></i>', { x: x + 40, y: 320, w: 760, h: 24, cls: 'e2-bar', colour, style: `--w:${pct}%`, hidden: true, from: 'fade' });
                    return { c, st, bar };
                };
                s.tr = side(0, 'Traditional call', 'Transit fees along the way', 'phone', 'red', '~5p', 'a minute', 100);
                s.p2 = side(888, 'PSTN2 direct routing', 'Straight to the other provider', 'route', 'green', '<1p', 'a minute', 20);
                s.sum = s.statement({ x: 0, y: 420, w: 1728, size: 52, cls: 'e2-center', html: 'Millions of calls. <em>Millions of pounds.</em>' });
                s.d1 = s.pill({ x: 0, y: 540, text: 'Lower prices for customers', iconName: 'pound-sterling', colour: 'green' });
                s.d2 = s.pill({ x: 0, y: 540, text: 'Investment in better networks', iconName: 'trending-up', colour: 'blue' });
                s.note = s.el(s.tag('Illustrative figures', 'slate'), { x: 0, y: 616, hidden: true, from: 'fade' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.tr.c); s.reveal([s.tr.st, s.tr.bar, s.note]); s.tr.bar.classList.add('e2-on'); },
                b: async (s) => { await s.reveal(s.p2.c); s.reveal([s.p2.st, s.p2.bar]); s.p2.bar.classList.add('e2-on'); s.activate(s.p2.c); },
                c: (s) => s.reveal(s.sum),
                d: (s) => { row([s.d1, s.d2], { y: 540, gap: 40 }); s.reveal([s.d1, s.d2]); },
            },
        },

        // 14 ────────────────────────────────────────────────────────────
        experience: {
            build(s) {
                s.alice = s.card({ x: 0, y: 40, w: 460, title: 'Alice', sub: 'Dials', iconName: 'smartphone', colour: 'blue' });
                s.bob = s.card({ x: 1268, y: 40, w: 460, title: 'Bob', sub: 'Answers', iconName: 'phone', colour: 'green' });
                s.hidden = s.pill({ x: 0, y: 220, text: 'Discovery · verification · keys · routing: all invisible', iconName: 'eye-off', colour: 'slate' });
                s.ben = [
                    s.pill({ x: 0, y: 360, text: 'Clearer audio', iconName: 'audio-lines', colour: 'green' }),
                    s.pill({ x: 0, y: 360, text: 'Faster setup', iconName: 'zap', colour: 'green' }),
                    s.pill({ x: 0, y: 360, text: 'More trust', iconName: 'shield-check', colour: 'green' }),
                    s.pill({ x: 0, y: 360, text: 'Better privacy', iconName: 'lock', colour: 'green' }),
                ];
                s.sum = s.statement({ x: 0, y: 490, w: 1728, size: 54, cls: 'e2-center', html: 'Better technology. <em>A seamless experience.</em>' });
            },
            cues: {
                a: (s) => { row([s.hidden], { y: 220 }); s.reveal(s.hidden); },
                b: async (s) => {
                    await s.reveal(s.alice);
                    await s.wait(500);
                    await s.reveal(s.bob);
                    const c = s.connect(s.alice, s.bob, { ...LINK, colour: 'green', width: 5, label: 'They talk' });
                    await c.done;
                    s.packet(c, { colour: 'blue', duration: 1000 });
                    s.packet(c, { colour: 'green', duration: 1000, reverse: true });
                },
                c: (s) => { row(s.ben, { y: 360, gap: 30 }); s.reveal(s.ben); },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 15 ────────────────────────────────────────────────────────────
        vision: {
            build(s) {
                s.hub = s.el(`<div><b>PSTN2</b><span>v1.1</span></div>`, { x: 754, y: 130, w: 220, h: 220, cls: 'e2-hub', hidden: true, from: 'scale' });
                const caps = [['Number discovery', 'search', 'blue'], ['Caller verification', 'shield-check', 'green'], ['Direct routing', 'route', 'cyan'],
                    ['Encryption', 'lock', 'violet'], ['Branding', 'id-card', 'gold'], ['Emergency location', 'siren', 'red']];
                const pos = [[300, 40], [1100, 40], [120, 215], [1290, 215], [300, 390], [1100, 390]];
                s.caps = caps.map(([t, i, c], k) => s.pill({ x: pos[k][0], y: pos[k][1], text: t, iconName: i, colour: c }));
                s.one = s.pill({ x: 0, y: 490, text: 'One integrated set, not add-ons', iconName: 'puzzle', colour: 'green' });
                s.sum = s.statement({ x: 0, y: 585, w: 1728, size: 44, cls: 'e2-center', html: 'Buildable today, at the edge. <em>No central database.</em>' });
            },
            cues: {
                a: (s) => { s.reveal(s.hub); s.ring(s.hub, { colour: 'green', size: 280 }); },
                b: async (s) => {
                    for (const p of s.caps) {
                        await s.reveal(p);
                        s.connect(p, s.hub, { from: p.offsetLeft < 754 ? 'r' : 'l', to: 'c', colour: 'slate', width: 3, arrow: false, opacity: 0.6, duration: 500 });
                        await s.wait(250);
                    }
                },
                c: (s) => { row([s.one], { y: 490 }); s.reveal(s.one); s.caps.forEach((p) => p.classList.add('e2-lit')); s.hub.classList.add('e2-lit'); },
                d: (s) => s.reveal(s.sum),
            },
        },
    },
});
