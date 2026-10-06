// Solution Overview — PSTN2 in ten ideas (protocol v1.1).
// Numbers are from Ofcom's reserved TV/drama ranges; providers are fictional.
import { createDeck } from '../../shared/pstn2-player.js';
import { CP, insight, how, regulator } from './core-scenes.js';

/** A row inside a comparison column, revealed with s.reveal(). */
function colRow(s, parent, { icon, colour, title, sub }) {
    const row = document.createElement('div');
    row.className = 'so-row p2-reveal p2-from-left';
    row.style.setProperty('--c', s.colour(colour));
    row.innerHTML = `<div class="p2-chip">${s.icon(icon, { size: 30 })}</div><div><div class="so-row-t">${title}</div>${sub ? `<div class="so-row-s">${sub}</div>` : ''}</div>`;
    parent.append(row);
    return row;
}

/** A round provider node for network diagrams. */
function node(s, label, colour, cx, cy, iconName = 'building-2') {
    return s.el(`<div>${s.icon(iconName, { size: 38 })}<div>${label}</div></div>`, { x: cx - 70, y: cy - 70, cls: 'so-node', colour, hidden: true, from: 'scale' });
}

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        insight,

        // 2 ─────────────────────────────────────────────────────────────
        distributed: {
            build(s) {
                const C = { x: 470, y: 330 }, R = { x: 360, y: 240 };
                const defs = [['Alpha', 'blue'], ['Bravo', 'green'], ['Charlie', 'amber'], ['CP', 'slate'], ['CP', 'slate'], ['CP', 'slate']];
                s.nodes = defs.map(([l, c], i) => {
                    const a = (-90 + i * 60) * Math.PI / 180;
                    return node(s, l, c, C.x + R.x * Math.cos(a), C.y + R.y * Math.sin(a));
                });
                s.ghost = s.el(`${s.icon('database-zap', { size: 64 })}<span class="so-ghost-x">${s.icon('x', { size: 130, stroke: 2.2 })}</span>`, { x: C.x - 80, y: C.y - 80, w: 160, h: 160, cls: 'so-ghost', hidden: true, from: 'scale' });
                s.list = s.bullets({ x: 1000, y: 30, w: 728, gap: 34, items: [
                    { icon: 'search', colour: 'blue', text: 'Ask the number’s own provider', sub: 'Always up to date, at the source' },
                    { icon: 'building-2', colour: 'green', text: 'Each answers for its own numbers', sub: 'Nobody holds anyone else’s data' },
                    { icon: 'share-2', colour: 'amber', text: 'Any provider can ask any other', sub: 'Direct, provider to provider' },
                ] });
                s.sum = s.statement({ x: 1000, y: 520, w: 728, size: 50, html: 'No physical <em>central database.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.nodes);
                    s.reveal(s.list.items[0]);
                    const q = async (i, j, colour) => {
                        const c = s.connect(s.nodes[i], s.nodes[j], { from: 'c', to: 'c', colour, width: 3, arrow: false, duration: 500 });
                        await c.done;
                        await s.packet(c, { colour, duration: 900 });
                        await s.packet(c, { colour: 'green', duration: 900, reverse: true });
                        c.fade();
                    };
                    if (s.capture) return;
                    await q(0, 1, 'blue');
                    await q(2, 4, 'amber');
                },
                b: async (s) => {
                    s.reveal(s.list.items[1]);
                    await s.wait(1600);
                    s.reveal(s.list.items[2]);
                    for (let i = 0; i < 6; i += 1) for (let j = i + 1; j < 6; j += 1) s.connect(s.nodes[i], s.nodes[j], { from: 'c', to: 'c', colour: 'slate', width: 2, arrow: false, opacity: 0.32, duration: 700 });
                },
                c: (s) => { s.reveal(s.ghost); s.reveal(s.sum); },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        capabilities: {
            build(s) {
                const items = [
                    ['Authentication', 'Real-time caller ID checks', 'Stops spoofed calls before they ring', 'shield-check', 'blue'],
                    ['Direct routing', 'Provider to provider', 'Cuts transit cost and delay', 'route', 'green'],
                    ['Encryption', 'End to end', 'Keeps every conversation private', 'lock', 'violet'],
                    ['Call branding', 'Verified caller name', 'Know it really is your bank', 'badge-check', 'gold'],
                    ['Emergency location', 'Real-time data for 999 and 112', 'Enhances or replaces overnight updates', 'siren', 'red'],
                    ['Open messaging', 'Any process, automated', 'Porting, fault tracing, diagnostics', 'workflow', 'cyan'],
                ];
                s.cards = items.map(([title, sub, body, iconName, colour], i) => s.card({ x: (i % 3) * 588, y: Math.floor(i / 3) * 326, w: 552, h: 296, title, sub, iconName, colour, body: `<div class="so-benefit">${body}</div><div class="so-mark">${s.icon(iconName, { size: 120, stroke: 1.4 })}</div>` }));
            },
            cues: {
                a: async (s) => { await s.reveal(s.cards[0]); await s.wait(1800); s.reveal(s.cards[1]); },
                b: async (s) => { await s.reveal(s.cards[2]); await s.wait(1800); s.reveal(s.cards[3]); },
                c: (s) => s.reveal(s.cards[4]),
                d: async (s) => { await s.reveal(s.cards[5]); s.activate(s.cards[5]); s.ring(s.cards[5], { colour: 'cyan', size: 300 }); },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        optional: {
            build(s) {
                s.head = s.statement({ x: 0, y: 0, w: 860, size: 66, html: 'Participation is <em>optional.</em>' });
                s.meter = s.el(Array.from({ length: 10 }, () => `<div class="so-sq">${s.icon('building-2', { size: 30 })}</div>`).join(''), { x: 0, y: 160, w: 860, cls: 'so-meter', hidden: true });
                s.sq = [...s.meter.children];
                s.legend = s.el(`<span class="so-key so-key-on"></span>PSTN2 provider<span class="so-key"></span>Not taking part`, { x: 0, y: 250, cls: 'so-legend', hidden: true });
                s.pace = s.lead({ x: 0, y: 296, w: 860, size: 30, html: 'Adopt at your own pace, <b>or not at all.</b>' });
                s.a = s.card({ x: 940, y: 250, w: 330, title: 'Alpha Telecom', sub: 'PSTN2 provider', iconName: 'building-2', colour: 'blue', compact: true });
                s.b = s.card({ x: 1398, y: 30, w: 330, title: 'Bravo Networks', sub: 'Direct PSTN2 calls', iconName: 'building-2', colour: 'green', compact: true });
                s.n = s.card({ x: 1398, y: 470, w: 330, title: 'Other CP', sub: 'Today’s network', iconName: 'building', colour: 'slate', compact: true });
                s.pills = [
                    s.pill({ x: 0, y: 400, text: 'No big bang', iconName: 'check', colour: 'green' }),
                    s.pill({ x: 0, y: 476, text: 'No forced migration', iconName: 'check', colour: 'green' }),
                    s.pill({ x: 0, y: 552, text: 'Voluntary, demand-led improvement', iconName: 'trending-up', colour: 'green' }),
                ];
            },
            cues: {
                a: (s) => s.reveal(s.head),
                b: async (s) => {
                    await s.reveal([s.meter, s.legend]);
                    for (const i of [0, 3, 1, 6, 4, 8]) { await s.wait(380); s.sq[i].classList.add('so-on'); }
                    s.reveal(s.pace);
                },
                c: async (s) => {
                    await s.reveal([s.a, s.b, s.n]);
                    const d = s.connect(s.a, s.b, { from: 'r', to: 'l', colour: 'green' });
                    await d.done;
                    s.packet(d, { colour: 'green', duration: 900 });
                    await s.wait(1400);
                    const f = s.connect(s.a, s.n, { from: 'r', to: 'l', colour: 'slate', dashed: true });
                    await f.done;
                    s.packet(f, { colour: 'slate', duration: 1300 });
                },
                d: async (s) => { for (const p of s.pills) { s.reveal(p); await s.wait(700); } },
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        nocdb: {
            build(s) {
                const col = (x, title, iconName, colour) => s.el(`<h3><span class="p2-chip" style="--c:${s.colour(colour)}">${s.icon(iconName, { size: 34 })}</span>${title}</h3>`, { x, y: 0, w: 800, h: 620, cls: 'p2-col so-col', colour, hidden: true, from: 'up' });
                s.left = col(0, 'Central database', 'database-zap', 'red');
                s.right = col(928, 'PSTN2', 'network', 'green');
                s.vs = s.el('VS', { x: 824, y: 280, w: 80, h: 80, cls: 'so-vs', hidden: true, from: 'scale' });
                s.l = [
                    colRow(s, s.left, { icon: 'pound-sterling', colour: 'red', title: '~£2m to build', sub: 'Estimated build cost' }),
                    colRow(s, s.left, { icon: 'coins', colour: 'red', title: '~£600k a year to run', sub: '30% of the build cost, every year' }),
                    colRow(s, s.left, { icon: 'hourglass', colour: 'red', title: 'Years to deliver', sub: 'Before any benefit arrives' }),
                    colRow(s, s.left, { icon: 'triangle-alert', colour: 'red', title: 'A single point of failure', sub: 'If it stops, everyone stops' }),
                ];
                s.r = [
                    colRow(s, s.right, { icon: 'piggy-bank', colour: 'green', title: 'No central cost', sub: 'No more than a central database would need' }),
                    colRow(s, s.right, { icon: 'network', colour: 'green', title: 'No single point of failure', sub: 'Each provider answers for itself' }),
                    colRow(s, s.right, { icon: 'code', colour: 'green', title: 'Free, tested software', sub: 'Lower set-up costs, faster savings' }),
                    colRow(s, s.right, { icon: 'sparkles', colour: 'green', title: 'AI-assisted integration', sub: 'Legacy systems, connected reliably' }),
                ];
            },
            cues: {
                a: async (s) => { await s.reveal(s.left); s.reveal(s.l[0]); await s.wait(2600); s.reveal(s.l[1]); },
                b: async (s) => { await s.reveal(s.l[2]); await s.wait(1200); s.reveal(s.l[3]); },
                c: async (s) => { s.reveal(s.vs); await s.reveal(s.right); await s.reveal(s.r[0]); await s.wait(500); s.reveal(s.r[1]); },
                d: (s) => s.reveal(s.r[2]),
                e: (s) => { s.reveal(s.r[3]); s.activate(s.right); },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        how,

        // 7 ─────────────────────────────────────────────────────────────
        regulator: regulator(),

        // 8 ─────────────────────────────────────────────────────────────
        security: {
            build(s) {
                s.a = s.card({ x: 0, y: 0, w: 440, title: CP.alpha.name, sub: 'Signs every message', iconName: 'building-2', colour: 'blue', compact: true });
                s.b = s.card({ x: 1288, y: 0, w: 440, title: CP.bravo.name, sub: 'Verifies every message', iconName: 'building-2', colour: 'green', compact: true });
                s.bad = s.pill({ x: 560, y: 150, text: 'Forged message', iconName: 'user-x', colour: 'red' });
                s.rej = s.pill({ x: 1288, y: 150, text: 'Rejected', iconName: 'shield-x', colour: 'red' });
                const card = (i, title, sub, iconName, colour, body) => s.card({ x: i * 588, y: 290, w: 552, h: 320, title, sub, iconName, colour, body: `${body}<div class="so-mark">${s.icon(iconName, { size: 110, stroke: 1.4 })}</div>` });
                s.cards = [
                    card(0, 'Zero trust', 'Every message verified', 'shield-check', 'blue', `<div class="so-benefit">Challenged and checked on arrival.</div><div class="so-tagrow">${s.tag('Ed25519 signatures', 'blue')}</div>`),
                    card(1, 'Encrypt everything', 'Signalling and media', 'lock', 'violet', `<div class="so-benefit">A unique key for every call.</div><div class="so-tagrow">${s.tag('TLS 1.3', 'violet')}${s.tag('SRTP · DTLS', 'violet')}</div>`),
                    card(2, 'Data minimisation', 'Share only what’s needed', 'eye-off', 'green', `<div class="so-benefit">Only with authorised parties.</div><div class="so-tagrow">${s.tag('Need to know', 'green')}</div>`),
                ];
            },
            cues: {
                a: async (s) => {
                    await s.reveal([s.a, s.b]);
                    s.link = s.connect(s.a, s.b, { from: 'r', to: 'l', colour: 'blue', label: 'PSTN2 messages' });
                    await s.link.done;
                    s.packet(s.link, { colour: 'blue', duration: 1200 });
                },
                b: async (s) => {
                    s.reveal(s.cards[0]);
                    await s.reveal(s.bad);
                    const c = s.connect(s.bad, s.b, { from: 'r', to: 'bl', colour: 'red', dashed: true, toOpts: { dx: 30 } });
                    await c.done;
                    await s.packet(c, { colour: 'red', label: 'fake', duration: 1100 });
                    c.fade();
                    s.reveal(s.rej);
                    s.dim(s.bad);
                },
                c: async (s) => {
                    s.reveal(s.cards[1]);
                    s.link.g.select('text').text('TLS 1.3 · SRTP keys per call');
                    s.link.path.attr('stroke', s.colour('violet')).attr('marker-end', s.link.path.attr('marker-end').replace('blue', 'violet'));
                    s.packet(s.link, { colour: 'violet', duration: 1200 });
                },
                d: (s) => s.reveal(s.cards[2]),
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        maps: {
            build(s) {
                s.cps = [
                    s.card({ x: 0, y: 0, w: 440, title: 'Small CP', sub: 'No technical team', iconName: 'user-x', colour: 'slate', compact: true }),
                    s.card({ x: 0, y: 140, w: 440, title: 'Small CP', sub: 'Limited budget', iconName: 'wallet', colour: 'slate', compact: true }),
                    s.card({ x: 0, y: 280, w: 440, title: 'Larger CP', sub: 'Testing the water', iconName: 'building-2', colour: 'slate', compact: true }),
                ];
                const svc = (iconName, t) => `<li>${s.icon(iconName, { size: 26 })}<span>${t}</span></li>`;
                s.map = s.card({ x: 600, y: 0, w: 528, title: 'MAP', sub: 'Managed Access Provider', iconName: 'server', colour: 'violet',
                    body: `<ul class="so-svc">${svc('plug', 'PSTN2 API hosting')}${svc('search', 'Number discovery')}${svc('shield-check', 'Security')}${svc('monitor', 'Web portal')}</ul>` });
                s.net = s.card({ x: 1288, y: 0, w: 440, title: 'PSTN2 network', sub: 'Other providers', iconName: 'network', colour: 'green',
                    body: ['alpha', 'bravo', 'charlie'].map((k) => `<div class="so-mini" style="--c:${s.colour(CP[k].colour)}"><i></i>${CP[k].name}</div>`).join('') });
                s.compete = s.pill({ x: 600, y: 440, text: 'MAPs compete on service and price', iconName: 'scale', colour: 'violet' });
                s.revenue = s.statement({ x: 0, y: 560, w: 1728, size: 42, html: 'Wholesale carriers: <em>a new revenue stream, at almost no running cost.</em>' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.cps[0]); await s.wait(1200); s.reveal(s.cps[1]); },
                b: (s) => { s.reveal(s.map); s.activate(s.map); },
                c: async (s) => {
                    s.activate(s.map, false);
                    await s.reveal([s.cps[2], s.net]);
                    s.cps.forEach((c, i) => {
                        s.connect(c, s.map, { from: 'r', to: 'l', colour: 'violet', width: 3, toOpts: { dy: -60 + i * 60 } });
                        const sub = c.querySelector('.p2-card-sub');
                        sub.textContent = i < 2 ? 'Participating via a MAP' : 'Trying PSTN2 via a MAP';
                        sub.classList.add('so-ok');
                    });
                    const n = s.connect(s.map, s.net, { from: 'r', to: 'l', colour: 'green', width: 4 });
                    await n.done;
                    s.packet(n, { colour: 'green', duration: 1000 });
                },
                d: (s) => s.reveal(s.compete),
                e: (s) => s.reveal(s.revenue),
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        join: {
            build(s) {
                s.site = s.statement({ x: 0, y: 0, w: 1728, size: 104, html: '<em>pstn2.org</em>' });
                s.site.style.textAlign = 'center';
                const cta = (i, iconName, title, sub, href, colour) => s.el(`<a class="so-cta" href="${href}"><div class="p2-chip" style="--c:var(--${colour})">${s.icon(iconName, { size: 38 })}</div><div><div class="p2-card-title">${title}</div><small>${sub}</small></div></a>`, { x: i * 588, y: 190, w: 552, cls: 'p2-card', colour, hidden: true });
                s.ctas = [
                    cta(0, 'code', 'Download the code', 'TypeScript · Python · Go', '../../code/', 'blue'),
                    cta(1, 'book-open', 'Read the specification', 'PSTN2 protocol v1.1', '../../docs/SPECIFICATION.md', 'green'),
                    cta(2, 'presentation', 'Watch the series', 'Every PSTN2 presentation', '../../index.html', 'violet'),
                ];
                s.close = s.statement({ x: 0, y: 440, w: 1728, size: 52, html: 'No central database. No £2m build. No £600k a year.<br><em>Just better technology, available now.</em>' });
                s.close.style.textAlign = 'center';
            },
            cues: {
                a: async (s) => { await s.reveal(s.site); s.reveal(s.ctas); },
                b: (s) => s.reveal(s.close),
            },
        },
    },
});
