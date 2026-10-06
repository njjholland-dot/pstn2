// Scene-building toolkit for PSTN2 presentations.
//
// Every scene gets an `s` object (createSceneApi) bound to its own content area:
// a 1728 × 670 stage-pixel box. Elements are absolutely positioned in those
// coordinates, so layouts are exact and identical at any screen size.
//
//   s.card({...}) s.table(card, {...}) s.bullets({...}) s.stat({...}) s.pill({...})
//   s.statement({...}) s.msg({...}) s.connect(a, b, {...}) s.packet(conn, {...})
//   s.reveal(el) s.hide(el) s.dim(el) s.wait(ms) s.t(ms) s.icon(name)
//
// Timing: always use s.t(ms) / s.wait(ms) so capture mode (screenshots) and
// reduced-motion settings work. Nothing here depends on wall-clock time.

import { icon } from './icons.js';

export const COLOURS = {
    blue: '#3b82f6', blue2: '#60a5fa', green: '#10b981', green2: '#34d399', amber: '#f59e0b', amber2: '#fbbf24',
    red: '#ef4444', red2: '#f87171', violet: '#8b5cf6', violet2: '#a78bfa', cyan: '#06b6d4', pink: '#ec4899',
    gold: '#eab308', slate: '#94a3b8', white: '#f1f5f9',
};
const MARKERS = ['blue', 'green', 'amber', 'red', 'violet', 'cyan', 'pink', 'gold', 'slate', 'white'];
const colourOf = (c) => COLOURS[c] || c || COLOURS.blue;
const markerOf = (c) => {
    const name = Object.keys(COLOURS).find((k) => COLOURS[k] === colourOf(c) && MARKERS.includes(k));
    return name || 'white';
};

export const W = 1728;
export const H = 670;

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/**
 * JSON with syntax colouring (HTML). Top-level keys one per line; nested objects
 * stay inline (compact) unless { expand: true }, so protocol messages fit on stage.
 */
export function jsonHtml(obj, { expand = false } = {}) {
    const inline = (v) => JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ').replace(/\{ /g, '{ ').replace(/ \}/g, ' }').replace(/\[ /g, '[').replace(/ \]/g, ']');
    const json = expand || obj === null || typeof obj !== 'object'
        ? JSON.stringify(obj, null, 2)
        : '{\n' + Object.entries(obj).map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)}`).join(',\n') + '\n}';
    return esc(json).replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g, (m, str, colon, kw) => {
        if (str) return colon ? `<span class="k">${str}</span><span class="p">:</span>` : `<span class="s">${str}</span>`;
        if (kw) return `<span class="b">${m}</span>`;
        return `<span class="n">${m}</span>`;
    });
}

export function createSceneApi(sceneEl, { capture = false, reducedMotion = false, d3 = window.d3 } = {}) {
    const W = sceneEl.offsetWidth || 1728;
    const H = sceneEl.offsetHeight || 670;
    const layer = document.createElement('div');
    layer.className = 'p2-layer';
    const top = document.createElement('div');
    top.className = 'p2-layer p2-layer-top';
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'p2-svg');
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.style.width = `${W}px`;
    svgEl.style.height = `${H}px`;
    sceneEl.append(svgEl, layer, top);

    const svg = d3.select(svgEl);
    const defs = svg.append('defs');
    for (const m of MARKERS) {
        defs.append('marker').attr('id', `p2-arrow-${m}-${sceneEl.dataset.uid}`)
            .attr('viewBox', '0 0 12 12').attr('refX', 10).attr('refY', 6)
            .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto-start-reverse')
            .append('path').attr('d', 'M1,1 L11,6 L1,11 L4,6 z').attr('fill', COLOURS[m]);
    }
    const glow = defs.append('filter').attr('id', `p2-glow-${sceneEl.dataset.uid}`).attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', 6).attr('result', 'b');
    const fm = glow.append('feMerge');
    fm.append('feMergeNode').attr('in', 'b');
    fm.append('feMergeNode').attr('in', 'SourceGraphic');
    const linkLayer = svg.append('g').attr('class', 'p2-links');
    const packetLayer = svg.append('g').attr('class', 'p2-packets');

    let alive = true;
    const timers = new Set();

    const s = {
        root: layer, top, svg, svgEl, d3, W, H, capture, COLOURS,
        get alive() { return alive; },
        dispose() { alive = false; for (const t of timers) clearTimeout(t); timers.clear(); },

        t(ms) { return capture ? 0 : reducedMotion ? Math.min(ms, 200) : ms; },
        wait(ms) {
            if (capture) return Promise.resolve();
            return new Promise((resolve) => {
                const id = setTimeout(() => { timers.delete(id); if (alive) resolve(); }, s.t(ms));
                timers.add(id);
            });
        },
        icon(name, opts) { return icon(name, opts); },
        colour: colourOf,

        /** Absolutely positioned element. `hidden` = start hidden, ready for s.reveal(). */
        el(html, { x = 0, y = 0, w, h, cls = '', style = '', parent, hidden = false, from = 'up', tag = 'div', colour } = {}) {
            const node = document.createElement(tag);
            node.className = `p2-abs ${cls}`.trim();
            node.style.cssText = `left:${x}px;top:${y}px;${w != null ? `width:${w}px;` : ''}${h != null ? `height:${h}px;` : ''}${colour ? `--c:${colourOf(colour)};` : ''}${style}`;
            if (html instanceof Node) node.append(html); else if (html != null) node.innerHTML = html;
            if (hidden) node.classList.add('p2-reveal', `p2-from-${from}`);
            (parent || layer).append(node);
            return node;
        },

        reveal(target, { delay = 0, from } = {}) {
            const els = Array.isArray(target) ? target : [target];
            return Promise.all(els.map((el, i) => new Promise((resolve) => {
                if (!el) return resolve();
                el.classList.add('p2-reveal');
                if (from) el.classList.add(`p2-from-${from}`);
                const go = () => {
                    if (!alive) return;
                    el.classList.remove('p2-gone');
                    el.classList.add('p2-shown');
                    resolve();
                };
                const d = s.t(delay + (Array.isArray(target) ? i * (from === 'fade' ? 120 : 160) : 0));
                if (capture) { go(); return; }
                // two frames so the starting state is painted first
                requestAnimationFrame(() => requestAnimationFrame(() => { const id = setTimeout(go, d); timers.add(id); }));
            })));
        },
        hide(el) { if (el) { el.classList.remove('p2-shown'); el.classList.add('p2-gone'); } },
        dim(el, on = true) { if (el) el.classList.toggle('p2-dim', on); },
        activate(el, on = true) { if (el) el.classList.toggle('p2-active', on); },

        /** A labelled box: CP, regulator, database, phone … */
        card({ x, y, w, h, title, sub = '', iconName, colour = 'blue', body = '', compact = false, hidden = true, from = 'up', cls = '' }) {
            const chip = iconName ? `<div class="p2-chip">${icon(iconName, { size: compact ? 30 : 36 })}</div>` : '';
            const html = `<div class="p2-card-head">${chip}<div><div class="p2-card-title">${title}</div>${sub ? `<div class="p2-card-sub">${sub}</div>` : ''}</div></div>${body ? `<div class="p2-card-body">${body}</div>` : ''}`;
            const el = s.el(html, { x, y, w, h, cls: `p2-card ${compact ? 'p2-compact' : ''} ${cls}`, colour, hidden, from });
            el.body = el.querySelector('.p2-card-body');
            return el;
        },

        /** A data table appended to a card (or any element). */
        table(parent, { columns, rows = [], colour }) {
            const t = document.createElement('table');
            t.className = 'p2-table';
            t.innerHTML = `<thead><tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead><tbody></tbody>`;
            const tbody = t.querySelector('tbody');
            (parent.body || parent).append(t);
            const api = {
                el: t,
                rows: [],
                add(row, { flash = false, cls = '' } = {}) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = columns.map((c) => `<td class="${c.num ? 'p2-num' : ''}">${row[c.key] ?? ''}</td>`).join('');
                    if (cls) tr.className = cls;
                    if (flash && !capture) tr.classList.add('p2-new');
                    tbody.append(tr);
                    api.rows.push(tr);
                    return tr;
                },
                highlight(i, c = colour || 'blue') {
                    api.rows.forEach((r, j) => r.classList.toggle('p2-hl', j === i));
                    if (api.rows[i]) api.rows[i].style.setProperty('--hl', colourOf(c));
                    return api.rows[i];
                },
                clearHighlight() { api.rows.forEach((r) => r.classList.remove('p2-hl')); },
                remove(i) { const r = api.rows[i]; if (r) { r.remove(); api.rows.splice(i, 1); } },
                clear() { tbody.innerHTML = ''; api.rows = []; },
            };
            rows.forEach((r) => api.add(r));
            return api;
        },

        bullets({ x, y, w, items, gap }) {
            const ul = s.el('', { x, y, w, tag: 'ul', cls: 'p2-bullets' });
            const lis = items.map((it) => {
                const li = document.createElement('li');
                li.style.setProperty('--c', colourOf(it.colour || 'blue'));
                if (gap != null) li.style.marginBottom = `${gap}px`;
                li.innerHTML = `${it.icon ? `<div class="p2-chip">${icon(it.icon, { size: 32 })}</div>` : ''}<div>${it.text}${it.sub ? `<small>${it.sub}</small>` : ''}</div>`;
                li.classList.add('p2-reveal', 'p2-from-left');
                ul.append(li);
                return li;
            });
            return { el: ul, items: lis };
        },

        stat({ x, y, w, value, label, colour = 'white', hidden = true }) {
            return s.el(`<div class="p2-stat-value">${value}</div><div class="p2-stat-label">${label}</div>`, { x, y, w, cls: 'p2-stat', colour, hidden, from: 'scale' });
        },
        countUp(el, to, { from = 0, duration = 1400, format = (v) => Math.round(v).toLocaleString('en-GB') } = {}) {
            const target = el.querySelector('.p2-stat-value') || el;
            if (capture) { target.textContent = format(to); return Promise.resolve(); }
            return new Promise((resolve) => {
                const start = performance.now();
                const tick = (now) => {
                    if (!alive) return resolve();
                    const k = Math.min(1, (now - start) / s.t(duration));
                    const e = 1 - Math.pow(1 - k, 3);
                    target.textContent = format(from + (to - from) * e);
                    if (k < 1) requestAnimationFrame(tick); else resolve();
                };
                requestAnimationFrame(tick);
            });
        },

        statement({ x, y, w, html, size, hidden = true, from = 'up', cls = '' }) {
            return s.el(html, { x, y, w, cls: `p2-statement ${cls}`, hidden, from, style: size ? `font-size:${size}px;` : '' });
        },
        lead({ x, y, w, html, size, hidden = true, from = 'up' }) {
            return s.el(html, { x, y, w, cls: 'p2-lead', hidden, from, style: size ? `font-size:${size}px;` : '' });
        },
        pill({ x, y, text, iconName, colour = 'blue', hidden = true, from = 'scale' }) {
            return s.el(`${iconName ? icon(iconName, { size: 28 }) : ''}<span>${text}</span>`, { x, y, cls: 'p2-pill', colour, hidden, from });
        },
        tag(text, colour = 'slate') { return `<span class="p2-tag" style="--c:${colourOf(colour)}">${text}</span>`; },

        /** A protocol message bubble showing real JSON. */
        msg({ x, y, w, title, json, text, colour = 'blue', iconName, hidden = true, from = 'scale', parent, expand = false }) {
            const head = title ? `<div class="p2-msg-h">${iconName ? icon(iconName, { size: 18 }) : ''}${title}</div>` : '';
            const bodyHtml = json !== undefined ? jsonHtml(json, { expand }) : esc(text || '');
            return s.el(`${head}${bodyHtml}`, { x, y, w, cls: 'p2-msg', colour, hidden, from, parent: parent || top });
        },

        /** Point on an element's edge, in content coordinates. */
        anchor(el, side = 'c', { dx = 0, dy = 0 } = {}) {
            if (!(el instanceof Element)) return { x: el.x + dx, y: el.y + dy };
            let x = el.offsetLeft, y = el.offsetTop;
            let p = el.offsetParent;
            while (p && p !== layer && p !== top && p !== sceneEl) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; }
            const w = el.offsetWidth, h = el.offsetHeight;
            const pts = {
                c: [x + w / 2, y + h / 2], l: [x, y + h / 2], r: [x + w, y + h / 2], t: [x + w / 2, y], b: [x + w / 2, y + h],
                tl: [x, y], tr: [x + w, y], bl: [x, y + h], br: [x + w, y + h],
            }[side];
            return { x: pts[0] + dx, y: pts[1] + dy };
        },

        /**
         * Draw a connector between two elements or points.
         * opts: from/to sides, colour, dashed, bend (-1..1 curve), label, arrow, width, duration, draw.
         */
        connect(a, b, { from = 'r', to = 'l', colour = 'slate', dashed = false, bend = 0, label = '', labelDy = -16, arrow = true, width = 4, duration = 900, draw = true, opacity = 1, fromOpts, toOpts } = {}) {
            const p1 = s.anchor(a, from, fromOpts);
            const p2 = s.anchor(b, to, toOpts);
            const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const cx = mx - dy * bend * 0.5, cy = my + dx * bend * 0.5;
            const d = bend ? `M${p1.x},${p1.y} Q${cx},${cy} ${p2.x},${p2.y}` : `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
            const g = linkLayer.append('g').attr('opacity', opacity);
            const c = colourOf(colour);
            const path = g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', c).attr('stroke-width', width)
                .attr('stroke-linecap', 'round');
            if (arrow) path.attr('marker-end', `url(#p2-arrow-${markerOf(colour)}-${sceneEl.dataset.uid})`);
            const len = path.node().getTotalLength();
            let labelNode = null;
            if (label) {
                const pt = path.node().getPointAtLength(len / 2);
                labelNode = g.append('text').attr('class', 'p2-conn-label').attr('x', pt.x).attr('y', pt.y + labelDy).attr('text-anchor', 'middle').text(label);
            }
            const conn = { g, path, node: path.node(), len, p1, p2, remove: () => g.remove(), fade: (ms = 500) => g.transition().duration(s.t(ms)).attr('opacity', 0).remove() };
            if (dashed) {
                path.attr('stroke-dasharray', '10 12');
                if (draw && !capture) { g.attr('opacity', 0).transition().duration(s.t(duration * 0.6)).attr('opacity', opacity); }
                conn.done = s.wait(duration * 0.6);
            } else if (draw && !capture) {
                path.attr('stroke-dasharray', `${len} ${len}`).attr('stroke-dashoffset', len)
                    .transition().duration(s.t(duration)).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0)
                    .on('end', () => path.attr('stroke-dasharray', null));
                if (labelNode) labelNode.attr('opacity', 0).transition().delay(s.t(duration * 0.6)).duration(s.t(400)).attr('opacity', 1);
                conn.done = s.wait(duration);
            } else {
                conn.done = Promise.resolve();
            }
            return conn;
        },

        /** Animate a glowing message packet along a connector. Resolves on arrival. */
        packet(conn, { colour = 'blue', label = '', duration = 1100, reverse = false, size = 11, keep = false } = {}) {
            const c = colourOf(colour);
            const g = packetLayer.append('g').attr('class', 'p2-packet').style('--c', c);
            g.append('circle').attr('r', size * 2.2).attr('fill', c).attr('opacity', 0.18);
            g.append('circle').attr('r', size).attr('fill', c).attr('stroke', '#fff').attr('stroke-width', 2.5);
            let text = null;
            if (label) text = g.append('text').attr('class', 'p2-packet-label').attr('y', -size - 14).attr('text-anchor', 'middle').attr('fill', c).text(label);
            const node = conn.node;
            const len = node.getTotalLength();
            const place = (k) => {
                const p = node.getPointAtLength(reverse ? len * (1 - k) : len * k);
                g.attr('transform', `translate(${p.x},${p.y})`);
            };
            const finish = () => { if (!keep) g.transition().duration(s.t(250)).attr('opacity', 0).remove(); };
            if (capture) { place(1); finish(); return Promise.resolve(g); }
            return new Promise((resolve) => {
                const start = performance.now();
                const dur = s.t(duration);
                const tick = (now) => {
                    if (!alive) return resolve(g);
                    const k = Math.min(1, (now - start) / Math.max(dur, 1));
                    place(d3.easeCubicInOut(k));
                    if (k < 1) requestAnimationFrame(tick); else { finish(); resolve(g); }
                };
                place(0);
                requestAnimationFrame(tick);
            });
        },

        /** Expanding ring to draw the eye. */
        ring(target, { colour = 'green', size = 120, duration = 3200 } = {}) {
            const p = target instanceof Element ? s.anchor(target, 'c') : target;
            const r = s.el('', { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size, cls: 'p2-ring', colour, parent: top });
            if (!capture) { const id = setTimeout(() => r.remove(), s.t(duration)); timers.add(id); } else r.remove();
            return r;
        },

        /** Numbered process rail. set(i) marks step i active and earlier steps done. */
        steps({ x, y, w, items, colour = 'blue' }) {
            const el = s.el(items.map((it, i) => `<div class="p2-step"><b>STEP ${i + 1}</b>${it}</div>`).join(''), { x, y, w, cls: 'p2-steps', colour, hidden: true });
            const nodes = [...el.children];
            return {
                el,
                set(i) { nodes.forEach((n, j) => { n.classList.toggle('p2-active', j === i); n.classList.toggle('p2-done', j < i); }); },
                done() { nodes.forEach((n) => { n.classList.remove('p2-active'); n.classList.add('p2-done'); }); },
            };
        },

        /** Type text into an element character by character. */
        type(el, text, { cps = 28 } = {}) {
            if (capture) { el.textContent = text; return Promise.resolve(); }
            return new Promise((resolve) => {
                let i = 0;
                const step = () => {
                    if (!alive) return resolve();
                    el.textContent = text.slice(0, ++i);
                    if (i < text.length) { const id = setTimeout(step, 1000 / cps); timers.add(id); } else resolve();
                };
                step();
            });
        },
    };
    return s;
}
