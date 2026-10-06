// Law Enforcement Access — lawful data access with PSTN2 number discovery (protocol v1.1).
// Scenes 1, 2 and 7 are the Solution Overview core scenes, shared so both decks stay identical.
// Numbers are from Ofcom's reserved TV/drama ranges; providers are fictional.
import { createDeck } from '../../shared/pstn2-player.js';
import { CP, insight, how, regulator } from '../solution-overview/core-scenes.js';

const NUMBER = '0113 496 0456';

/** Charlie (Range Holder) and Bravo (current holder) on the right-hand side. */
function holders(s, { top = 0, gap = 340 } = {}) {
    const charlie = s.card({ x: 1228, y: top, w: 500, title: CP.charlie.name, sub: 'Range Holder · 0113 496 0xxx', iconName: 'building-2', colour: 'amber', compact: true, body: ' ' });
    const charlieT = s.table(charlie, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'st', label: 'Status' }], colour: 'amber',
        rows: [{ n: '0113 496 0789', st: 'In service' }, { n: NUMBER, st: 'Ported out → Bravo' }] });
    const bravo = s.card({ x: 1228, y: top + gap, w: 500, title: CP.bravo.name, sub: 'Holds the number today', iconName: 'building-2', colour: 'green', compact: true, body: ' ' });
    const bravoT = s.table(bravo, { columns: [{ key: 'n', label: 'Number', num: true }, { key: 'st', label: 'Status' }], colour: 'green',
        rows: [{ n: NUMBER, st: 'Ported in · from Charlie' }] });
    return { charlie, charlieT, bravo, bravoT };
}

function listCard(s, { x, y, w }) {
    const card = s.card({ x, y, w, title: 'Ofcom S1–S9 list', sub: 'Published numbering list', iconName: 'file-text', colour: 'gold', compact: true, body: ' ' });
    const t = s.table(card, { columns: [{ key: 'b', label: 'Block', num: true }, { key: 'r', label: 'Range Holder' }], colour: 'gold',
        rows: [{ b: '020 7946 0', r: CP.alpha.name }, { b: '0161 496 0', r: CP.bravo.name }, { b: '0113 496 0', r: CP.charlie.name }] });
    const url = document.createElement('div');
    url.className = 'so-url';
    url.innerHTML = `${s.icon('link', { size: 20 })}<span>pstn2.charlie-comms.example</span>`;
    card.body.append(url);
    return { card, t, url };
}

createDeck({
    scenes: {
        // 1 ─────────────────────────────────────────────────────────────
        insight,

        // 2 ─────────────────────────────────────────────────────────────
        how,

        // 3 ─────────────────────────────────────────────────────────────
        authorised: {
            build(s) {
                s.who = s.card({ x: 0, y: 0, w: 460, title: 'Authorised party', sub: `Looking up <span class="so-dial">${NUMBER}</span>`, iconName: 'user-check', colour: 'violet', compact: true });
                s.noCache = s.pill({ x: 0, y: 128, text: 'No cache logic needed', iconName: 'ban', colour: 'slate' });
                s.manual = s.pill({ x: 0, y: 206, text: 'Existing manual processes', iconName: 'list-checks', colour: 'slate' });
                s.l = listCard(s, { x: 0, y: 320, w: 460 });
                s.h = holders(s, { top: 0, gap: 330 });
                s.held = s.pill({ x: 560, y: 420, text: 'Not ported: answers “held”', iconName: 'circle-check', colour: 'green' });
                s.redir = s.pill({ x: 560, y: 500, text: 'Ported: sends a redirect', iconName: 'forward', colour: 'amber' });
            },
            cues: {
                a: (s) => { s.reveal(s.who); s.activate(s.who); },
                b: async (s) => { s.activate(s.who, false); await s.reveal(s.noCache); await s.wait(1200); s.reveal(s.manual); },
                c: async (s) => {
                    await s.reveal(s.l.card);
                    s.activate(s.l.card);
                    await s.wait(700);
                    s.l.t.highlight(2, 'gold');
                    await s.wait(600);
                    s.l.url.classList.add('so-on');
                },
                d: async (s) => {
                    s.activate(s.l.card, false);
                    await s.reveal([s.h.charlie, s.h.bravo]);
                    s.dim(s.h.bravo);
                    s.activate(s.h.charlie);
                    const y = 70;
                    const c1 = s.connect({ x: 460, y }, { x: 1228, y }, { colour: 'violet', label: 'GET /pstn2/v1/numbers/441134960456' });
                    await c1.done;
                    await s.packet(c1, { colour: 'violet', label: 'GET', duration: 1100 });
                    s.reveal(s.held);
                    await s.wait(1200);
                    s.h.charlieT.highlight(1, 'amber');
                    s.reveal(s.redir); s.activate(s.redir); s.dim(s.held);
                    await s.packet(c1, { colour: 'amber', label: 'redirect → Bravo', duration: 1200, reverse: true });
                    s.activate(s.h.charlie, false);
                    s.dim(s.h.bravo, false); s.activate(s.h.bravo);
                    const c2 = s.connect({ x: 460, y: 104 }, { x: 1228, y: 400 }, { colour: 'violet' });
                    await c2.done;
                    await s.packet(c2, { colour: 'violet', label: 'GET', duration: 1000 });
                    s.h.bravoT.highlight(0, 'green');
                    await s.packet(c2, { colour: 'green', label: 'held', duration: 1000, reverse: true });
                },
            },
        },

        // 4 ─────────────────────────────────────────────────────────────
        lookup: {
            build(s) {
                s.officer = s.card({ x: 0, y: 0, w: 640, title: 'Investigating officer', sub: 'Needs subscriber information', iconName: 'user-round-search', colour: 'violet', compact: true });
                s.page = s.el(`<div class="le-bar"><i></i><i></i><i></i><span>${s.icon('lock', { size: 16 })}PSTN2 lookup page</span></div>
                    <div class="le-pg">
                      <div class="le-src"><span class="le-s1">${s.icon('globe', { size: 20 })}From pstn2.org</span><span class="le-s2">${s.icon('laptop', { size: 20 })}Or a local copy</span></div>
                      <label>Phone number</label>
                      <div class="le-row"><div class="le-in"></div><div class="le-btn">${s.icon('search', { size: 22 })}Look up</div></div>
                      <div class="le-status"></div>
                    </div>`, { x: 0, y: 150, w: 640, h: 340, cls: 'le-page', hidden: true, from: 'up' });
                s.input = s.page.querySelector('.le-in');
                s.status = s.page.querySelector('.le-status');
                s.srcs = [s.page.querySelector('.le-s1'), s.page.querySelector('.le-s2')];
                s.h = holders(s, { top: 0, gap: 330 });
                s.pills = [
                    s.pill({ x: 0, y: 570, text: 'No central database', iconName: 'database-zap', colour: 'green' }),
                    s.pill({ x: 360, y: 570, text: 'No single point of failure', iconName: 'network', colour: 'green' }),
                    s.pill({ x: 790, y: 570, text: 'Direct to the providers', iconName: 'route', colour: 'green' }),
                ];
            },
            cues: {
                a: (s) => { s.reveal(s.officer); s.activate(s.officer); },
                b: async (s) => {
                    s.activate(s.officer, false);
                    await s.reveal(s.page);
                    s.srcs[0].classList.add('le-on');
                    await s.wait(1500);
                    s.srcs[1].classList.add('le-on');
                    await s.wait(500);
                    s.type(s.input, NUMBER, { cps: 14 });
                },
                c: async (s) => {
                    s.input.textContent = NUMBER;
                    await s.reveal([s.h.charlie, s.h.bravo]);
                    s.dim(s.h.bravo); s.activate(s.h.charlie);
                    s.status.textContent = 'Asking the Range Holder…';
                    const c1 = s.connect({ x: 640, y: 300 }, { x: 1228, y: 110 }, { colour: 'violet' });
                    await c1.done;
                    await s.packet(c1, { colour: 'violet', label: 'GET', duration: 1100 });
                    s.h.charlieT.highlight(1, 'amber');
                    await s.packet(c1, { colour: 'amber', label: 'redirect', duration: 1100, reverse: true });
                    s.activate(s.h.charlie, false); s.dim(s.h.bravo, false); s.activate(s.h.bravo);
                    s.status.textContent = 'Asking Bravo Networks…';
                    const c2 = s.connect({ x: 640, y: 420 }, { x: 1228, y: 430 }, { colour: 'violet' });
                    await c2.done;
                    await s.packet(c2, { colour: 'violet', label: 'GET', duration: 1000 });
                    s.h.bravoT.highlight(0, 'green');
                    await s.packet(c2, { colour: 'green', label: 'held', duration: 1000, reverse: true });
                    s.status.innerHTML = `${s.icon('circle-check', { size: 22 })}Held by Bravo Networks`;
                    s.status.classList.add('le-ok');
                },
                d: async (s) => { s.activate(s.h.bravo, false); for (const p of s.pills) { s.reveal(p); await s.wait(700); } },
            },
        },

        // 5 ─────────────────────────────────────────────────────────────
        data: {
            build(s) {
                s.cp = s.card({ x: 0, y: 0, w: 1728, title: CP.bravo.name, sub: `Holds <span class="so-dial">${NUMBER}</span> · its own customer records`, iconName: 'database', colour: 'green', compact: true });
                const card = (i, title, iconName, colour, items) => s.card({ x: i * 588, y: 140, w: 552, h: 330, title, iconName, colour,
                    body: `<ul class="le-list">${items.map((t) => `<li>${s.icon('check', { size: 22 })}${t}</li>`).join('')}</ul>` });
                s.cards = [
                    card(0, 'Customer data', 'user', 'blue', ['Name and address', 'Identity verification', 'Account status']),
                    card(1, 'Billing', 'receipt', 'amber', ['Payment records', 'Payment documents', 'Service plans']),
                    card(2, 'Calling history', 'history', 'violet', ['Call detail records', 'SMS and MMS logs', 'Data usage']),
                ];
                s.lock = s.pill({ x: 0, y: 540, text: 'Released only for a validated, lawful request', iconName: 'lock', colour: 'violet' });
                s.never = s.pill({ x: 660, y: 540, text: 'Never via number discovery', iconName: 'eye-off', colour: 'slate' });
            },
            cues: {
                a: (s) => { s.reveal(s.cp); s.activate(s.cp); },
                b: (s) => { s.activate(s.cp, false); s.reveal(s.cards[0]); },
                c: (s) => s.reveal(s.cards[1]),
                d: (s) => s.reveal(s.cards[2]),
                e: async (s) => { await s.reveal(s.never); await s.wait(600); s.reveal(s.lock); s.activate(s.lock); },
            },
        },

        // 6 ─────────────────────────────────────────────────────────────
        validate: {
            build(s) {
                s.q = s.statement({ x: 0, y: 0, w: 1728, size: 50, html: 'How does a provider know a request is <em>lawful?</em>' });
                const card = (i, title, sub, iconName, colour, text, tags) => s.card({ x: i * 440, y: 110, w: 408, h: 400, title, sub, iconName, colour,
                    body: `<div class="le-opt">${text}</div><div class="so-tagrow">${tags.map((t) => s.tag(t, colour)).join('')}</div>` });
                s.opts = [
                    card(0, 'Certificates', 'Digitally signed requests', 'file-key', 'blue', 'Agencies sign each request. Providers check the signature against a trusted list.', ['Tamper-proof']),
                    card(1, 'SPOC', 'Single Point of Contact', 'contact', 'cyan', 'Requests are routed through an authorised SPOC for each agency.', ['Audit trail']),
                    card(2, 'Access tokens', 'OAuth, time-limited', 'ticket', 'amber', 'Time-limited OAuth tokens from a trusted identity provider.', ['Revocable']),
                    card(3, 'Hybrid', 'Certificates + tokens', 'shield-check', 'green', 'Certificates prove identity. Tokens grant fine-grained, time-limited access.', ['Recommended']),
                ];
                s.open = s.pill({ x: 0, y: 570, text: 'Still to agree: who issues certificates and authorises requests', iconName: 'circle-help', colour: 'amber' });
            },
            cues: {
                a: (s) => s.reveal(s.q),
                b: async (s) => { await s.reveal(s.opts[0]); await s.wait(1800); s.reveal(s.opts[1]); },
                c: (s) => s.reveal(s.opts[2]),
                d: async (s) => { await s.reveal(s.opts[3]); s.activate(s.opts[3]); s.opts.slice(0, 3).forEach((o) => o.classList.add('le-soft')); },
                e: (s) => s.reveal(s.open),
            },
        },

        // 7 ─────────────────────────────────────────────────────────────
        regulator: regulator({ withNonParticipating: true }),

        // 8 ─────────────────────────────────────────────────────────────
        learn: {
            build(s) {
                s.site = s.statement({ x: 0, y: 0, w: 1728, size: 96, html: '<em>pstn2.org</em>' });
                s.site.style.textAlign = 'center';
                const cta = (i, iconName, title, sub, href, colour) => s.el(`<a class="so-cta" href="${href}"><div class="p2-chip" style="--c:var(--${colour})">${s.icon(iconName, { size: 38 })}</div><div><div class="p2-card-title">${title}</div><small>${sub}</small></div></a>`, { x: i * 588, y: 160, w: 552, cls: 'p2-card', colour, hidden: true });
                s.ctas = [
                    cta(0, 'code', 'Download the code', 'TypeScript · Python · Go', '../../code/', 'blue'),
                    cta(1, 'book-open', 'Read the specification', 'PSTN2 protocol v1.1', '../../docs/SPECIFICATION.md', 'green'),
                    cta(2, 'presentation', 'Watch the series', 'Every PSTN2 presentation', '../../index.html', 'violet'),
                ];
                const topics = [['shield-check', 'Caller ID authentication', 'blue'], ['badge-check', 'Identification', 'gold'], ['lock', 'Encryption', 'violet'], ['route', 'Direct routing', 'green'], ['workflow', 'Porting and 999 messaging', 'cyan']];
                s.topicRow = s.el(topics.map(([ic, t, c]) => `<span class="p2-pill p2-reveal p2-from-scale" style="--c:${s.colour(c)}">${s.icon(ic, { size: 28 })}<span>${t}</span></span>`).join(''), { x: 0, y: 340, w: 1728, cls: 'le-pillrow' });
                s.topics = [...s.topicRow.children];
                s.close = s.statement({ x: 0, y: 470, w: 1728, size: 50, html: 'No central database, and none of its cost.<br><em>Direct, verified queries, from any browser.</em>' });
                s.close.style.textAlign = 'center';
            },
            cues: {
                a: async (s) => { await s.reveal(s.site); s.reveal(s.ctas); },
                b: async (s) => { for (const t of s.topics) { s.reveal(t); await s.wait(650); } },
                c: (s) => s.reveal(s.close),
            },
        },
    },
});
