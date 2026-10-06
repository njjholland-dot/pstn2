// Core PSTN2 scenes shared by the Solution Overview and Law Enforcement decks:
//   insight   — the data already exists
//   how       — number discovery, the canonical explanation (SPECIFICATION.md §9)
//   regulator — one new field on Ofcom's numbering lists
// Numbers are from Ofcom's reserved TV/drama ranges; providers are fictional.

export const CP = {
    alpha: { name: 'Alpha Telecom', colour: 'blue', url: 'https://pstn2.alpha-telecom.example', block: '020 7946 0xxx' },
    bravo: { name: 'Bravo Networks', colour: 'green', url: 'https://pstn2.bravo-networks.example', block: '0161 496 0xxx' },
    charlie: { name: 'Charlie Comms', colour: 'amber', url: 'https://pstn2.charlie-comms.example', block: '0113 496 0xxx' },
};

const LIST = [
    { block: '020 7946 0', cp: 'Alpha Telecom', url: 'pstn2.alpha-telecom.example' },
    { block: '0161 496 0', cp: 'Bravo Networks', url: 'pstn2.bravo-networks.example' },
    { block: '0113 496 0', cp: 'Charlie Comms', url: 'pstn2.charlie-comms.example' },
    { block: '07700 900', cp: 'Mobile CP', url: null },
];

export const STEPS = ['Check the cache', 'Ofcom S1–S9 list', 'Ask the Range Holder', 'Follow a redirect', 'Cache &amp; go direct'];

// ─────────────────────────────────────────────────────────────────────────────
// The core insight: every provider already holds its own numbering data.
// ─────────────────────────────────────────────────────────────────────────────
export const insight = {
    build(s) {
        const W = 480, GAP = 144;
        const rows = {
            alpha: [{ n: '020 7946 0123', st: 'In service' }, { n: '020 7946 0222', st: 'In service' }],
            bravo: [{ n: '0161 496 0123', st: 'In service' }, { n: '0113 496 0456', st: 'Ported in' }],
            charlie: [{ n: '0113 496 0789', st: 'In service' }, { n: '0113 496 0456', st: 'Ported out → Bravo' }],
        };
        s.cps = ['alpha', 'bravo', 'charlie'].map((k, i) => {
            const c = s.card({ x: i * (W + GAP), y: 0, w: W, title: CP[k].name, sub: 'Its own number database', iconName: 'database', colour: CP[k].colour, compact: true });
            s.table(c, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'st', label: 'Status' }], rows: rows[k], colour: CP[k].colour });
            return c;
        });
        s.db = s.card({ x: 534, y: 290, w: 660, title: 'Central database', sub: 'One national copy of every number', iconName: 'database-zap', colour: 'red' });
        s.cross = s.el(s.icon('x', { size: 190, stroke: 2.2 }), { x: 534, y: 290, w: 660, h: 0, cls: 'so-cross', hidden: true, from: 'scale' });
        s.notNeeded = s.pill({ x: 1234, y: 328, text: 'Not needed', iconName: 'ban', colour: 'red' });
        s.ask = s.statement({ x: 0, y: 540, w: 1728, size: 54, html: 'Don’t centralise it. <em>Just ask the provider that holds it.</em>' });
        s.ask.style.textAlign = 'center';
    },
    cues: {
        a: (s) => { s.reveal(s.db); s.ring(s.db, { colour: 'red', size: 220 }); },
        b: async (s) => {
            await s.reveal(s.cps);
            s.cps.forEach((c) => s.activate(c));
            await s.wait(1600);
            s.cps.forEach((c) => s.activate(c, false));
        },
        c: async (s) => {
            s.dim(s.db);
            s.cross.style.height = `${s.db.offsetHeight}px`;
            await s.reveal(s.cross);
            s.reveal(s.notNeeded);
        },
        d: async (s) => {
            s.hide(s.notNeeded);
            s.activate(s.cps[0]); s.activate(s.cps[1]);
            const c = s.connect(s.cps[0], s.cps[1], { from: 'r', to: 'l', colour: 'blue', width: 4 });
            await c.done;
            s.reveal(s.ask);
            await s.packet(c, { colour: 'blue', label: 'ask', duration: 1000 });
            await s.packet(c, { colour: 'green', label: 'answer', duration: 1000, reverse: true });
        },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// How it works: cache → Ofcom list → Range Holder → redirect → cache, go direct.
// ─────────────────────────────────────────────────────────────────────────────
export const how = {
    build(s) {
        s.steps = s.steps({ x: 0, y: 0, w: 1728, items: STEPS });
        s.steps.el.classList.add('so-steps');

        s.alpha = s.card({ x: 0, y: 92, w: 460, title: 'Alpha Telecom', sub: 'Dials <span class="so-dial"></span>', iconName: 'phone-outgoing', colour: 'blue', compact: true, body: '<div class="so-label">Cache</div>' });
        s.dial = s.alpha.querySelector('.so-dial');
        s.cache = s.table(s.alpha, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'h', label: 'Held by' }], colour: 'blue' });
        s.cache.add({ n: '0161 496 0123', h: 'Bravo Networks' });

        s.list = s.card({ x: 0, y: 352, w: 460, title: 'Ofcom S1–S9 list', sub: 'Alpha’s local copy', iconName: 'file-text', colour: 'gold', compact: true,
            body: ' ' });
        s.listT = s.table(s.list, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }], colour: 'gold' });
        LIST.slice(0, 3).forEach((r) => s.listT.add({ b: r.block, r: r.cp }));
        s.url = document.createElement('div');
        s.url.className = 'so-url';
        s.url.innerHTML = `${s.icon('link', { size: 20 })}<span>pstn2.charlie-comms.example</span>`;
        s.list.body.append(s.url);

        s.charlie = s.card({ x: 1228, y: 92, w: 500, title: 'Charlie Comms', sub: 'Range Holder · 0113 496 0xxx', iconName: 'building-2', colour: 'amber', compact: true, body: ' ' });
        s.charlieT = s.table(s.charlie, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'st', label: 'Status' }], colour: 'amber',
            rows: [{ n: '0113 496 0789', st: 'In service' }, { n: '0113 496 0456', st: 'Ported out → Bravo' }] });

        s.bravo = s.card({ x: 1228, y: 404, w: 500, title: 'Bravo Networks', sub: 'Serves the ported number', iconName: 'building-2', colour: 'green', compact: true, body: ' ' });
        s.bravoT = s.table(s.bravo, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'st', label: 'Status' }], colour: 'green',
            rows: [{ n: '0113 496 0456', st: 'Ported in · from Charlie' }] });

        s.inv = s.msg({ x: 560, y: 210, w: 600, title: 'Any PSTN2 response can carry', colour: 'violet', iconName: 'refresh-cw', json: { cache: { invalidate: true, scope: 'number' } } });
        s.miss = s.pill({ x: 560, y: 340, text: 'No entry · cache miss', iconName: 'circle-x', colour: 'red' });
        s.held = s.pill({ x: 560, y: 432, text: 'Not ported: answers “held”', iconName: 'circle-check', colour: 'green' });
        s.redir = s.pill({ x: 560, y: 512, text: 'Ported: sends a redirect', iconName: 'forward', colour: 'amber' });
        s.next = s.pill({ x: 600, y: 190, text: 'Next time: straight to Bravo', iconName: 'phone-forwarded', colour: 'green' });
        s.noDb = s.statement({ x: 520, y: 600, w: 680, size: 44, html: 'No need for a <em>central database.</em>' });
    },
    cues: {
        a: async (s) => {
            await s.reveal([s.steps.el, s.alpha]);
            await s.wait(400);
            s.type(s.dial, '0113 496 0456', { cps: 14 });
        },
        b: (s) => { s.steps.set(0); s.activate(s.alpha); s.cache.highlight(0, 'blue'); },
        c: (s) => s.reveal(s.inv),
        d: async (s) => {
            s.hide(s.inv);
            s.cache.clearHighlight();
            s.reveal(s.miss);
            await s.wait(1200);
            s.steps.set(1);
            s.activate(s.alpha, false);
            await s.reveal(s.list);
            s.toList = s.connect({ x: 230, y: s.alpha.offsetTop + s.alpha.offsetHeight + 4 }, { x: 230, y: 348 }, { colour: 'gold', width: 4, duration: 500 });
            s.activate(s.list);
            await s.wait(500);
            s.listT.highlight(2, 'gold');
            await s.wait(600);
            s.url.classList.add('so-on');
        },
        e: async (s) => {
            s.hide(s.miss);
            s.toList.fade();
            s.activate(s.list, false);
            s.steps.set(2);
            await s.reveal(s.charlie);
            s.activate(s.charlie);
            s.c1 = s.connect({ x: 460, y: 150 }, { x: 1228, y: 150 }, { colour: 'blue', label: 'GET /pstn2/v1/numbers/441134960456' });
            await s.c1.done;
            await s.packet(s.c1, { colour: 'blue', label: 'GET', duration: 1300 });
        },
        f: (s) => { s.reveal(s.held); },
        g: async (s) => {
            s.charlieT.highlight(1, 'amber');
            s.dim(s.held);
            s.reveal(s.redir);
            s.activate(s.redir);
            s.steps.set(3);
            await s.packet(s.c1, { colour: 'amber', label: 'redirect → Bravo', duration: 1400, reverse: true });
            s.activate(s.charlie, false);
            await s.reveal(s.bravo);
            s.activate(s.bravo);
            s.c2 = s.connect({ x: 460, y: 232 }, { x: 1228, y: 470 }, { colour: 'blue' });
            await s.c2.done;
            await s.packet(s.c2, { colour: 'blue', label: 'GET', duration: 1100 });
            s.bravoT.highlight(0, 'green');
            await s.packet(s.c2, { colour: 'green', label: 'held', duration: 1100, reverse: true });
        },
        h: async (s) => {
            s.steps.set(4);
            s.activate(s.bravo, false);
            s.cache.add({ n: '0113 496 0456', h: 'Bravo Networks' }, { flash: true });
            s.cache.highlight(1, 'green');
            s.activate(s.alpha);
            await s.wait(900);
            s.c2.fade();
            s.dim(s.charlie);
            s.c1.fade();
            const d = s.connect({ x: 460, y: 232 }, { x: 1228, y: 470 }, { colour: 'green' });
            await d.done;
            s.reveal(s.next);
            await s.packet(d, { colour: 'green', duration: 1000 });
        },
        i: (s) => { s.steps.done(); s.activate(s.alpha, false); s.reveal(s.noDb); },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// The dependency: the regulator hosts one new field, the Range Holder URL.
// withNonParticipating adds segment "h": a block nobody answers for.
// ─────────────────────────────────────────────────────────────────────────────
export function regulator({ withNonParticipating = false } = {}) {
    return {
        build(s) {
            const rows = LIST.map((r) => `<tr><td class="p2-num">${r.block}</td><td>${r.cp}</td><td>Allocated</td><td class="so-newcol ${r.url ? 'so-mono' : 'so-none'}">${r.url || '— not participating'}</td></tr>`).join('');
            s.list = s.card({ x: 0, y: 0, w: 1110, title: 'Ofcom numbering list', sub: 'S1–S9 · the root of all UK numbering data', iconName: 'landmark', colour: 'gold',
                body: `<table class="p2-table"><thead><tr><th>Number block</th><th>Range Holder</th><th>Status</th><th class="so-newcol">+ Range Holder URL</th></tr></thead><tbody>${rows}</tbody></table>` });
            s.rows = [...s.list.querySelectorAll('tbody tr')];
            s.copies = ['alpha', 'bravo', 'charlie'].map((k, i) => s.card({ x: 1250, y: i * 126, w: 478, title: CP[k].name, sub: 'Downloads and caches the list', iconName: 'hard-drive', colour: CP[k].colour, compact: true }));
            s.globe = s.pill({ x: 0, y: 400, text: 'Guidance for other countries’ regulators', iconName: 'earth', colour: 'cyan' });
            s.mirrors = [
                s.pill({ x: 0, y: 486, text: 'Mirror', iconName: 'layers', colour: 'slate' }),
                s.pill({ x: 190, y: 486, text: 'Mirror', iconName: 'layers', colour: 'slate' }),
                s.pill({ x: 380, y: 486, text: 'Copies for resilience', iconName: 'shield-check', colour: 'green' }),
            ];
            s.alt = s.card({ x: 1000, y: 400, w: 728, title: 'If the regulator declines', sub: 'Another body becomes the source of truth', iconName: 'triangle-alert', colour: 'red', compact: true,
                body: `<div class="so-tags"><span class="so-t1">${s.tag('A new target for attack', 'red')}</span><span class="so-t2">${s.tag('Needs strict governance', 'amber')}</span></div>` });
            s.altTags = [s.alt.querySelector('.so-t1'), s.alt.querySelector('.so-t2')];
            s.altTags.forEach((t) => t.classList.add('p2-reveal', 'p2-from-up'));
            s.priority = s.statement({ x: 0, y: 584, w: 1000, size: 44, html: 'Priority: <em>Ofcom hosts one extra field.</em>' });
            if (withNonParticipating) {
                s.noQuery = s.pill({ x: 1000, y: 420, text: 'No PSTN2 for this block: no queries', iconName: 'ban', colour: 'red' });
            }
        },
        cues: {
            a: (s) => { s.reveal(s.list); },
            b: (s) => { s.reveal(s.globe); },
            c: async (s) => {
                s.activate(s.list);
                const cells = [...s.list.querySelectorAll('.so-newcol')];
                for (const [i, c] of cells.entries()) { await s.wait(i ? 240 : 0); c.classList.add('so-on'); }
            },
            d: async (s) => {
                s.activate(s.list, false);
                await s.reveal(s.copies);
                s.copies.forEach((c, i) => {
                    const conn = s.connect(s.list, c, { from: 'r', to: 'l', colour: 'gold', width: 3, dashed: true, fromOpts: { dy: -110 + i * 110 } });
                    s.wait(300 + i * 220).then(() => s.packet(conn, { colour: 'gold', label: 'download', duration: 1200 }));
                });
                await s.wait(900);
                s.reveal(s.mirrors);
            },
            e: (s) => { s.reveal(s.alt); s.activate(s.alt); },
            f: async (s) => { await s.reveal(s.altTags[0]); await s.wait(500); s.reveal(s.altTags[1]); },
            g: (s) => { s.activate(s.alt, false); s.dim(s.alt); s.reveal(s.priority); s.activate(s.list); },
            ...(withNonParticipating ? {
                h: (s) => {
                    s.activate(s.list, false);
                    s.hide(s.alt);
                    s.rows[3].classList.add('p2-hl');
                    s.rows[3].style.setProperty('--hl', s.colour('red'));
                    s.wait(300).then(() => s.reveal(s.noQuery));
                },
            } : {}),
        },
    };
}
