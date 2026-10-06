// MAP Architecture — Managed Access Providers host PSTN2 for smaller providers (PSTN2 v1.1)
// Providers and MAPs are fictional; prices are illustrative, as in the original deck.
import { createDeck } from '../../shared/pstn2-player.js';

/** Centre a row of already-created elements horizontally, using their measured widths. */
function row(els, { y, gap = 28, x0 = 0, w = 1728 }) {
    const widths = els.map((e) => e.offsetWidth);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (els.length - 1);
    let x = x0 + (w - total) / 2;
    els.forEach((e, i) => { e.style.left = `${Math.round(x)}px`; e.style.top = `${y}px`; x += widths[i] + gap; });
}

/** A small round node (CP, MAP) for constellation diagrams. */
function node(s, { x, y, size = 64, iconName = 'building-2', colour = 'amber', label = '', hidden = true }) {
    return s.el(`${s.icon(iconName, { size: Math.round(size * 0.46) })}${label ? `<span>${label}</span>` : ''}`, { x, y, w: size, h: size, cls: 'ma-node', colour, hidden, from: 'scale' });
}

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        challenge: {
            build(s) {
                s.infra = [
                    s.pill({ x: 0, y: 0, text: 'APIs', iconName: 'code', colour: 'blue' }),
                    s.pill({ x: 0, y: 0, text: 'TLS certificates', iconName: 'lock', colour: 'blue' }),
                    s.pill({ x: 0, y: 0, text: 'Signing keys', iconName: 'key-round', colour: 'blue' }),
                    s.pill({ x: 0, y: 0, text: 'Number discovery answers', iconName: 'search', colour: 'blue' }),
                    s.pill({ x: 0, y: 0, text: 'Cache', iconName: 'database-zap', colour: 'blue' }),
                ];
                row(s.infra, { y: 0, gap: 24 });
                s.large = s.card({ x: 0, y: 120, w: 800, h: 380, title: 'Large CP', sub: 'Builds it in-house', iconName: 'factory', colour: 'green' });
                s.largeB = s.bullets({ x: 30, y: 270, w: 740, gap: 18, items: [
                    { icon: 'users', colour: 'green', text: 'Engineering teams' },
                    { icon: 'server', colour: 'green', text: 'Its own infrastructure' },
                    { icon: 'lock', colour: 'green', text: 'APIs and TLS, built and run' },
                ] });
                s.small = s.card({ x: 928, y: 120, w: 800, h: 380, title: 'Small CP', sub: 'Most providers, by number', iconName: 'store', colour: 'amber' });
                s.smallB = s.bullets({ x: 958, y: 270, w: 740, gap: 18, items: [
                    { icon: 'user-x', colour: 'red', text: 'No technical staff' },
                    { icon: 'circle-x', colour: 'red', text: 'No infrastructure' },
                    { icon: 'construction', colour: 'red', text: 'Can’t build PSTN2 alone' },
                ] });
                s.locked = s.pill({ x: 0, y: 560, text: 'Locked out of PSTN2’s benefits?', iconName: 'lock', colour: 'red' });
            },
            cues: {
                a: (s) => { row([s.locked], { y: 560 }); s.reveal(s.infra); },
                b: (s) => { s.reveal(s.large); s.wait(400).then(() => s.reveal(s.largeB.items)); },
                c: (s) => { s.reveal(s.small); s.wait(400).then(() => s.reveal(s.smallB.items)); },
                d: (s) => { s.dim(s.small, false); s.activate(s.small); s.reveal(s.locked); s.ring(s.locked, { colour: 'red', size: 200 }); },
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        maps: {
            build(s) {
                s.map = s.card({ x: 604, y: 170, w: 520, title: 'Managed Access Provider', sub: 'Hosted PSTN2 service', iconName: 'cloud', colour: 'violet' });
                s.net = s.card({ x: 1338, y: 170, w: 390, title: 'PSTN2 network', sub: 'Every other provider', iconName: 'network', colour: 'green' });
                s.cps = [40, 150, 260, 370].map((y, i) => s.pill({ x: 60, y, text: `Small CP ${i + 1}`, iconName: 'store', colour: 'amber' }));
                s.handles = s.pill({ x: 0, y: 330, text: 'The MAP handles the complexity', iconName: 'settings', colour: 'violet' });
                s.cloud = s.statement({ x: 0, y: 540, w: 1728, size: 52, cls: 'ma-center', html: 'Cloud infrastructure, <em>for telecoms.</em>' });
            },
            cues: {
                a: (s) => { s.reveal(s.map); s.ring(s.map, { colour: 'violet', size: 260 }); },
                b: async (s) => {
                    await s.reveal(s.net);
                    const c = s.connect(s.map, s.net, { from: 'r', to: 'l', colour: 'green', width: 4 });
                    await c.done;
                    s.packet(c, { colour: 'green', duration: 1000 });
                },
                c: async (s) => {
                    row([s.handles], { y: 330, x0: 604, w: 520 });
                    await s.reveal(s.cps);
                    s.cps.forEach((p, i) => {
                        const c = s.connect(p, s.map, { from: 'r', to: 'l', colour: 'amber', width: 3, toOpts: { dy: -30 + i * 20 } });
                        s.wait(300 + i * 150).then(() => s.packet(c, { colour: 'amber', duration: 900 }));
                    });
                    await s.wait(900);
                    s.reveal(s.handles);
                },
                d: (s) => s.reveal(s.cloud),
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        services: {
            build(s) {
                const tile = (i, iconName, title, sub, colour) => s.card({ x: (i % 3) * 590, y: 20 + Math.floor(i / 3) * 170, w: 548, h: 130, title, sub, iconName, colour });
                s.tiles = [
                    tile(0, 'shield-check', 'Caller verification', 'Verification API endpoints', 'green'),
                    tile(1, 'search', 'Discovery answers', 'held · redirect for ports out', 'blue'),
                    tile(2, 'database-zap', 'Discovery and caching', 'For outgoing calls', 'cyan'),
                    tile(3, 'siren', 'Emergency location', 'Real-time location queries', 'red'),
                    tile(4, 'key-round', 'Key management', 'Ed25519 signing · DTLS keys', 'violet'),
                    tile(5, 'monitor', 'Web portal', 'Configuration and reports', 'gold'),
                ];
                s.sum = s.statement({ x: 0, y: 420, w: 1728, size: 56, cls: 'ma-center', html: 'Enterprise-grade infrastructure,<br><em>without building it.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.tiles[0]),
                b: (s) => s.reveal(s.tiles[1]),
                c: (s) => s.reveal(s.tiles[2]),
                d: (s) => s.reveal(s.tiles.slice(3)),
                e: (s) => s.reveal(s.sum),
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        integration: {
            build(s) {
                const opt = (i, iconName, title, sub, colour) => s.card({ x: 0, y: 10 + i * 165, w: 660, compact: true, title, sub, iconName, colour });
                s.opts = [
                    opt(0, 'monitor', 'Web portal', 'No technical staff needed', 'blue'),
                    opt(1, 'code', 'REST APIs', 'Some technical capability', 'green'),
                    opt(2, 'phone-call', 'SIP proxy', 'Traditional PBX integration', 'amber'),
                    opt(3, 'plug', 'Pre-built connectors', 'Popular switching platforms', 'violet'),
                ];
                s.map = s.card({ x: 1168, y: 200, w: 560, title: 'Your MAP', sub: 'One PSTN2 service, four ways in', iconName: 'cloud', colour: 'violet' });
                s.meet = s.pill({ x: 1168, y: 360, text: 'Meeting providers where they are', iconName: 'handshake', colour: 'violet' });
            },
            cues: {
                a: (s) => s.reveal(s.map),
                ...Object.fromEntries(['b', 'c', 'd', 'e'].map((k, i) => [k, async (s) => {
                    await s.reveal(s.opts[i]);
                    const c = s.connect(s.opts[i], s.map, { from: 'r', to: 'l', colour: ['blue', 'green', 'amber', 'violet'][i], width: 3, toOpts: { dy: -36 + i * 24 } });
                    await c.done;
                    s.packet(c, { colour: ['blue', 'green', 'amber', 'violet'][i], duration: 900 });
                    if (k === 'e') { await s.wait(800); s.reveal(s.meet); }
                }])),
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        market: {
            build(s) {
                const m = (i, name, price, feature) => s.card({ x: i * 594, y: 0, w: 540, title: name, sub: feature, iconName: 'cloud', colour: 'violet',
                    body: `<div class="ma-price">${price}<small> a month</small></div>` });
                s.maps = [m(0, 'MAP A', '£50', 'Lowest price'), m(1, 'MAP B', '£100', 'Most features'), m(2, 'MAP C', '£75', 'Best support')];
                s.note = s.el(s.tag('Illustrative prices', 'slate'), { x: 0, y: 214, hidden: true, from: 'fade' });
                s.cp = s.card({ x: 604, y: 430, w: 520, title: 'Small CP', sub: 'Chooses on value', iconName: 'store', colour: 'amber' });
                s.free = s.pill({ x: 0, y: 330, text: 'Free to switch', iconName: 'repeat', colour: 'amber' });
                s.up = s.pill({ x: 0, y: 470, text: 'Innovation', iconName: 'trending-up', colour: 'green' });
                s.down = s.pill({ x: 1420, y: 470, text: 'Lower costs', iconName: 'trending-down', colour: 'green' });
            },
            cues: {
                a: (s) => s.reveal([...s.maps, s.note]),
                b: async (s) => {
                    await s.reveal(s.cp);
                    s.links = s.maps.map((mp, i) => s.connect(s.cp, mp, { from: 't', to: 'b', colour: 'slate', dashed: true, width: 3, arrow: false, fromOpts: { dx: (i - 1) * 160 } }));
                    await s.wait(700);
                    s.links[1].fade();
                    s.chosen = s.connect(s.cp, s.maps[1], { from: 't', to: 'b', colour: 'green', width: 5 });
                    s.activate(s.maps[1]);
                },
                c: async (s) => {
                    row([s.free], { y: 330 });
                    s.reveal(s.free);
                    await s.wait(1200);
                    if (s.chosen) s.chosen.fade();
                    s.activate(s.maps[1], false);
                    s.links[2].fade();
                    s.connect(s.cp, s.maps[2], { from: 't', to: 'b', colour: 'green', width: 5, fromOpts: { dx: 160 } });
                    s.activate(s.maps[2]);
                },
                d: (s) => s.reveal([s.up, s.down]),
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        cost: {
            build(s) {
                s.map = s.card({ x: 0, y: 0, w: 820, h: 400, title: 'Use a MAP', sub: 'Monthly subscription, by call volume', iconName: 'cloud', colour: 'green' });
                s.mapStat = s.stat({ x: 40, y: 150, w: 740, value: '£50–200', label: 'a month, for a few thousand calls', colour: 'green' });
                s.own = s.card({ x: 908, y: 0, w: 820, h: 400, title: 'Build in-house', sub: 'Engineers and infrastructure', iconName: 'construction', colour: 'red' });
                s.ownStat = s.stat({ x: 948, y: 150, w: 740, value: '£200k+', label: 'a year in engineers and infrastructure', colour: 'red' });
                s.sum = s.statement({ x: 0, y: 460, w: 1728, size: 52, cls: 'ma-center', html: 'A fraction of the cost of <em>building it yourself.</em>' });
                s.note = s.el(s.tag('Illustrative figures', 'slate'), { x: 0, y: 590, hidden: true, from: 'fade' });
            },
            cues: {
                a: (s) => s.reveal(s.map),
                b: (s) => { s.reveal([s.mapStat, s.note]); s.activate(s.map); },
                c: async (s) => {
                    s.activate(s.map, false);
                    await s.reveal(s.own);
                    s.reveal(s.ownStat);
                    s.countUp(s.ownStat, 200, { duration: 1400, format: (v) => `£${Math.round(v)}k+` });
                    await s.wait(1200);
                    s.reveal(s.sum);
                },
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        trust: {
            build(s) {
                s.list = s.card({ x: 284, y: 0, w: 1160, compact: true, title: 'Ofcom numbering list', sub: 'S1–S9, plus the Range Holder URL', iconName: 'file-text', colour: 'gold', body: ' ' });
                s.listT = s.table(s.list, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }, { key: 'u', label: 'Range Holder URL' }], colour: 'gold' });
                s.listT.add({ b: '0113 496 0xxx', r: 'Charlie Comms', u: '<span class="ma-url">https://charlie.map-a.example</span>' });
                s.charlie = s.card({ x: 0, y: 330, w: 520, title: 'Charlie Comms', sub: 'Authoritative for its numbers', iconName: 'building-2', colour: 'amber' });
                s.mapA = s.card({ x: 604, y: 330, w: 520, title: 'MAP A', sub: 'Answers on Charlie’s behalf', iconName: 'cloud', colour: 'violet' });
                s.mapB = s.card({ x: 1208, y: 330, w: 520, title: 'MAP B', sub: 'Another MAP', iconName: 'cloud', colour: 'violet' });
                s.never = s.pill({ x: 0, y: 500, text: 'Never owns the numbers', iconName: 'shield-check', colour: 'green' });
                s.fall = s.pill({ x: 604, y: 500, text: 'Meanwhile: today’s network', iconName: 'phone', colour: 'red' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.charlie, s.mapA]);
                    s.l1 = s.connect(s.mapA, s.charlie, { from: 'l', to: 'r', colour: 'violet', width: 3 });
                },
                b: async (s) => {
                    await s.reveal(s.list);
                    s.listT.highlight(0, 'gold'); s.mapA.querySelector('.p2-card-sub').textContent = 'Hosts Charlie’s PSTN2 address';
                    s.l2 = s.connect(s.list, s.mapA, { from: 'b', to: 't', colour: 'gold', width: 3, dashed: true, fromOpts: { dx: 180 } });
                },
                c: (s) => s.reveal(s.never),
                d: async (s) => {
                    s.mapA.classList.add('ma-down');
                    s.mapA.querySelector('.p2-card-sub').textContent = 'Out of service';
                    if (s.l1) s.l1.fade();
                    if (s.l2) s.l2.fade();
                    s.reveal(s.fall);
                    await s.wait(1600);
                    await s.reveal(s.mapB);
                    s.activate(s.mapB);
                    s.mapB.querySelector('.p2-card-sub').textContent = 'Now hosts Charlie’s address';
                    const u = s.list.querySelector('.ma-url');
                    u.textContent = 'https://charlie.map-b.example';
                    u.classList.add('ma-on');
                    s.connect(s.list, s.mapB, { from: 'b', to: 't', colour: 'gold', width: 3, dashed: true, fromOpts: { dx: 420 } });
                },
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        regulation: {
            build(s) {
                s.reg = s.card({ x: 604, y: 0, w: 520, title: 'Regulator', sub: 'Licenses and oversees MAPs', iconName: 'landmark', colour: 'gold' });
                s.maps = ['MAP A', 'MAP B', 'MAP C'].map((t, i) => s.card({ x: i * 604, y: 200, w: 520, compact: true, title: t, sub: 'Managed Access Provider', iconName: 'cloud', colour: 'violet',
                    body: `<div class="ma-lic">${s.tag('Licensed', 'gold')}</div>` }));
                s.reqs = [
                    s.pill({ x: 0, y: 410, text: 'Service standards', iconName: 'gauge', colour: 'gold' }),
                    s.pill({ x: 0, y: 410, text: 'Security requirements', iconName: 'shield-check', colour: 'gold' }),
                    s.pill({ x: 0, y: 410, text: 'Operational transparency', iconName: 'eye', colour: 'gold' }),
                ];
                s.sum = s.statement({ x: 0, y: 540, w: 1728, size: 50, cls: 'ma-center', html: 'Accountability that <em>protects small providers.</em>' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.reg); s.reveal(s.maps); },
                b: async (s) => {
                    s.activate(s.reg);
                    s.maps.forEach((m, i) => { s.connect(s.reg, m, { from: 'b', to: 't', colour: 'gold', width: 3, fromOpts: { dx: (i - 1) * 150 } }); });
                    await s.wait(700);
                    s.maps.forEach((m) => m.querySelector('.ma-lic').classList.add('ma-on'));
                },
                c: (s) => { row(s.reqs, { y: 410, gap: 30 }); s.reveal(s.reqs); },
                d: (s) => { s.activate(s.reg, false); s.reveal(s.sum); },
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        scale: {
            build(s) {
                const panel = (x, title, sub, cps, price, colour) => {
                    const card = s.card({ x, y: 0, w: 540, h: 440, title, sub, iconName: 'cloud', colour, compact: true });
                    const cx = x + 270, cy = 200, r = 116;
                    const hub = node(s, { x: cx - 44, y: cy - 44, size: 88, iconName: 'cloud', colour: 'violet' });
                    const dots = Array.from({ length: cps }, (_, i) => {
                        const a = (i / cps) * Math.PI * 2 - Math.PI / 2;
                        return node(s, { x: cx + Math.cos(a) * r - 26, y: cy + Math.sin(a) * r * 0.78 - 26, size: 52, iconName: 'store', colour: 'amber' });
                    });
                    const cost = s.el(`<b>${price}</b><span> a month per provider</span>`, { x: x + 30, y: 350, w: 480, cls: 'ma-cost', colour, hidden: true, from: 'fade' });
                    return { card, hub, dots, cost };
                };
                s.early = panel(0, 'Early: a few providers', 'Costs shared by two', 2, '£200', 'amber');
                s.later = panel(594, 'Later: many providers', 'Costs shared by ten', 10, '£75', 'green');
                s.gains = s.pill({ x: 594, y: 470, text: 'Better infrastructure · more features', iconName: 'sparkles', colour: 'green' });
                s.back = s.pill({ x: 0, y: 470, text: 'Early adopters benefit too', iconName: 'award', colour: 'amber' });
                s.note = s.el(s.tag('Illustrative prices', 'slate'), { x: 0, y: 610, hidden: true, from: 'fade' });
                const L = ['More providers', 'Economies of scale', 'Lower cost, more features', 'Faster adoption'];
                s.loop = L.map((t, i) => s.pill({ x: 1250, y: 10 + i * 150, text: t, iconName: ['users', 'layers', 'trending-down', 'rocket'][i], colour: 'cyan' }));
            },
            cues: {
                a: async (s) => {
                    for (const p of [s.early, s.later]) {
                        await s.reveal([p.card, p.hub]);
                        await s.reveal(p.dots);
                        p.dots.forEach((d) => s.connect(d, p.hub, { from: 'c', to: 'c', colour: 'slate', width: 2, arrow: false, opacity: 0.6 }));
                    }
                },
                b: async (s) => {
                    await s.reveal([s.early.cost, s.note]);
                    await s.wait(500);
                    s.reveal(s.later.cost); s.activate(s.later.card);
                    s.reveal(s.gains);
                },
                c: (s) => { s.activate(s.later.card, false); s.activate(s.early.card); s.early.cost.querySelector('b').textContent = '£75'; s.early.card.querySelector('.p2-card-sub').textContent = 'Now sharing the larger pool'; s.reveal(s.back); },
                d: async (s) => {
                    s.activate(s.early.card, false);
                    for (let i = 0; i < s.loop.length; i += 1) {
                        await s.reveal(s.loop[i]);
                        if (i > 0) s.connect(s.loop[i - 1], s.loop[i], { from: 'bl', to: 'tl', colour: 'cyan', width: 3, fromOpts: { dx: 60 }, toOpts: { dx: 60 } });
                        await s.wait(250);
                    }
                    s.connect(s.loop[3], s.loop[0], { from: 'l', to: 'l', colour: 'cyan', width: 3, bend: -0.5, fromOpts: { dx: -6 }, toOpts: { dx: -6 } });
                },
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        example: {
            build(s) {
                s.cp = s.card({ x: 0, y: 40, w: 520, title: 'Rural CP', sub: 'A small, local provider', iconName: 'house', colour: 'amber',
                    body: `<div class="ma-fact"><b>5,000</b><span>customers</span></div><div class="ma-fact"><b>2</b><span>employees</span></div>` });
                s.no = s.pill({ x: 0, y: 420, text: 'Build it in-house? Not realistic', iconName: 'construction', colour: 'red' });
                s.map = s.card({ x: 620, y: 150, w: 480, title: 'MAP subscription', sub: 'Around £100 a month', iconName: 'cloud', colour: 'violet' });
                s.full = s.card({ x: 1208, y: 0, w: 520, h: 470, title: 'Full PSTN2', sub: 'Every capability', iconName: 'badge-check', colour: 'green' });
                s.caps = s.bullets({ x: 1238, y: 130, w: 470, gap: 14, items: [
                    { icon: 'shield-check', colour: 'green', text: 'Caller verification' },
                    { icon: 'route', colour: 'green', text: 'Direct routing' },
                    { icon: 'lock', colour: 'green', text: 'Encryption' },
                    { icon: 'siren', colour: 'green', text: 'Emergency location' },
                ] });
                s.sum = s.statement({ x: 0, y: 560, w: 1728, size: 48, cls: 'ma-center', html: 'The same benefits as <em>the largest carriers.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.cp),
                b: (s) => s.reveal(s.no),
                c: async (s) => {
                    s.dim(s.no);
                    await s.reveal(s.map);
                    const c = s.connect({ x: 520, y: s.anchor(s.map, 'l').y }, s.map, { from: 'r', to: 'l', colour: 'violet', width: 4 });
                    await c.done;
                    s.packet(c, { colour: 'violet', duration: 900 });
                    await s.reveal(s.full);
                    s.connect(s.map, { x: 1208, y: s.anchor(s.map, 'r').y }, { from: 'r', to: 'l', colour: 'green', width: 4 });
                },
                d: async (s) => { for (const li of s.caps.items) { s.reveal(li); await s.wait(700); } },
                e: (s) => s.reveal(s.sum),
            },
        },

        // 11 ────────────────────────────────────────────────────────────
        everyone: {
            build(s) {
                s.large = s.card({ x: 0, y: 20, w: 640, title: 'Large CP', sub: 'Built in-house', iconName: 'factory', colour: 'green' });
                s.small = s.card({ x: 1088, y: 20, w: 640, title: 'Small CP', sub: 'Through a MAP', iconName: 'store', colour: 'amber' });
                s.eq = s.statement({ x: 640, y: 6, w: 448, size: 110, cls: 'ma-center', html: '<em>=</em>' });
                s.part = s.pill({ x: 1088, y: 168, text: 'Takes part', iconName: 'circle-check', colour: 'amber' });
                s.rural = s.pill({ x: 1340, y: 168, text: 'Modern features', iconName: 'sparkles', colour: 'amber' });
                const pts = [[60, 330], [300, 400], [520, 310], [760, 390], [980, 300], [1200, 380], [1420, 310], [1640, 390]];
                s.mesh = pts.map(([x, y], i) => node(s, { x: x - 30, y: y - 30, size: 60, iconName: i % 3 === 0 ? 'factory' : 'store', colour: i % 3 === 0 ? 'green' : 'amber' }));
                s.sum = s.statement({ x: 0, y: 520, w: 1728, size: 56, cls: 'ma-center', html: 'PSTN2 for <em>every provider.</em>' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.large); await s.reveal(s.eq); s.reveal(s.small); },
                b: (s) => s.reveal([s.part, s.rural]),
                c: async (s) => {
                    await s.reveal(s.mesh);
                    for (let i = 0; i < s.mesh.length - 1; i += 1) {
                        s.connect(s.mesh[i], s.mesh[i + 1], { from: 'c', to: 'c', colour: 'green', width: 3, arrow: false, opacity: 0.7, duration: 500 });
                        if (i < s.mesh.length - 2) s.connect(s.mesh[i], s.mesh[i + 2], { from: 'c', to: 'c', colour: 'slate', width: 2, arrow: false, opacity: 0.4, duration: 500 });
                        await s.wait(120);
                    }
                    s.mesh.forEach((n) => s.activate(n));
                },
                d: (s) => s.reveal(s.sum),
            },
        },
    },
});
