// The Problem — why today's all-IP PSTN cannot stop fraud.
// Numbers are from Ofcom's reserved TV/drama ranges; names are generic or fictional.
import { createDeck } from '../../shared/pstn2-player.js';

const node = (s, label, colour, cx, cy, { size = 140, iconName = 'building-2' } = {}) =>
    s.el(`<div>${s.icon(iconName, { size: size > 150 ? 46 : 36 })}<div>${label}</div></div>`, { x: cx - size / 2, y: cy - size / 2, w: size, h: size, cls: 'ps-node', colour, hidden: true, from: 'scale' });

/** Draw an SVG path (pathLength=1) on reveal; instant in capture mode. */
const draw = (s, el) => { el.classList.add('ps-on'); };

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        vulnerable: {
            build(s) {
                const C = { x: 390, y: 330 };
                s.core = node(s, 'PSTN', 'blue', C.x, C.y, { size: 180, iconName: 'network' });
                const pts = [[110, 100], [670, 100], [110, 560], [670, 560]];
                s.cps = pts.map(([x, y]) => node(s, 'CP', 'slate', x, y));
                s.warn = [[250, 215], [530, 215], [250, 445], [530, 445], [390, 100], [390, 560]].map(([x, y]) =>
                    s.el(s.icon('triangle-alert', { size: 30 }), { x: x - 26, y: y - 26, w: 52, h: 52, cls: 'ps-warn', hidden: true, from: 'scale' }));
                s.stat = s.stat({ x: 900, y: 0, w: 828, value: '$0bn', label: 'estimated fraud losses, every year', colour: 'red' });
                s.call = s.card({ x: 900, y: 220, w: 600, title: 'Incoming call', sub: 'Unknown caller', iconName: 'phone-off', colour: 'red', compact: true,
                    body: `<div class="ps-declined">${s.tag('Not answered', 'red')}<span>People have stopped picking up</span></div>` });
                s.threats = [
                    s.pill({ x: 900, y: 480, text: 'A threat to the industry', iconName: 'factory', colour: 'red' }),
                    s.pill({ x: 900, y: 570, text: 'A threat to the wider economy', iconName: 'trending-down', colour: 'red' }),
                ];
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.core);
                    await s.reveal(s.cps);
                    s.links = s.cps.map((c) => s.connect(s.core, c, { from: 'c', to: 'c', colour: 'slate', width: 3, arrow: false, opacity: 0.6 }));
                    s.connect(s.cps[0], s.cps[1], { from: 'c', to: 'c', colour: 'slate', width: 3, arrow: false, opacity: 0.6 });
                    s.connect(s.cps[2], s.cps[3], { from: 'c', to: 'c', colour: 'slate', width: 3, arrow: false, opacity: 0.6 });
                },
                b: async (s) => {
                    for (const w of s.warn) { s.reveal(w); await s.wait(260); }
                    s.cps.forEach((c) => c.classList.add('ps-at-risk'));
                },
                c: (s) => { s.reveal(s.stat); s.countUp(s.stat, 38, { format: (v) => `$${Math.round(v)}bn`, duration: 1800 }); },
                d: (s) => { s.reveal(s.call); s.activate(s.call); },
                e: async (s) => { s.activate(s.call, false); for (const p of s.threats) { s.reveal(p); await s.wait(800); } },
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        fraud: {
            build(s) {
                s.bad = s.card({ x: 0, y: 40, w: 400, title: 'Fraudster', sub: 'Almost no risk of being caught', iconName: 'user-x', colour: 'red',
                    body: `<div class="ps-risk">${s.tag('Risk of capture: minimal', 'red')}</div>` });
                s.phone = s.el(`<div class="ps-ph-top">Incoming call</div>
                    <div class="ps-ph-avatar">${s.icon('landmark', { size: 56 })}</div>
                    <div class="ps-ph-name"></div><div class="ps-ph-num"></div>
                    <div class="ps-ph-fake">${s.icon('triangle-alert', { size: 22 })}Spoofed: not really your bank</div>
                    <div class="ps-ph-btns"><span class="ps-ph-no">${s.icon('phone-off', { size: 34 })}</span><span class="ps-ph-yes">${s.icon('phone', { size: 34 })}</span></div>`,
                { x: 654, y: 0, w: 420, h: 530, cls: 'ps-phone', hidden: true, from: 'up' });
                s.name = s.phone.querySelector('.ps-ph-name');
                s.num = s.phone.querySelector('.ps-ph-num');
                s.fake = s.phone.querySelector('.ps-ph-fake');
                s.victim = s.card({ x: 1328, y: 40, w: 400, title: 'Victim', sub: 'Trusts the display', iconName: 'user', colour: 'blue',
                    body: `<div class="ps-trust"><div class="ps-trust-l"><span>Trust in the network</span><b>100%</b></div><div class="ps-bar"><i></i></div></div>` });
                s.trust = s.victim.querySelector('.ps-trust');
                s.bar = s.victim.querySelector('.ps-bar i');
                s.pct = s.victim.querySelector('.ps-trust-l b');
            },
            cues: {
                a: (s) => { s.reveal(s.bad); s.activate(s.bad); },
                b: async (s) => {
                    s.activate(s.bad, false);
                    await s.reveal(s.phone);
                    const y = s.bad.offsetTop + s.bad.offsetHeight / 2;
                    const c = s.connect({ x: 400, y }, { x: 654, y }, { colour: 'red', dashed: true, label: 'any name, any number', labelDy: -18 });
                    await c.done;
                    await s.packet(c, { colour: 'red', duration: 900 });
                    await s.type(s.name, 'Your Bank', { cps: 16 });
                    await s.type(s.num, '020 7946 0999', { cps: 16 });
                },
                c: async (s) => {
                    await s.reveal(s.victim);
                    s.activate(s.victim);
                    s.money = s.connect(s.victim, s.bad, { from: 'b', to: 'b', colour: 'amber', width: 3, bend: -1.25, arrow: true, opacity: 0.85 });
                    await s.money.done;
                    for (let i = 0; i < (s.capture ? 1 : 3); i += 1) { s.packet(s.money, { colour: 'amber', label: '£', duration: 1600 }); await s.wait(550); }
                },
                d: async (s) => {
                    s.activate(s.victim, false);
                    s.fake.classList.add('ps-on');
                    s.trust.classList.add('ps-on');
                    await s.wait(300);
                    s.bar.style.width = '22%';
                    s.bar.classList.add('ps-low');
                    if (s.capture) { s.pct.textContent = 'Low'; return; }
                    await s.wait(1600);
                    s.pct.textContent = 'Low';
                },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        innovation: {
            build(s) {
                const bars = [['1980s', 'TDM era', 80, 'blue'], ['2000s', 'Early IP', 90, 'green'], ['2010s', 'Stagnation', 40, 'amber'], ['Now', 'All-IP', 6, 'red']];
                s.chart = s.card({ x: 0, y: 0, w: 860, h: 640, title: 'Pace of telecoms innovation', sub: 'Illustrative', iconName: 'chart-column', colour: 'blue',
                    body: `<div class="ps-bars">${bars.map(([era, lab, v, c]) => `<div class="ps-barcol" style="--c:var(--${c});--v:${v}"><div class="ps-barwrap"><div class="ps-barv"></div></div><b>${era}</b><span>${lab}</span></div>`).join('')}</div>` });
                s.cols = [...s.chart.querySelectorAll('.ps-barcol')];
                s.harm = s.pill({ x: 940, y: 0, text: 'Consumers harmed: credibility weakened', iconName: 'trending-down', colour: 'red' });
                s.work = s.pill({ x: 940, y: 84, text: 'Restore trust, and innovate safely', iconName: 'handshake', colour: 'green' });
                s.gain = [
                    s.card({ x: 940, y: 200, w: 380, title: 'Social networks', sub: 'Took the gains', iconName: 'users', colour: 'violet', compact: true }),
                    s.card({ x: 1348, y: 200, w: 380, title: 'OTT messaging', sub: 'Took the gains', iconName: 'message-square', colour: 'cyan', compact: true }),
                ];
                s.telco = s.card({ x: 940, y: 350, w: 788, title: 'The telecoms industry', sub: 'Built the internet, and still maintains it', iconName: 'radio-tower', colour: 'amber',
                    body: `<div class="ps-missed">${s.icon('trending-down', { size: 30 })}Should have benefited, and did not</div>` });
            },
            cues: {
                a: async (s) => { await s.reveal(s.chart); for (const c of s.cols) { c.classList.add('ps-on'); await s.wait(520); } },
                b: (s) => s.reveal(s.harm),
                c: (s) => s.reveal(s.work),
                d: (s) => s.reveal(s.gain),
                e: (s) => { s.reveal(s.telco); s.activate(s.telco); },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        regulation: {
            build(s) {
                const X = (y) => 90 + ((y - 1980) / 45) * 860, Y = (v) => 470 - v * 4.2;
                const tech = [[1980, 15], [1990, 25], [2000, 40], [2010, 62], [2020, 74], [2022, 79]];
                const ai = [[2022, 79], [2023, 84], [2024, 91], [2025, 99]];
                const line = s.d3.line().x((d) => X(d[0])).y((d) => Y(d[1])).curve(s.d3.curveMonotoneX);
                const area = s.d3.area().x((d) => X(d[0])).y0(Y(40)).y1((d) => Y(d[1])).curve(s.d3.curveMonotoneX);
                const gapPts = [...tech.filter((d) => d[0] >= 2000), ...ai.slice(1)];
                const ticks = [1980, 1990, 2000, 2010, 2020].map((y) => `<text x="${X(y)}" y="510" class="ps-tick">${y}</text><line x1="${X(y)}" x2="${X(y)}" y1="470" y2="478" class="ps-axis"/>`).join('');
                s.chart = s.card({ x: 0, y: 0, w: 1060, h: 640, title: 'Technology versus regulation', sub: 'Pace of change, illustrative', iconName: 'activity', colour: 'green',
                    body: `<svg class="ps-chart" viewBox="0 0 1000 530" width="1000" height="530">
                        <line x1="90" x2="960" y1="470" y2="470" class="ps-axis"/><line x1="90" x2="90" y1="40" y2="470" class="ps-axis"/>${ticks}
                        <path class="ps-gap" d="${area(gapPts)}"/>
                        <path class="ps-line ps-reg" pathLength="1" d="M${X(1980)},${Y(40)} L${X(2025)},${Y(40)}"/>
                        <path class="ps-line ps-tech" pathLength="1" d="${line(tech)}"/>
                        <path class="ps-line ps-ai" pathLength="1" d="${line(ai)}"/>
                        <text class="ps-lab ps-lab-t" x="${X(1991)}" y="${Y(56)}">Technology</text>
                        <text class="ps-lab ps-lab-r" x="${X(2005)}" y="${Y(40) + 40}">Telecoms regulation</text>
                        <text class="ps-lab ps-lab-g" x="${X(2016)}" y="${Y(52)}">THE GAP</text>
                        <text class="ps-lab ps-lab-ai" x="${X(2021.3)}" y="${Y(99) + 8}" text-anchor="end">AI</text>
                    </svg>` });
                s.svgq = (sel) => s.chart.querySelector(sel);
                s.act = s.pill({ x: 1120, y: 0, text: 'Regulators must act', iconName: 'gavel', colour: 'amber' });
                s.need = s.bullets({ x: 1120, y: 120, w: 608, gap: 26, items: [
                    { icon: 'shield-check', colour: 'green', text: 'Mandatory technical safeguards', sub: 'That keep pace with the threat' },
                    { icon: 'database', colour: 'blue', text: 'Digital sources of truth', sub: 'Not physical records' },
                ] });
                s.urgent = s.pill({ x: 1120, y: 400, text: 'AI: more urgent than ever', iconName: 'sparkles', colour: 'violet' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.chart);
                    draw(s, s.svgq('.ps-reg')); draw(s, s.svgq('.ps-tech'));
                    await s.wait(1800);
                    ['.ps-lab-t', '.ps-lab-r'].forEach((q) => s.svgq(q).classList.add('ps-on'));
                    await s.wait(500);
                    s.svgq('.ps-gap').classList.add('ps-on'); s.svgq('.ps-lab-g').classList.add('ps-on');
                },
                b: (s) => s.reveal(s.act),
                c: async (s) => { s.reveal(s.need.items[0]); await s.wait(1500); s.reveal(s.need.items[1]); },
                d: async (s) => { draw(s, s.svgq('.ps-ai')); await s.wait(900); s.svgq('.ps-lab-ai').classList.add('ps-on'); s.reveal(s.urgent); },
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        cdb: {
            build(s) {
                s.db = s.card({ x: 0, y: 0, w: 820, title: 'Central numbering database', sub: 'A key enabler for today’s challenges', iconName: 'database-zap', colour: 'red' });
                s.c1 = s.stat({ x: 0, y: 170, w: 380, value: '£0m', label: 'estimated to build', colour: 'amber' });
                s.c2 = s.stat({ x: 400, y: 170, w: 420, value: '£0k', label: 'a year to run (30% a year)', colour: 'amber' });
                s.concerns = [
                    s.pill({ x: 0, y: 400, text: 'Economic', iconName: 'pound-sterling', colour: 'slate' }),
                    s.pill({ x: 220, y: 400, text: 'Technical', iconName: 'wrench', colour: 'slate' }),
                    s.pill({ x: 440, y: 400, text: 'Time to value', iconName: 'hourglass', colour: 'slate' }),
                ];
                s.stamp = s.el('Not progressed', { x: 180, y: 220, cls: 'ps-stamp', hidden: true, from: 'scale' });
                s.ots = s.card({ x: 908, y: 0, w: 820, title: 'One-Touch Switch', sub: 'Industry raised similar concerns', iconName: 'repeat', colour: 'green',
                    body: `<div class="ps-ots"><div>${s.icon('gavel', { size: 30 })}<span>Mandated by the regulator</span></div><div>${s.icon('circle-check', { size: 30 })}<span>Went ahead</span></div></div>` });
                s.push = s.statement({ x: 0, y: 540, w: 1728, size: 52, html: 'Future innovation may need the same <em>regulatory push.</em>' });
                s.push.style.textAlign = 'center';
            },
            cues: {
                a: (s) => s.reveal(s.db),
                b: async (s) => {
                    s.reveal(s.c1); s.countUp(s.c1, 2, { format: (v) => `£${Math.round(v)}m`, duration: 1100 });
                    await s.wait(2400);
                    s.reveal(s.c2); s.countUp(s.c2, 600, { format: (v) => `£${Math.round(v)}k`, duration: 1300 });
                },
                c: async (s) => { for (const p of s.concerns) { s.reveal(p); await s.wait(500); } await s.wait(400); s.dim(s.db); s.dim(s.c1); s.dim(s.c2); s.reveal(s.stamp); },
                d: (s) => { s.reveal(s.ots); s.activate(s.ots); },
                e: (s) => { s.activate(s.ots, false); s.reveal(s.push); },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        gaps: {
            build(s) {
                const items = [['lock', 'Privacy for all communications'], ['user-check', 'Trusted caller identification'], ['trending-down', 'Clear paths to cost reduction'],
                    ['scale', 'A level playing field'], ['wrench', 'Common access tooling'], ['database', 'Access to sources of truth']];
                s.tiles = items.map(([ic, t], i) => s.el(`<div class="p2-chip">${s.icon(ic, { size: 30 })}</div><span>${t}</span><em>${s.icon('x', { size: 22, stroke: 3 })}Missing</em>`,
                    { x: (i % 3) * 588, y: Math.floor(i / 3) * 140, w: 552, h: 116, cls: 'ps-tile', hidden: true, from: 'up' }));
                s.strategy = s.pill({ x: 0, y: 312, text: 'Needed: an assertive all-IP regulatory strategy', iconName: 'landmark', colour: 'amber' });
                s.stifled = s.pill({ x: 0, y: 396, text: 'All-IP treated as a back-end replacement: innovation stifled', iconName: 'construction', colour: 'red' });
                s.from = s.card({ x: 0, y: 500, w: 700, title: 'Competition through switching', sub: 'Today’s policy focus', iconName: 'repeat', colour: 'slate', compact: true });
                s.to = s.card({ x: 1028, y: 500, w: 700, title: 'Competition through innovation', sub: 'Taking advantage of all-IP', iconName: 'lightbulb', colour: 'green', compact: true });
            },
            cues: {
                a: (s) => s.reveal(s.tiles),
                b: (s) => s.reveal(s.strategy),
                c: (s) => s.reveal(s.stifled),
                d: async (s) => {
                    await s.reveal(s.from);
                    const c = s.connect(s.from, s.to, { from: 'r', to: 'l', colour: 'green', width: 5, label: 'policy shift' });
                    await c.done;
                    await s.reveal(s.to);
                    s.activate(s.to);
                },
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        strategy: {
            build(s) {
                s.q = s.statement({ x: 0, y: 40, w: 760, size: 96, html: 'What if there were <em>another way?</em>' });
                s.list = s.bullets({ x: 860, y: 10, w: 868, gap: 46, items: [
                    { icon: 'database-zap', colour: 'blue', text: 'Without a central database' },
                    { icon: 'zap', colour: 'blue', text: 'Without big-bang changes' },
                    { icon: 'pound-sterling', colour: 'blue', text: 'Without unjustifiable investment' },
                    { icon: 'users', colour: 'green', text: 'Without waiting for everyone to agree' },
                    { icon: 'landmark', colour: 'green', text: 'Without waiting for the regulator', sub: 'to acquire the latest technology skills' },
                ] });
                s.list.el.classList.add('ps-without');
            },
            cues: {
                a: (s) => s.reveal(s.q),
                b: (s) => s.reveal(s.list.items[0]),
                c: async (s) => { s.reveal(s.list.items[1]); await s.wait(1300); s.reveal(s.list.items[2]); },
                d: async (s) => { s.reveal(s.list.items[3]); await s.wait(1700); s.reveal(s.list.items[4]); },
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        introducing: {
            build(s) {
                s.logo = s.statement({ x: 0, y: 0, w: 860, size: 190, html: '<em>PSTN2</em>', from: 'scale' });
                s.tags = s.el(`${s.tag('Distributed', 'blue')}${s.tag('Secure', 'green')}${s.tag('Optional', 'violet')}`, { x: 6, y: 230, cls: 'ps-tags', hidden: true });
                s.what = [
                    s.pill({ x: 0, y: 320, text: 'Free to use', iconName: 'check', colour: 'green' }),
                    s.pill({ x: 230, y: 320, text: 'Software libraries', iconName: 'code', colour: 'blue' }),
                    s.pill({ x: 534, y: 320, text: 'Documentation', iconName: 'book-open', colour: 'blue' }),
                ];
                s.a = s.card({ x: 1080, y: 0, w: 520, title: 'Alpha Telecom', sub: 'PSTN2 participant', iconName: 'building-2', colour: 'blue', compact: true });
                s.b = s.card({ x: 1080, y: 300, w: 520, title: 'Bravo Networks', sub: 'PSTN2 participant', iconName: 'building-2', colour: 'green', compact: true });
                s.priv = s.pill({ x: 1130, y: 166, text: 'Privacy', iconName: 'lock', colour: 'violet' });
                s.sec = s.pill({ x: 1370, y: 166, text: 'Security', iconName: 'shield-check', colour: 'blue' });
                s.value = s.statement({ x: 0, y: 470, w: 1728, size: 54, html: 'Value back into <em>person-to-person communication.</em>' });
                s.value.style.textAlign = 'center';
                s.race = s.pill({ x: 604, y: 590, text: 'Not a race to the bottom on price', iconName: 'trending-up', colour: 'green' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.logo); s.reveal(s.tags); },
                b: async (s) => { for (const p of s.what) { s.reveal(p); await s.wait(600); } },
                c: async (s) => {
                    await s.reveal([s.a, s.b]);
                    const c = s.connect(s.a, s.b, { from: 'b', to: 't', colour: 'green' });
                    await c.done;
                    s.packet(c, { colour: 'green', duration: 1000 });
                    s.reveal([s.priv, s.sec]);
                },
                d: async (s) => { await s.reveal(s.value); s.reveal(s.race); },
            },
        },
    },
});
