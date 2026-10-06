// Who Has This Number? — PSTN2 Number Discovery (protocol v1.1, SPECIFICATION.md §9)
// Numbers are from Ofcom's reserved TV/drama ranges; providers are fictional.
import { createDeck } from '../../shared/pstn2-player.js';

const CP = {
    alpha: { name: 'Alpha Telecom', colour: 'blue', url: 'pstn2.alpha-telecom.example', block: '020 7946 0xxx' },
    bravo: { name: 'Bravo Networks', colour: 'green', url: 'pstn2.bravo-networks.example', block: '0161 496 0xxx' },
    charlie: { name: 'Charlie Comms', colour: 'amber', url: 'pstn2.charlie-comms.example', block: '0113 496 0xxx' },
};
const LIST = [
    { block: '020 7946 0', cp: 'Alpha Telecom', url: 'pstn2.alpha-telecom.example' },
    { block: '0161 496 0', cp: 'Bravo Networks', url: 'pstn2.bravo-networks.example' },
    { block: '0113 496 0', cp: 'Charlie Comms', url: 'pstn2.charlie-comms.example' },
    { block: '0117 496 0', cp: 'Delta Voice', url: '<span style="color:var(--ink-4)">— not participating</span>' },
];
const STEPS = ['Check the cache', 'Numbering list', 'Ask the Range Holder', 'Follow a redirect', 'Cache &amp; go direct'];
const SIG = 'kV6QbUqP3vD0aXk2…';

/** The call-flow stage used by scenes 5–10: Alpha (caller's CP) and two Range Holders. */
function network(s, { number = '', cache = [], bravo = [], charlie = [], step = -1, show = true } = {}) {
    const steps = s.steps({ x: 0, y: 0, w: 1728, items: STEPS });
    if (step >= 0) steps.set(step);
    const alpha = s.card({
        x: 0, y: 104, w: 540, title: CP.alpha.name, sub: 'The caller’s provider', iconName: 'building-2', colour: 'blue', compact: true,
        body: `<div class="dd-dial">${s.icon('phone-outgoing', { size: 30 })}<span>Dialled</span></div><div class="dd-num">${number}</div><div class="dd-section">Cache</div>`,
    });
    const cacheT = s.table(alpha, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'h', label: 'Held by' }, { key: 'e', label: 'Expires' }], colour: 'blue' });
    if (!cache.length) cacheT.add({ n: '—', h: 'no entries yet', e: '' }, { cls: 'dd-empty' });
    cache.forEach((r) => cacheT.add(r));
    const rh = (key, rows, y) => {
        const c = CP[key];
        const card = s.card({ x: 1188, y, w: 540, title: c.name, sub: `Range Holder · ${c.block}`, iconName: 'building-2', colour: c.colour, compact: true, body: ' ' });
        const t = s.table(card, { columns: [{ key: 'n', label: 'Number database', num: true }, { key: 'st', label: 'Status' }], colour: c.colour });
        rows.forEach((r) => t.add(r));
        return { card, t };
    };
    const b = rh('bravo', bravo, 104);
    const c = rh('charlie', charlie, 392);
    if (show) s.reveal([steps.el, alpha, b.card, c.card]);
    return { steps, alpha, cache: cacheT, bravo: b.card, bravoT: b.t, charlie: c.card, charlieT: c.t, num: alpha.querySelector('.dd-num') };
}

const BRAVO_ROWS = [
    { n: '0161 496 0123', st: 'In service' },
    { n: '0161 496 0500', st: 'In service' },
    { n: '0113 496 0456', st: 'Ported in · from Charlie' },
];
const CHARLIE_ROWS = [
    { n: '0113 496 0789', st: 'In service' },
    { n: '0113 496 0456', st: 'Ported out → Bravo' },
];

/** Request/response bubbles in the middle lane. */
const lane = { x: 590, w: 560 };

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        question: {
            build(s) {
                s.phone = s.card({ x: 40, y: 60, w: 560, title: 'A customer dials', sub: 'Alpha Telecom', iconName: 'phone-outgoing', colour: 'blue', body: '<div class="dd-num" style="font-size:58px;min-height:70px"></div>' });
                s.q = s.statement({ x: 700, y: 40, w: 1028, html: '<div class="dd-big-q">Who has<br><em>this number?</em></div>', from: 'right' });
                s.uses = [
                    s.pill({ x: 700, y: 370, text: 'Check the caller', iconName: 'shield-check', colour: 'green' }),
                    s.pill({ x: 1050, y: 370, text: 'Route it directly', iconName: 'route', colour: 'blue' }),
                    s.pill({ x: 1398, y: 370, text: 'Encrypt it', iconName: 'lock', colour: 'violet' }),
                ];
                s.move = s.pill({ x: 40, y: 330, text: 'Numbers move between providers every day', iconName: 'arrow-left-right', colour: 'amber' });
                s.answer = s.statement({ x: 700, y: 500, w: 1028, size: 50, html: 'Answered in milliseconds. <em>No central database.</em>' });
            },
            cues: {
                a: (s) => { s.reveal(s.phone); s.wait(700).then(() => s.type(s.phone.querySelector('.dd-num'), '0161 496 0123', { cps: 14 })); },
                b: (s) => { s.reveal(s.q); },
                c: (s) => s.reveal(s.uses),
                d: (s) => { s.reveal(s.move); s.ring(s.move, { colour: 'amber', size: 160 }); },
                e: (s) => s.reveal(s.answer),
            },
        },

        // 2 ─────────────────────────────────────────────────────────────
        central: {
            build(s) {
                s.db = s.card({ x: 230, y: 214, w: 400, title: 'Central database', sub: 'Every number, every port', iconName: 'database', colour: 'red' });
                s.nodes = [[40, 40], [300, 10], [560, 40], [40, 520], [300, 560], [560, 520]].map(([x, y]) => s.pill({ x, y, text: 'CP', iconName: 'building-2', colour: 'slate' }));
                s.cost1 = s.stat({ x: 930, y: 10, w: 380, value: '£2m', label: 'estimated build cost', colour: 'amber' });
                s.cost2 = s.stat({ x: 1330, y: 10, w: 400, value: '£600k', label: 'every year to run (30% a year)', colour: 'amber' });
                s.risks = s.bullets({ x: 930, y: 250, w: 800, gap: 22, items: [
                    { icon: 'triangle-alert', colour: 'red', text: 'A single point of failure', sub: 'If it stops, discovery stops for everyone' },
                    { icon: 'target', colour: 'red', text: 'A single target for attackers', sub: 'The map of every number in the country' },
                    { icon: 'landmark', colour: 'amber', text: 'A new body to own and fund it', sub: 'Governance, access rules, disputes' },
                ] });
                s.turn = s.statement({ x: 930, y: 250, w: 790, size: 66, html: 'PSTN2:<br><em>the data already exists.</em>' });
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.db);
                    s.reveal(s.nodes);
                    await s.wait(500);
                    s.links = s.nodes.map((n, i) => s.connect(n, s.db, { from: i < 3 ? 'b' : 't', to: i < 3 ? 't' : 'b', colour: 'slate', width: 3, arrow: false, opacity: 0.7 }));
                },
                b: (s) => { s.reveal(s.cost1); s.countUp(s.cost1, 2, { format: (v) => `£${v.toFixed(1).replace('.0', '')}m`, duration: 1200 }); },
                c: (s) => { s.reveal(s.cost2); s.countUp(s.cost2, 600, { format: (v) => `£${Math.round(v)}k`, duration: 1400 }); },
                d: (s) => { s.reveal(s.risks.items.slice(0, 2)); s.activate(s.db); s.ring(s.db, { colour: 'red', size: 260 }); },
                e: (s) => s.reveal(s.risks.items[2]),
                f: (s) => {
                    s.risks.items.forEach((li) => s.hide(li));
                    s.dim(s.db); s.nodes.forEach((n) => s.dim(n)); (s.links || []).forEach((l) => l.fade());
                    s.dim(s.cost1); s.dim(s.cost2);
                    s.wait(450).then(() => s.reveal(s.turn));
                },
            },
        },

        // 3 ─────────────────────────────────────────────────────────────
        exists: {
            build(s) {
                const cols = { columns: [] };
                s.ofcom = s.card({ x: 0, y: 10, w: 540, title: 'Ofcom', sub: 'Numbering lists S1–S9', iconName: 'landmark', colour: 'gold' });
                const t1 = s.table(s.ofcom, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }], colour: 'gold' });
                LIST.slice(0, 3).forEach((r) => t1.add({ b: r.block, r: r.cp }));
                s.rh = s.card({ x: 594, y: 10, w: 540, title: 'Charlie Comms', sub: 'Range Holder · knows its ports', iconName: 'building-2', colour: 'amber' });
                const t2 = s.table(s.rh, { columns: [{ key: 'n', label: 'Ported out', num: true }, { key: 'to', label: 'Now with' }], colour: 'amber' });
                t2.add({ n: '0113 496 0456', to: 'Bravo Networks' });
                s.cp = s.card({ x: 1188, y: 10, w: 540, title: 'Bravo Networks', sub: 'Knows the numbers it serves', iconName: 'building-2', colour: 'green' });
                const t3 = s.table(s.cp, { columns: [{ key: 'n', label: 'In service', num: true }, { key: 'how', label: '' }], colour: 'green' });
                t3.add({ n: '0161 496 0123', how: 'own range' });
                t3.add({ n: '0161 496 0500', how: 'own range' });
                t3.add({ n: '0113 496 0456', how: 'ported in' });
                s.t3 = t3; s.t2 = t2; s.t1 = t1;
                s.sum = s.statement({ x: 0, y: 470, w: 1728, size: 54, html: 'Together, that is the complete answer.<br><em>We only need a way to ask.</em>' });
                void cols;
            },
            cues: {
                a: (s) => { s.reveal([s.ofcom, s.rh, s.cp]); [s.ofcom, s.rh, s.cp].forEach((c) => s.dim(c)); },
                b: (s) => { s.dim(s.ofcom, false); s.activate(s.ofcom); s.t1.highlight(2, 'gold'); },
                c: (s) => { s.activate(s.ofcom, false); s.dim(s.rh, false); s.activate(s.rh); s.t2.highlight(0, 'amber'); },
                d: (s) => { s.activate(s.rh, false); s.dim(s.cp, false); s.activate(s.cp); s.t3.highlight(2, 'green'); },
                e: (s) => {
                    s.activate(s.cp, false);
                    s.connect(s.ofcom, s.rh, { colour: 'gold', width: 3, from: 'r', to: 'l' });
                    s.connect(s.rh, s.cp, { colour: 'amber', width: 3, from: 'r', to: 'l' });
                    s.reveal(s.sum);
                },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        field: {
            build(s) {
                const rows = LIST.map((r) => `<tr><td class="p2-num">${r.block}</td><td>${r.cp}</td><td>Allocated</td><td class="dd-newcol dd-mono" style="font-size:19px">${r.url}</td></tr>`).join('');
                s.list = s.card({ x: 0, y: 10, w: 1110, title: 'Ofcom numbering list', sub: 'S1–S9, published by the regulator', iconName: 'file-text', colour: 'gold',
                    body: `<table class="p2-table"><thead><tr><th>Number block</th><th>Range Holder</th><th>Status</th><th class="dd-newcol">+ Range Holder URL</th></tr></thead><tbody>${rows}</tbody></table>` });
                s.copies = ['alpha', 'bravo', 'charlie'].map((k, i) => s.card({ x: 1250, y: 10 + i * 134, w: 478, title: CP[k].name, sub: 'keeps a local copy', iconName: 'hard-drive', colour: CP[k].colour, compact: true }));
                s.mirrors = [
                    s.pill({ x: 0, y: 420, text: 'Mirror', iconName: 'layers', colour: 'slate' }),
                    s.pill({ x: 190, y: 420, text: 'Mirror', iconName: 'layers', colour: 'slate' }),
                ];
                s.truth = s.pill({ x: 400, y: 420, text: 'Ofcom remains the single source of truth', iconName: 'badge-check', colour: 'gold' });
                s.sum = s.statement({ x: 0, y: 540, w: 1728, size: 52, html: 'One field: <em>the only shared data PSTN2 needs.</em>' });
            },
            cues: {
                a: (s) => s.reveal(s.list),
                b: async (s) => {
                    s.activate(s.list);
                    const cells = [...s.list.querySelectorAll('.dd-newcol')];
                    for (const [i, c] of cells.entries()) { await s.wait(i ? 220 : 0); c.classList.add('dd-on'); }
                },
                c: async (s) => {
                    s.activate(s.list, false);
                    await s.reveal(s.copies);
                    s.copies.forEach((c, i) => {
                        const conn = s.connect(s.list, c, { from: 'r', to: 'l', colour: 'gold', width: 3, dashed: true, toOpts: { dy: 0 }, fromOpts: { dy: -120 + i * 120 } });
                        s.wait(300 + i * 200).then(() => s.packet(conn, { colour: 'gold', label: 'download', duration: 1200 }));
                    });
                },
                d: (s) => s.reveal([...s.mirrors, s.truth]),
                e: (s) => s.reveal(s.sum),
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        cache: {
            build(s) {
                s.n = network(s, { number: '', cache: [{ n: '0113 496 0789', h: 'Charlie Comms', e: '6 h' }, { n: '020 7946 0222', h: 'Alpha Telecom', e: '20 h' }], bravo: BRAVO_ROWS.slice(0, 2), charlie: CHARLIE_ROWS, show: false });
                s.inv = s.msg({ x: lane.x, y: 190, w: lane.w, title: 'Any PSTN2 answer can say', colour: 'violet', iconName: 'refresh-cw', json: { cache: { invalidate: true, scope: 'number' } } });
                s.miss = s.pill({ x: lane.x + 60, y: 400, text: 'No entry · cache miss', iconName: 'circle-x', colour: 'red' });
            },
            cues: {
                a: async (s) => {
                    s.reveal([s.n.steps.el, s.n.alpha, s.n.bravo, s.n.charlie]);
                    s.dim(s.n.bravo); s.dim(s.n.charlie);
                    await s.wait(500);
                    s.type(s.n.num, '0161 496 0123', { cps: 14 });
                },
                b: (s) => { s.n.steps.set(0); s.activate(s.n.alpha); s.n.cache.highlight(0, 'blue'); s.wait(900).then(() => s.n.cache.highlight(1, 'blue')); },
                c: (s) => s.reveal(s.inv),
                d: (s) => { s.hide(s.inv); s.n.cache.clearHighlight(); s.reveal(s.miss); },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        list: {
            build(s) {
                s.n = network(s, { number: '0161 496 0123', cache: [{ n: '0113 496 0789', h: 'Charlie Comms', e: '6 h' }, { n: '020 7946 0222', h: 'Alpha Telecom', e: '20 h' }], bravo: BRAVO_ROWS.slice(0, 2), charlie: CHARLIE_ROWS, step: 1 });
                s.dim(s.n.bravo); s.dim(s.n.charlie);
                s.copy = s.card({ x: lane.x, y: 104, w: 560, title: 'Ofcom numbering list', sub: 'Alpha’s local copy', iconName: 'file-text', colour: 'gold', compact: true });
                s.lt = s.table(s.copy, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }], colour: 'gold' });
                LIST.forEach((r) => s.lt.add({ b: r.block, r: r.cp }));
                s.url = s.msg({ x: lane.x, y: 470, w: 560, title: 'Range Holder URL', colour: 'green', iconName: 'link', text: 'https://pstn2.bravo-networks.example' });
                s.local = s.pill({ x: lane.x + 40, y: 590, text: 'Local search · no central lookup', iconName: 'search', colour: 'slate' });
            },
            cues: {
                a: async (s) => { await s.reveal(s.copy); s.c1 = s.connect(s.n.alpha, s.copy, { from: 'r', to: 'l', colour: 'blue', fromOpts: { dy: -60 }, toOpts: { dy: -60 } }); },
                b: (s) => { s.lt.highlight(1, 'green'); s.activate(s.copy); },
                c: (s) => {
                    s.reveal(s.url); s.dim(s.n.bravo, false); s.activate(s.n.bravo);
                    s.connect(s.copy, s.n.bravo, { from: 'r', to: 'l', colour: 'green', fromOpts: { dy: -40 }, toOpts: { dy: -60 } });
                },
                d: (s) => s.reveal(s.local),
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        unported: {
            build(s) {
                s.n = network(s, { number: '0161 496 0123', cache: [{ n: '0113 496 0789', h: 'Charlie Comms', e: '6 h' }, { n: '020 7946 0222', h: 'Alpha Telecom', e: '20 h' }], bravo: BRAVO_ROWS.slice(0, 2), charlie: CHARLIE_ROWS, step: 2 });
                s.dim(s.n.charlie);
                s.req = s.msg({ x: lane.x, y: 96, w: 560, title: 'Request · Alpha → Bravo', colour: 'blue', iconName: 'send', text: 'GET https://pstn2.bravo-networks.example\n    /pstn2/v1/numbers/441614960123' });
                s.res = s.msg({ x: lane.x, y: 280, w: 560, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check', json: { result: 'held', number: '+441614960123', holder: { cpName: 'Bravo Networks' }, ported: false, cache: { ttl: 86400 }, signature: SIG } });
                s.fast = s.pill({ x: lane.x - 10, y: 612, text: '1 local search + 1 query · under 50 ms', iconName: 'zap', colour: 'green' });
            },
            cues: {
                a: async (s) => {
                    s.activate(s.n.bravo);
                    s.c = s.connect(s.n.alpha, s.n.bravo, { from: 'r', to: 'l', colour: 'blue', bend: -0.18, fromOpts: { dy: -90 }, toOpts: { dy: -60 } });
                    await s.c.done;
                    s.reveal(s.req);
                    s.packet(s.c, { colour: 'blue', label: 'GET', duration: 1300 });
                },
                b: (s) => s.n.bravoT.highlight(0, 'green'),
                c: async (s) => {
                    await s.packet(s.c, { colour: 'green', label: 'held', duration: 1300, reverse: true });
                    s.reveal(s.res);
                },
                d: (s) => { s.reveal(s.fast); s.n.steps.done(); },
            },
        },

        // 8 ─────────────────────────────────────────────────────────────
        ported: {
            build(s) {
                s.n = network(s, { number: '', cache: [{ n: '0113 496 0789', h: 'Charlie Comms', e: '6 h' }, { n: '0161 496 0123', h: 'Bravo Networks', e: '24 h' }], bravo: BRAVO_ROWS, charlie: CHARLIE_ROWS, step: 0, show: false });
                s.rhPill = s.pill({ x: lane.x + 10, y: 104, text: 'Numbering list → Charlie Comms', iconName: 'file-text', colour: 'gold' });
                s.redir = s.msg({ x: lane.x, y: 96, w: 560, expand: true, title: 'Answer · Charlie → Alpha', colour: 'amber', iconName: 'forward', json: { result: 'redirect', number: '+441134960456', portedTo: { cpName: 'Bravo Networks', url: 'https://pstn2.bravo-networks.example' } } });
                s.held = s.msg({ x: lane.x, y: 430, w: 560, title: 'Answer · Bravo → Alpha', colour: 'green', iconName: 'circle-check', json: { result: 'held', number: '+441134960456', holder: { cpName: 'Bravo Networks' }, ported: true } });
                s.two = s.pill({ x: 0, y: 520, text: '2 queries · authoritative answer', iconName: 'badge-check', colour: 'green' });
            },
            cues: {
                a: async (s) => {
                    s.reveal([s.n.steps.el, s.n.alpha, s.n.bravo, s.n.charlie]);
                    s.dim(s.n.bravo); s.dim(s.n.charlie);
                    await s.wait(500);
                    s.type(s.n.num, '0113 496 0456', { cps: 14 });
                },
                b: async (s) => {
                    s.n.steps.set(1); s.reveal(s.rhPill);
                    await s.wait(900);
                    s.n.steps.set(2); s.dim(s.n.charlie, false); s.activate(s.n.charlie);
                    s.c1 = s.connect(s.n.alpha, s.n.charlie, { from: 'r', to: 'l', colour: 'blue', bend: 0.12, fromOpts: { dy: 40 }, toOpts: { dy: -30 } });
                    await s.c1.done;
                    s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1300 });
                },
                c: (s) => s.n.charlieT.highlight(1, 'amber'),
                d: async (s) => {
                    s.n.steps.set(3);
                    s.hide(s.rhPill);
                    await s.packet(s.c1, { colour: 'amber', label: 'redirect', duration: 1300, reverse: true });
                    s.reveal(s.redir);
                },
                e: async (s) => {
                    s.hide(s.rhPill);
                    s.activate(s.n.charlie, false); s.dim(s.n.bravo, false); s.activate(s.n.bravo);
                    s.c2 = s.connect(s.n.alpha, s.n.bravo, { from: 'r', to: 'l', colour: 'blue', bend: -0.16, fromOpts: { dy: -90 }, toOpts: { dy: -70 } });
                    await s.c2.done;
                    await s.packet(s.c2, { colour: 'blue', label: 'GET', duration: 1100 });
                    s.n.bravoT.highlight(2, 'green');
                    await s.packet(s.c2, { colour: 'green', label: 'held', duration: 1100, reverse: true });
                    s.reveal([s.held, s.two]);
                },
            },
        },

        // 9 ─────────────────────────────────────────────────────────────
        direct: {
            build(s) {
                s.n = network(s, { number: '0113 496 0456', cache: [{ n: '0113 496 0789', h: 'Charlie Comms', e: '6 h' }, { n: '0161 496 0123', h: 'Bravo Networks', e: '24 h' }], bravo: BRAVO_ROWS, charlie: CHARLIE_ROWS, step: 4 });
                s.notBlock = s.pill({ x: lane.x + 20, y: 140, text: 'Never for the whole block', iconName: 'ban', colour: 'red' });
                s.blockNote = s.lead({ x: lane.x + 20, y: 214, w: 540, size: 26, html: 'Porting is one number at a time, so <b>0113 496 0xxx</b> still belongs to Charlie.' });
                s.next = s.pill({ x: lane.x + 20, y: 380, text: 'Next call · straight to Bravo', iconName: 'phone-forwarded', colour: 'green' });
                s.sum = s.statement({ x: lane.x - 10, y: 540, w: 600, size: 38, html: 'Popular numbers: <em>answered from cache</em>' });
            },
            cues: {
                a: (s) => { s.n.cache.add({ n: '0113 496 0456', h: 'Bravo Networks', e: '24 h' }, { flash: true }); s.n.cache.highlight(2, 'green'); s.activate(s.n.alpha); },
                b: (s) => s.reveal([s.notBlock, s.blockNote]),
                c: async (s) => {
                    s.dim(s.n.charlie); s.activate(s.n.alpha, false); s.activate(s.n.bravo);
                    s.reveal(s.next);
                    const c = s.connect(s.n.alpha, s.n.bravo, { from: 'r', to: 'l', colour: 'green', bend: -0.12, fromOpts: { dy: -60 }, toOpts: { dy: -60 }, label: '1 query' });
                    await c.done;
                    await s.packet(c, { colour: 'green', duration: 1000 });
                    s.n.bravoT.highlight(2, 'green');
                    s.packet(c, { colour: 'green', duration: 1000, reverse: true });
                },
                d: (s) => s.reveal(s.sum),
            },
        },

        // 10 ────────────────────────────────────────────────────────────
        invalidate: {
            build(s) {
                s.n = network(s, { number: '0113 496 0456', cache: [{ n: '0161 496 0123', h: 'Bravo Networks', e: '24 h' }, { n: '0113 496 0456', h: 'Bravo Networks', e: '20 h' }], bravo: BRAVO_ROWS, charlie: CHARLIE_ROWS, step: 0 });
                s.mover = s.pill({ x: 1290, y: 300, text: '0113 496 0456', iconName: 'arrow-down', colour: 'amber' });
                s.mover.classList.add('dd-mover');
                s.noBroadcast = s.pill({ x: lane.x + 20, y: 110, text: 'No broadcast needed', iconName: 'megaphone', colour: 'slate' });
                s.nh = s.msg({ x: lane.x, y: 200, w: 560, title: 'Answer · Bravo → Alpha', colour: 'red', iconName: 'refresh-cw', json: { result: 'not_held', number: '+441134960456', cache: { invalidate: true } } });
                s.held = s.msg({ x: lane.x, y: 200, w: 560, title: 'Answer · Charlie → Alpha', colour: 'amber', iconName: 'circle-check', json: { result: 'held', holder: { cpName: 'Charlie Comms' }, ported: false } });
                s.where = s.bullets({ x: lane.x, y: 450, w: 580, gap: 8, items: [
                    { icon: 'search', colour: 'violet', text: '<span style="font-size:26px">Discovery · Verification · Routing</span>', sub: 'every response can carry <b>cache.invalidate</b>' },
                ] });
            },
            cues: {
                a: async (s) => {
                    s.reveal(s.mover);
                    await s.wait(600);
                    s.mover.style.top = '520px';
                    await s.wait(1700);
                    s.n.bravoT.rows[2].classList.add('p2-strike');
                    s.n.charlieT.rows[1].querySelectorAll('td')[1].textContent = 'In service · ported back';
                    s.n.charlieT.highlight(1, 'amber');
                    s.hide(s.mover);
                },
                b: (s) => s.reveal(s.noBroadcast),
                c: async (s) => {
                    s.hide(s.noBroadcast);
                    s.n.steps.set(0); s.n.cache.highlight(1, 'amber');
                    s.c1 = s.connect(s.n.alpha, s.n.bravo, { from: 'r', to: 'l', colour: 'blue', bend: -0.12, fromOpts: { dy: -60 }, toOpts: { dy: -60 } });
                    await s.c1.done;
                    await s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1100 });
                    await s.packet(s.c1, { colour: 'red', label: 'not held', duration: 1100, reverse: true });
                    s.reveal(s.nh);
                },
                d: async (s) => {
                    s.n.cache.rows[1].classList.add('p2-strike');
                    await s.wait(700);
                    s.n.cache.remove(1);
                    s.c1.fade();
                    s.hide(s.nh);
                    s.n.steps.set(1);
                    await s.wait(600);
                    s.n.steps.set(2);
                    s.dim(s.n.bravo); s.activate(s.n.charlie);
                    const c2 = s.connect(s.n.alpha, s.n.charlie, { from: 'r', to: 'l', colour: 'blue', bend: 0.1, fromOpts: { dy: 40 }, toOpts: { dy: -30 } });
                    await c2.done;
                    await s.packet(c2, { colour: 'blue', label: 'GET', duration: 1000 });
                    await s.packet(c2, { colour: 'amber', label: 'held', duration: 1000, reverse: true });
                    s.reveal(s.held);
                    s.n.cache.add({ n: '0113 496 0456', h: 'Charlie Comms', e: '24 h' }, { flash: true });
                    s.n.steps.set(4);
                },
                e: (s) => s.reveal(s.where.items),
            },
        },

        // 11 ────────────────────────────────────────────────────────────
        secure: {
            build(s) {
                s.list = s.bullets({ x: 0, y: 0, w: 1000, gap: 20, items: [
                    { icon: 'network', colour: 'green', text: 'No single point of failure', sub: 'Each provider answers only for its own numbers' },
                    { icon: 'layers', colour: 'gold', text: 'Lists cached everywhere, and mirrored', sub: 'A regulator outage stops nothing' },
                    { icon: 'lock', colour: 'blue', text: 'Signed answers over encrypted connections', sub: 'Ed25519 signatures · TLS 1.3' },
                    { icon: 'eye-off', colour: 'violet', text: 'Nobody holds the national map', sub: 'Range Holders reveal only where their own numbers went' },
                    { icon: 'plug', colour: 'slate', text: 'Participation is optional', sub: 'No PSTN2 address? The call uses today’s network' },
                ] });
                const node = (k, x, y) => s.el(`<div>${s.icon('building-2', { size: 40 })}<div>${CP[k].name.split(' ')[0]}</div></div>`, { x, y, cls: 'dd-cpnode', colour: CP[k].colour, hidden: true, from: 'scale' });
                s.a = node('alpha', 1190, 40); s.b = node('bravo', 1520, 40); s.c = node('charlie', 1355, 330);
                s.fallback = s.pill({ x: 1130, y: 540, text: 'Only Charlie’s numbers use today’s network', iconName: 'phone', colour: 'amber' });
            },
            cues: {
                a: async (s) => {
                    s.reveal(s.list.items[0]);
                    await s.reveal([s.a, s.b, s.c]);
                    s.l1 = s.connect(s.a, s.b, { from: 'r', to: 'l', colour: 'green', arrow: false, width: 3 });
                    s.l2 = s.connect(s.a, s.c, { from: 'b', to: 't', colour: 'green', arrow: false, width: 3 });
                    s.l3 = s.connect(s.b, s.c, { from: 'b', to: 't', colour: 'green', arrow: false, width: 3 });
                    await s.wait(1600);
                    s.c.classList.add('dd-down'); s.l2.fade(); s.l3.fade();
                    s.reveal(s.fallback);
                },
                b: (s) => s.reveal(s.list.items[1]),
                c: (s) => s.reveal(s.list.items[2]),
                d: (s) => s.reveal(s.list.items[3]),
                e: (s) => s.reveal(s.list.items[4]),
            },
        },

        // 12 ────────────────────────────────────────────────────────────
        summary: {
            build(s) {
                s.st = s.steps({ x: 0, y: 0, w: 1728, items: STEPS, colour: 'green' });
                s.c1 = s.stat({ x: 0, y: 150, w: 520, value: '<span class="dd-strike">£2m</span>', label: 'central build — not needed', colour: 'amber' });
                s.c2 = s.stat({ x: 560, y: 150, w: 620, value: '<span class="dd-strike">£600k</span>', label: 'a year to run — not needed', colour: 'amber' });
                s.zero = s.statement({ x: 1220, y: 160, w: 508, size: 58, html: '<em>No central database.</em>' });
                const cta = (x, iconName, title, sub, href, colour) => s.el(`<a class="dd-cta" href="${href}"><div class="p2-chip" style="--c:var(--${colour})">${s.icon(iconName, { size: 38 })}</div><div><div class="p2-card-title">${title}</div><small>${sub}</small></div></a>`, { x, y: 430, w: 820, cls: 'p2-card', colour, hidden: true });
                s.cta1 = cta(0, 'monitor', 'Watch the test harness', 'pstn2.org › Test Harness: Live Demo', '../test-harness/index.html', 'green');
                s.cta2 = cta(908, 'terminal', 'Test your code live', 'https://pstn2.org/testcp/', '../../testcp/index.html', 'blue');
            },
            cues: {
                a: async (s) => {
                    await s.reveal(s.st.el);
                    for (let i = 0; i < 5; i += 1) { s.st.set(i); await s.wait(1400); }
                    s.st.done();
                },
                b: async (s) => {
                    await s.reveal([s.c1, s.c2]);
                    s.c1.querySelector('.dd-strike').classList.add('dd-on');
                    await s.wait(500);
                    s.c2.querySelector('.dd-strike').classList.add('dd-on');
                    s.reveal(s.zero);
                },
                c: (s) => s.reveal([s.cta1, s.cta2]),
            },
        },
    },
});
