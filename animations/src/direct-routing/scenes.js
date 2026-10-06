// Direct Routing — PSTN2 v1.1 (SPECIFICATION.md §6, §7, §9)
// Number discovery finds the destination's provider; a signed routing request returns
// the address for a direct SIP INVITE; DTLS-SRTP protects the media.
// Numbers are from Ofcom's reserved TV/drama ranges; providers are fictional.
import { createDeck } from '../../shared/pstn2-player.js';

const SIG = 'kV6QbUqP3vD0aXk2…';
const CALLS = '<div class="dr-label">Customer dials</div><div class="dr-num" style="font-size:28px">0113 496 0456</div>';
const SERVES = '<div class="dr-label">Customer</div><div class="dr-num" style="font-size:28px">0113 496 0456</div>';
const STEPS = ['Check the cache', 'Numbering list', 'Ask the Range Holder', 'Follow the redirect', 'Cache &amp; route'];

function node(s, { x, y, iconName, name, colour, cls = 'dr-node', hidden = true }) {
    return s.el(`<div>${s.icon(iconName, { size: 36 })}<div>${name}</div></div>`, { x, y, cls, colour, hidden, from: 'scale' });
}
const cpCard = (s, key, x, y, w = 340, h = 200, sub = '', body = '') => {
    const c = { alpha: ['Alpha Telecom', 'blue'], bravo: ['Bravo Networks', 'green'], charlie: ['Charlie Comms', 'amber'] }[key];
    return s.card({ x, y, w, h, title: c[0], sub, iconName: 'building-2', colour: c[1], compact: true, body });
};

const big = (el, px = 24) => { el.style.fontSize = `${px}px`; return el; };

/** A ring of n provider dots with every pair joined (drawn into the scene SVG). */
function mesh(s, { cx, cy, r, n, dot, colour }) {
    const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
    const g = s.svg.append('g').attr('class', 'dr-mesh').attr('opacity', 0);
    const lines = g.append('g').attr('opacity', 0);
    for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
            lines.append('line').attr('x1', pts[i][0]).attr('y1', pts[i][1]).attr('x2', pts[j][0]).attr('y2', pts[j][1])
                .attr('stroke', s.colour(colour)).attr('stroke-width', n > 20 ? 0.6 : 2.5).attr('opacity', n > 20 ? 0.12 : 0.75);
        }
    }
    const dots = g.append('g');
    pts.forEach(([x, y]) => dots.append('circle').attr('cx', x).attr('cy', y).attr('r', dot).attr('fill', '#0d1b38').attr('stroke', s.colour(colour)).attr('stroke-width', n > 20 ? 2 : 3));
    const fade = (sel, ms) => (s.capture ? sel.attr('opacity', 1) : sel.transition().duration(s.t(ms)).attr('opacity', 1));
    return { showDots: () => fade(g, 700), showLines: () => fade(lines, 1600) };
}

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        transit: {
            build(s) {
                s.alpha = cpCard(s, 'alpha', 0, 150, 340, 180, 'Caller’s provider', CALLS);
                s.bravo = cpCard(s, 'bravo', 1388, 150, 340, 180, 'Called provider', SERVES);
                s.tr = [480, 794, 1108].map((x) => {
                    const n = node(s, { x, y: 170, iconName: 'network', name: 'Transit', colour: 'slate' });
                    n.insertAdjacentHTML('beforeend', `<span class="dr-badge">${s.icon('pound-sterling', { size: 24 })}</span>`);
                    return n;
                });
                s.costs = [
                    s.pill({ x: 214, y: 400, text: 'Cost per hop', iconName: 'pound-sterling', colour: 'amber' }),
                    s.pill({ x: 644, y: 400, text: 'Delay per hop', iconName: 'timer', colour: 'amber' }),
                    s.pill({ x: 1074, y: 400, text: 'Another point of failure', iconName: 'triangle-alert', colour: 'red' }),
                ];
                s.sum = s.statement({ x: 0, y: 530, w: 1728, size: 56, cls: 'dr-center', html: 'Slower, and <em>more expensive.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.alpha, ...s.tr, s.bravo]);
                    const chain = [s.alpha, ...s.tr, s.bravo];
                    s.links = [];
                    for (let i = 0; i < chain.length - 1; i += 1) {
                        const c = s.connect(chain[i], chain[i + 1], { from: 'r', to: 'l', colour: 'slate' });
                        s.links.push(c);
                        await c.done;
                        await s.packet(c, { colour: 'blue', duration: 500 });
                    }
                },
                b: async (s) => {
                    for (const [i, n] of s.tr.entries()) { n.querySelector('.dr-badge').classList.add('dr-on'); await s.reveal(s.costs[i]); await s.wait(250); }
                },
                c: (s) => s.reveal(s.sum),
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        direct: {
            build(s) {
                s.alpha = cpCard(s, 'alpha', 0, 150, 340, 180, 'Caller’s provider', CALLS);
                s.bravo = cpCard(s, 'bravo', 1388, 150, 340, 180, 'Called provider', SERVES);
                s.tr = [480, 794, 1108].map((x) => node(s, { x, y: 170, iconName: 'network', name: 'Transit', colour: 'slate', hidden: false }));
                s.media = s.pill({ x: 690, y: 120, text: 'Direct media connection', iconName: 'audio-lines', colour: 'green' });
                s.no = [
                    s.pill({ x: 250, y: 420, text: 'No transit providers', iconName: 'ban', colour: 'green' }),
                    s.pill({ x: 690, y: 420, text: 'No extra hops', iconName: 'ban', colour: 'green' }),
                    s.pill({ x: 1060, y: 420, text: 'Source to destination', iconName: 'route', colour: 'green' }),
                ];
            },
            cues: {
                a: async (s) => {
                    s.reveal([s.alpha, s.bravo]);
                    s.tr.forEach((n) => s.dim(n));
                    await s.wait(900);
                    s.tr.forEach((n) => s.hide(n));
                },
                b: async (s) => {
                    s.c = s.connect(s.alpha, s.bravo, { from: 'r', to: 'l', colour: 'green', width: 6 });
                    await s.c.done;
                    s.reveal(s.media);
                    s.activate(s.alpha); s.activate(s.bravo);
                    await s.packet(s.c, { colour: 'green', duration: 1300 });
                    s.packet(s.c, { colour: 'green', duration: 1300, reverse: true });
                },
                c: (s) => s.reveal(s.no),
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        discovery: {
            build(s) {
                s.st = s.steps({ x: 0, y: 0, w: 1728, items: STEPS });
                s.alpha = s.card({ x: 0, y: 104, w: 540, h: 300, title: 'Alpha Telecom', sub: 'The caller’s provider', iconName: 'building-2', colour: 'blue', compact: true,
                    body: `<div class="dr-label">Dialled</div><div class="dr-num"></div><div class="dr-label" style="margin-top:10px">Cache</div>` });
                s.cache = s.table(s.alpha, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'h', label: 'Held by' }], colour: 'blue' });
                s.cache.add({ n: '—', h: 'no entry' }, { cls: 'dr-empty' });
                s.charlie = cpCard(s, 'charlie', 1188, 104, 540, 250, 'Range Holder · 0113 496 0xxx', ' ');
                s.cT = s.table(s.charlie, { columns: [{ key: 'n', label: 'Number database', num: true }, { key: 'st', label: 'Status' }], colour: 'amber' });
                s.cT.add({ n: '0113 496 0789', st: 'In service' });
                s.cT.add({ n: '0113 496 0456', st: 'Ported out → Bravo' });
                s.bravo = cpCard(s, 'bravo', 1188, 392, 540, 250, 'Holds the number today', ' ');
                s.bT = s.table(s.bravo, { columns: [{ key: 'n', label: 'Number database', num: true }, { key: 'st', label: 'Status' }], colour: 'green' });
                s.bT.add({ n: '0161 496 0123', st: 'In service' });
                s.bT.add({ n: '0113 496 0456', st: 'Ported in · from Charlie' });
                s.list = s.card({ x: 584, y: 104, w: 560, title: 'Ofcom numbering list', sub: 'Alpha’s local copy', iconName: 'file-text', colour: 'gold', compact: true, body: ' ' });
                s.lT = s.table(s.list, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }], colour: 'gold' });
                s.lT.add({ b: '0161 496 0', r: 'Bravo Networks' });
                s.lT.add({ b: '0113 496 0', r: 'Charlie Comms' });
                s.url = s.pill({ x: 604, y: 370, text: 'pstn2.charlie-comms.example', iconName: 'link', colour: 'gold' });
                s.redir = s.msg({ x: 574, y: 120, w: 584, expand: true, title: 'Answer · Charlie → Alpha', colour: 'amber', iconName: 'forward',
                    json: { result: 'redirect', portedTo: { cpName: 'Bravo Networks', url: 'https://pstn2.bravo-networks.example' } } });
                s.held = s.msg({ x: 584, y: 120, w: 560, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { result: 'held', holder: { cpName: 'Bravo Networks' }, ported: true, cache: { ttl: 86400 } } });
                s.req = s.msg({ x: 584, y: 96, w: 560, title: 'POST /pstn2/v1/routing/request', colour: 'blue', iconName: 'send',
                    json: { callerID: '+442079460100', destinationNumber: '+441134960456', publicKey: 'MCowBQYDK2Vw…', signature: SIG } });
                s.res = s.msg({ x: 584, y: 316, w: 560, expand: true, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { accepted: true, connectionDetails: { fqdn: 'media.bravo-networks.example', port: 5060 } } });
                s.invite = s.pill({ x: 0, y: 440, text: 'Direct SIP invite to Bravo', iconName: 'phone-forwarded', colour: 'green' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.st.el, s.alpha, s.charlie, s.bravo]);
                    s.dim(s.charlie); s.dim(s.bravo);
                    await s.wait(400);
                    s.type(s.alpha.querySelector('.dr-num'), '0113 496 0456', { cps: 14 });
                },
                b: async (s) => {
                    s.st.set(0); s.activate(s.alpha); s.cache.highlight(0, 'red');
                    await s.wait(1400);
                    s.activate(s.alpha, false); s.cache.clearHighlight();
                    s.st.set(1);
                    await s.reveal(s.list);
                    s.lT.highlight(1, 'gold');
                },
                c: async (s) => {
                    s.reveal(s.url);
                    await s.wait(1200);
                    s.hide(s.list); s.hide(s.url);
                    s.st.set(2); s.dim(s.charlie, false); s.activate(s.charlie);
                    s.c1 = s.connect(s.alpha, s.charlie, { from: 'r', to: 'l', colour: 'blue', fromOpts: { dy: -60 }, toOpts: { dy: -35 } });
                    await s.c1.done;
                    await s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1100 });
                    s.cT.highlight(1, 'amber');
                    await s.packet(s.c1, { colour: 'amber', label: 'redirect', duration: 1100, reverse: true });
                    s.reveal(s.redir);
                },
                d: async (s) => {
                    s.st.set(3); s.hide(s.redir); s.c1.fade();
                    s.activate(s.charlie, false); s.dim(s.charlie); s.dim(s.bravo, false); s.activate(s.bravo);
                    s.c2 = s.connect(s.alpha, s.bravo, { from: 'r', to: 'l', colour: 'blue', bend: 0.12, fromOpts: { dy: 100 }, toOpts: { dy: 0 } });
                    await s.c2.done;
                    await s.packet(s.c2, { colour: 'blue', label: 'GET', duration: 1100 });
                    s.bT.highlight(1, 'green');
                    await s.packet(s.c2, { colour: 'green', label: 'held', duration: 1100, reverse: true });
                    s.reveal(s.held);
                    s.st.set(4);
                    s.cache.remove(0);
                    s.cache.add({ n: '0113 496 0456', h: 'Bravo Networks' }, { flash: true });
                    s.cache.highlight(0, 'green');
                },
                e: async (s) => {
                    s.hide(s.held);
                    await s.reveal(s.req);
                    await s.packet(s.c2, { colour: 'blue', label: 'routing request', duration: 1200 });
                    await s.packet(s.c2, { colour: 'green', label: 'address + port', duration: 1200, reverse: true });
                    s.reveal(s.res);
                    await s.wait(500);
                    s.reveal(s.invite); s.st.done();
                },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        cost: {
            build(s) {
                const bar = (y, label, sub, pct, colour, text) => s.el(`<div class="dr-bar"><div class="dr-bl">${label}<small>${sub}</small></div><div class="dr-track"><div class="dr-fill" style="width:${pct}%;background:var(--${colour})">${text}</div></div></div>`, { x: 0, y, w: 1100, hidden: true });
                s.b1 = bar(60, 'Via transit', 'today', 100, 'amber', 'Transit fees on every minute');
                s.b2 = bar(190, 'Direct', 'with PSTN2', 25, 'green', '');
                s.stat = s.stat({ x: 1200, y: 50, w: 528, value: '0%', label: 'per-minute cost, at most', colour: 'green' });
                s.who = [
                    s.card({ x: 0, y: 400, w: 540, title: 'High-volume carriers', sub: 'Millions saved every year', iconName: 'building-2', colour: 'blue', compact: true }),
                    s.card({ x: 580, y: 400, w: 520, title: 'Consumers', sub: 'Lower prices', iconName: 'users', colour: 'cyan', compact: true }),
                ];
                s.first = s.pill({ x: 1200, y: 420, text: 'From the first direct call', iconName: 'zap', colour: 'green' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.b1); s.b1.querySelector('.dr-fill').classList.add('dr-on'); },
                b: async (s) => {
                    await s.reveal(s.b2);
                    s.b2.querySelector('.dr-fill').classList.add('dr-on');
                    await s.reveal(s.stat);
                    await s.countUp(s.stat, 75, { format: (v) => `−${Math.round(v)}%`, duration: 1400 });
                },
                c: (s) => s.reveal(s.who),
                d: (s) => s.reveal(s.first),
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        latency: {
            build(s) {
                const dot = (x, y, iconName, colour) => s.el(s.icon(iconName, { size: 30 }), { x, y, cls: 'dr-dot', colour, hidden: true, from: 'scale' });
                s.l1 = s.el('<div class="dr-row-label">Today<small>5 to 7 hops</small></div>', { x: 0, y: 46, w: 230, hidden: true, from: 'left' });
                const xs = [260, 480, 700, 920, 1140, 1360, 1580];
                s.r1 = xs.map((x, i) => dot(x, 40, i === 0 || i === xs.length - 1 ? 'building-2' : 'network', i === 0 ? 'blue' : i === xs.length - 1 ? 'green' : 'slate'));
                s.l2 = s.el('<div class="dr-row-label">PSTN2<small>1 hop</small></div>', { x: 0, y: 236, w: 230, hidden: true, from: 'left' });
                s.r2 = [dot(260, 230, 'building-2', 'blue'), dot(1580, 230, 'building-2', 'green')];
                s.stat = s.stat({ x: 0, y: 380, w: 700, value: '0%', label: 'latency, or better', colour: 'green' });
                s.q = [
                    s.pill({ x: 640, y: 440, text: 'Better call quality', iconName: 'audio-lines', colour: 'green' }),
                    s.pill({ x: 1000, y: 440, text: 'Live conversation', iconName: 'mic', colour: 'blue' }),
                    s.pill({ x: 1360, y: 440, text: 'Video calls', iconName: 'video', colour: 'violet' }),
                ];
            },
            cues: {
                a: async (s) => { await s.reveal(s.stat); await s.countUp(s.stat, 75, { format: (v) => `−${Math.round(v)}%`, duration: 1400 }); },
                b: async (s) => {
                    await s.reveal([s.l1, ...s.r1]);
                    const hops = s.r1.slice(0, -1).map((d, i) => s.connect(d, s.r1[i + 1], { from: 'r', to: 'l', colour: 'slate', width: 3, duration: 300 }));
                    await hops[0].done;
                    for (const h of hops) await s.packet(h, { colour: 'amber', duration: 260 });
                    await s.reveal([s.l2, ...s.r2]);
                    const c = s.connect(s.r2[0], s.r2[1], { from: 'r', to: 'l', colour: 'green', width: 5, label: 'one hop' });
                    await c.done;
                    await s.packet(c, { colour: 'green', duration: 700 });
                },
                c: (s) => s.reveal(s.q),
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        keys: {
            build(s) {
                s.alpha = cpCard(s, 'alpha', 0, 0, 420, null, 'Identity key · Ed25519');
                s.bravo = cpCard(s, 'bravo', 1308, 0, 420, null, 'Identity key · Ed25519');
                s.req = s.msg({ x: 480, y: 0, w: 768, title: 'Routing request · Alpha → Bravo', colour: 'blue', iconName: 'send',
                    json: { callReference: '9b2f8c44-1d3e-…', publicKey: 'alpha · MCowBQYDK2VwAyEA…', signature: SIG } });
                s.res = s.msg({ x: 480, y: 170, w: 768, title: 'Response · Bravo → Alpha', colour: 'green', iconName: 'circle-check',
                    json: { accepted: true, connectionDetails: { publicKey: 'bravo · MCowBQYDK2VwAyEA…' }, signature: 'Hq3xW9mLp2Tz…' } });
                s.e1 = s.pill({ x: 20, y: 250, text: 'Alpha media endpoint', iconName: 'server', colour: 'blue' });
                s.e2 = s.pill({ x: 1376, y: 250, text: 'Bravo media endpoint', iconName: 'server', colour: 'green' });
                s.hs = s.pill({ x: 650, y: 170, text: 'DTLS 1.3 handshake · X25519', iconName: 'handshake', colour: 'cyan' });
                s.k1 = s.pill({ x: 20, y: 340, text: 'Fresh SRTP keys', iconName: 'key-round', colour: 'gold' });
                s.k2 = s.pill({ x: 1440, y: 340, text: 'Fresh SRTP keys', iconName: 'key-round', colour: 'gold' });
                s.proof = s.pill({ x: 651, y: 330, text: 'Identity keys prove each side', iconName: 'fingerprint', colour: 'blue' });
                s.never = s.pill({ x: 690, y: 410, text: 'Media keys never sent', iconName: 'eye-off', colour: 'violet' });
                s.stream = s.el(`${s.icon('lock', { size: 34 })}<span>Voice and video · SRTP, encrypted end to end</span>`, { x: 0, y: 530, w: 1728, h: 96, cls: 'dr-tunnel', hidden: true, from: 'scale' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.alpha, s.bravo]);
                    await s.reveal(s.req);
                    await s.wait(1200);
                    await s.reveal(s.res);
                },
                b: async (s) => {
                    s.hide(s.req); s.hide(s.res);
                    await s.reveal([s.e1, s.e2]);
                    const h = s.connect(s.e1, s.e2, { from: 'r', to: 'l', colour: 'cyan', width: 3, dashed: true, arrow: false });
                    await h.done;
                    s.reveal(s.hs);
                    for (let i = 0; i < 3; i += 1) await s.packet(h, { colour: 'cyan', duration: 650, reverse: i % 2 === 1 });
                    s.reveal([s.k1, s.k2]);
                },
                c: (s) => s.reveal([s.proof, s.never]),
                d: (s) => { s.reveal(s.stream); s.activate(s.alpha); s.activate(s.bravo); },
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        media: {
            build(s) {
                s.alpha = cpCard(s, 'alpha', 0, 174, 380, null, 'Caller’s provider');
                s.bravo = cpCard(s, 'bravo', 1348, 174, 380, null, 'Called provider');
                s.tunnel = s.el(`${s.icon('lock', { size: 34 })}<span>SRTP · encrypted media</span>`, { x: 420, y: 168, w: 888, h: 96, cls: 'dr-tunnel', hidden: true, from: 'scale' });
                s.nobody = s.pill({ x: 640, y: 30, text: 'Nobody in the middle can listen', iconName: 'eye-off', colour: 'red' });
                s.notransit = s.pill({ x: 650, y: 300, text: 'No transit provider in the path', iconName: 'ban', colour: 'slate' });
                s.law = s.card({ x: 564, y: 400, w: 600, title: 'Lawful interception', sub: 'Through the providers, with legal authority', iconName: 'gavel', colour: 'gold', compact: true });
                s.sum = s.statement({ x: 0, y: 560, w: 1728, size: 48, cls: 'dr-center', html: 'Privacy by default, <em>not an optional extra.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.alpha, s.bravo]);
                    await s.reveal(s.tunnel);
                },
                b: (s) => s.reveal([s.nobody, s.notransit]),
                c: async (s) => {
                    await s.reveal(s.law);
                    s.connect(s.law, s.alpha, { from: 'l', to: 'b', colour: 'gold', dashed: true, arrow: false });
                    s.connect(s.law, s.bravo, { from: 'r', to: 'b', colour: 'gold', dashed: true, arrow: false });
                },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        quality: {
            build(s) {
                s.a = node(s, { x: 820, y: 10, iconName: 'building-2', name: 'Alpha', colour: 'blue' });
                s.b = node(s, { x: 1520, y: 10, iconName: 'building-2', name: 'Bravo', colour: 'green' });
                s.offer = big(s.msg({ x: 0, y: 10, w: 740, title: 'Routing request · mediaCapabilities', colour: 'blue', iconName: 'send',
                    json: { codecs: ['opus', 'g722', 'pcmu'], encryption: ['srtp-aes256'], video: true, maxBandwidth: 128000 } }), 22);
                s.agree = big(s.msg({ x: 0, y: 330, w: 740, title: 'Response · agreedCapabilities', colour: 'green', iconName: 'circle-check',
                    json: { codecs: ['opus'], encryption: ['srtp-aes256'], video: true } }), 22);
                s.list = s.bullets({ x: 820, y: 230, w: 908, gap: 18, items: [
                    { icon: 'ban', colour: 'red', text: 'No lowest common denominator', sub: 'No transit network forcing narrowband audio' },
                    { icon: 'audio-lines', colour: 'green', text: 'HD voice as standard', sub: 'Wideband codecs such as Opus' },
                    { icon: 'video', colour: 'violet', text: 'Video as standard', sub: 'Negotiated in the same request' },
                ] });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.a, s.b]);
                    const c = s.connect(s.a, s.b, { from: 'r', to: 'l', colour: 'green', width: 5, label: 'direct' });
                    await c.done;
                    s.packet(c, { colour: 'green', duration: 1100 });
                },
                b: async (s) => { await s.reveal(s.offer); await s.wait(1500); s.reveal(s.agree); },
                c: (s) => s.reveal(s.list.items),
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        network: {
            build(s) {
                s.m1 = mesh(s, { cx: 420, cy: 230, r: 190, n: 10, dot: 14, colour: 'blue' });
                s.m2 = mesh(s, { cx: 1308, cy: 230, r: 200, n: 100, dot: 5, colour: 'green' });
                s.s1 = s.stat({ x: 160, y: 460, w: 520, value: '0', label: 'direct routes · 10 providers', colour: 'blue' });
                s.s2 = s.stat({ x: 1028, y: 460, w: 560, value: '0', label: 'direct routes · 100 providers', colour: 'green' });
                [s.s1, s.s2].forEach((e) => { e.classList.add('dr-stat'); e.style.textAlign = 'center'; });
                s.more = s.pill({ x: 690, y: 205, text: 'More value for all', iconName: 'trending-up', colour: 'gold' });
            },
            cues: {
                a: (s) => s.m1.showDots(),
                b: async (s) => {
                    s.m1.showLines();
                    await s.reveal(s.s1);
                    await s.countUp(s.s1, 90, { duration: 1400 });
                },
                c: async (s) => {
                    s.m2.showDots();
                    await s.wait(500);
                    s.m2.showLines();
                    await s.reveal(s.s2);
                    await s.countUp(s.s2, 9900, { duration: 1600 });
                },
                d: (s) => s.reveal(s.more),
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        fallback: {
            build(s) {
                s.alpha = cpCard(s, 'alpha', 0, 220, 330, 130, 'Places a call');
                s.dec = s.card({ x: 420, y: 220, w: 420, h: 130, title: 'PSTN2 address?', sub: 'From Ofcom’s numbering list', iconName: 'circle-help', colour: 'gold', compact: true });
                s.old = s.card({ x: 1300, y: 480, w: 428, title: 'Provider without PSTN2', sub: 'Traditional routing, as today', iconName: 'building', colour: 'slate', compact: true });
                s.quiet = s.pill({ x: 860, y: 590, text: 'No failure · callers notice nothing', iconName: 'circle-check', colour: 'slate' });
                s.new = cpCard(s, 'bravo', 1300, 0, 428, 120, 'Direct PSTN2 route');
                s.ben = [
                    s.pill({ x: 1300, y: 140, text: 'Lower cost', iconName: 'pound-sterling', colour: 'green' }),
                    s.pill({ x: 1300, y: 216, text: 'Lower latency', iconName: 'zap', colour: 'green' }),
                    s.pill({ x: 1300, y: 292, text: 'Better quality', iconName: 'audio-lines', colour: 'green' }),
                    s.pill({ x: 1300, y: 368, text: 'End-to-end encryption', iconName: 'lock', colour: 'green' }),
                ];
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.alpha, s.dec]);
                    const c = s.connect(s.alpha, s.dec, { from: 'r', to: 'l', colour: 'blue' });
                    await c.done;
                    await s.reveal(s.old);
                    s.o = s.connect(s.dec, s.old, { from: 'b', to: 'l', colour: 'slate', dashed: true, bend: -0.2, label: 'no → traditional routing', labelDy: 40 });
                    await s.o.done;
                    s.packet(s.o, { colour: 'slate', duration: 1400 });
                },
                b: (s) => s.reveal(s.quiet),
                c: async (s) => {
                    await s.reveal(s.new);
                    const y = s.connect(s.dec, s.new, { from: 't', to: 'l', colour: 'green', width: 5, bend: 0.2, label: 'yes → direct', labelDy: -16 });
                    await y.done;
                    s.packet(y, { colour: 'green', duration: 1200 });
                    s.activate(s.new);
                    s.reveal(s.ben);
                },
            },
        },

        // 11 ────────────────────────────────────────────────────────────
        peering: {
            build(s) {
                s.alpha = cpCard(s, 'alpha', 0, 220, 400, null, 'Peer');
                s.bravo = cpCard(s, 'bravo', 1328, 220, 400, null, 'Peer');
                s.like = s.pill({ x: 664, y: 0, text: 'Like internet peering', iconName: 'globe', colour: 'blue' });
                s.deal = s.card({ x: 514, y: 100, w: 700, title: 'Peering agreement', sub: 'Between the two providers', iconName: 'file-check', colour: 'gold',
                    body: `<ul class="p2-bullets" style="position:static;margin-top:6px">
                        <li class="p2-reveal p2-from-left" style="--c:var(--blue);margin-bottom:14px;font-size:28px"><div class="p2-chip" style="width:48px;height:48px">${s.icon('settings', { size: 26 })}</div><div>Technical details</div></li>
                        <li class="p2-reveal p2-from-left" style="--c:var(--green);margin-bottom:14px;font-size:28px"><div class="p2-chip" style="width:48px;height:48px">${s.icon('gauge', { size: 26 })}</div><div>Service levels</div></li>
                        <li class="p2-reveal p2-from-left" style="--c:var(--amber);margin-bottom:0;font-size:28px"><div class="p2-chip" style="width:48px;height:48px">${s.icon('pound-sterling', { size: 26 })}</div><div>Settlement rates, if any</div></li></ul>` });
                s.easy = [
                    s.pill({ x: 520, y: 470, text: 'Easy to set up', iconName: 'zap', colour: 'green' }),
                    s.pill({ x: 900, y: 470, text: 'Automated to run', iconName: 'workflow', colour: 'green' }),
                ];
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.alpha, s.bravo, s.deal]);
                    s.connect(s.deal, s.alpha, { from: 'l', to: 'r', colour: 'gold', dashed: true, arrow: false });
                    s.connect(s.deal, s.bravo, { from: 'r', to: 'l', colour: 'gold', dashed: true, arrow: false });
                    s.reveal(s.like);
                },
                b: async (s) => { for (const li of s.deal.querySelectorAll('li')) { await s.reveal(li); await s.wait(600); } },
                c: (s) => { s.reveal(s.easy); s.activate(s.deal); },
            },
        },

        // 12 ────────────────────────────────────────────────────────────
        geography: {
            build(s) {
                s.hqA = s.card({ x: 0, y: 0, w: 440, title: 'Alpha head office', sub: 'Elsewhere', iconName: 'building-2', colour: 'blue', compact: true });
                s.hqB = s.card({ x: 1288, y: 0, w: 440, title: 'Bravo head office', sub: 'Elsewhere', iconName: 'building-2', colour: 'green', compact: true });
                s.city = s.el(`<div class="dr-region-t">${s.icon('map-pin', { size: 30 })}London</div>`, { x: 364, y: 230, w: 1000, h: 300, cls: 'dr-region', hidden: true, from: 'scale' });
                s.eA = s.pill({ x: 420, y: 350, text: 'Alpha equipment', iconName: 'server', colour: 'blue' });
                s.eB = s.pill({ x: 1060, y: 350, text: 'Bravo equipment', iconName: 'server', colour: 'green' });
                s.avoid = s.pill({ x: 620, y: 40, text: 'Long-distance transit avoided', iconName: 'ban', colour: 'red' });
                s.gain = [
                    s.pill({ x: 470, y: 570, text: 'Lower transit costs', iconName: 'pound-sterling', colour: 'green' }),
                    s.pill({ x: 900, y: 570, text: 'Better call quality', iconName: 'audio-lines', colour: 'green' }),
                ];
            },
            cues: {
                a: (s) => s.reveal([s.hqA, s.hqB, s.city]),
                b: async (s) => {
                    await s.reveal([s.eA, s.eB]);
                    const c = s.connect(s.eA, s.eB, { from: 'r', to: 'l', colour: 'green', width: 5, label: 'connected in London' });
                    await c.done;
                    await s.packet(c, { colour: 'green', duration: 1000 });
                    s.packet(c, { colour: 'green', duration: 1000, reverse: true });
                },
                c: async (s) => {
                    s.connect(s.eA, s.hqA, { from: 't', to: 'b', colour: 'red', dashed: true, arrow: false, opacity: 0.6 });
                    s.connect(s.hqA, s.hqB, { from: 'r', to: 'l', colour: 'red', dashed: true, arrow: false, opacity: 0.6 });
                    s.connect(s.hqB, s.eB, { from: 'b', to: 't', colour: 'red', dashed: true, arrow: false, opacity: 0.6 });
                    await s.wait(500);
                    s.reveal(s.avoid);
                    s.reveal(s.gain);
                },
            },
        },
    },
});
