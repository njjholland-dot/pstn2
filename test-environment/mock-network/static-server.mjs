#!/usr/bin/env node
// Serve a directory the way the pstn2.org static host does, for testing the dummy
// test CP locally before it is deployed:
//   • extensionless files (Number Discovery answers, keys) → application/json
//   • missing files → 404 with an HTML body (a static host's default)
//   • requests with no User-Agent, or curl/Go defaults, → 403 (the host's WAF)
//
// Usage: node static-server.mjs --dir /tmp/testcp-local --mount /testcp --port 47902
// Build the matching content first:
//   node tools/testcp/build.mjs --base http://127.0.0.1:47902/testcp --out /tmp/testcp-local

import http from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const dir = arg('--dir');
const mount = arg('--mount', '/testcp').replace(/\/$/, '');
const port = Number(arg('--port', 47902));
if (!dir) { console.error('usage: static-server.mjs --dir <path> [--mount /testcp] [--port 47902]'); process.exit(2); }

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '': 'application/json' };
const blockedAgent = (ua) => !ua || /^curl\//i.test(ua) || /^Go-http-client\//i.test(ua);

http.createServer((req, res) => {
    const ua = req.headers['user-agent'] || '';
    if (blockedAgent(ua)) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        return res.end('<html><body><h1>403 Forbidden</h1></body></html>');
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let rel = decodeURIComponent(url.pathname);
    if (!rel.startsWith(mount + '/') && rel !== mount) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>Not Found</h1>'); }
    rel = rel.slice(mount.length) || '/';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dir, rel));
    if (!file.startsWith(normalize(dir)) || /\/\.htaccess$/.test(file)) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>Not Found</h1>'); }
    try {
        if (!statSync(file).isFile()) throw new Error('not a file');
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
        res.end(readFileSync(file));
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>404 Not Found</h1></body></html>');
    }
}).listen(port, '127.0.0.1', () => console.log(`static host emulator: http://127.0.0.1:${port}${mount}/ → ${dir}`));
