#!/usr/bin/env node
// Render PSTN2 presentation narration to broadcast-ready audio.
//
//   node tools/narrate/build-narration.mjs                  # every deck with a narration.json
//   node tools/narrate/build-narration.mjs distributed-database test-harness
//   PSTN2_VOICE="Jamie (Premium)" node tools/narrate/build-narration.mjs --force
//   PSTN2_VOICE=system node tools/narrate/build-narration.mjs --force   # the macOS System Voice (e.g. a Siri voice)
//
// For each deck (animations/src/<deck>/narration.json) and each scene:
//   1. each segment's spoken text (lexicon applied) → macOS `say` → 48 kHz WAV
//      (cached by hash of voice + rate + text in tools/narrate/.cache, so only
//      changed lines are re-rendered)
//   2. segments joined with fixed pauses → one scene track
//   3. loudness-normalised (EBU R128 loudnorm, −16 LUFS integrated, −1.5 dBTP)
//      and encoded as 48 kHz mono MP3 → animations/src/<deck>/audio/<scene>.mp3
//   4. audio/manifest.json: per-scene duration and each segment's start/end
//      (the player fires visual cues from these times)
//
// Voice: $PSTN2_VOICE, else the best installed en-GB voice
// (Premium > Enhanced > Daniel). Requires: say, ffmpeg, ffprobe.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spoken } from '../../animations/shared/lexicon.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const srcDir = join(repo, 'animations', 'src');
const cacheDir = join(here, '.cache');
mkdirSync(cacheDir, { recursive: true });

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const decks = args.filter((a) => !a.startsWith('--'));

const LEAD_IN = 0.6;      // seconds of silence before the first line
const GAP = 0.45;         // between segments
const TAIL = 0.9;         // after the last line
const RATE = Number(process.env.PSTN2_RATE || 172); // words per minute
const SR = 48000;

// The macOS System Voice (Accessibility › Read & Speak). Siri voices are only
// reachable this way: `say` without -v speaks with the selected System Voice.
function systemVoiceId() {
    try {
        const out = execFileSync('defaults', ['read', 'com.apple.Accessibility', 'SpokenContentDefaultVoiceSelectionsByLanguage'], { encoding: 'utf8' });
        const m = out.match(/voiceId\s*=\s*"?([^";\n]+)"?/);
        return m ? m[1] : 'unknown';
    } catch { return 'unknown'; }
}

function pickVoice() {
    if (process.env.PSTN2_VOICE === 'system') return `system:${systemVoiceId()}`;
    if (process.env.PSTN2_VOICE) return process.env.PSTN2_VOICE;
    const list = execFileSync('say', ['-v', '?'], { encoding: 'utf8' }).split('\n');
    const gb = list.filter((l) => /\ben_GB\b/.test(l)).map((l) => l.replace(/\s+en_GB.*$/, '').trim());
    return gb.find((v) => /\(Premium\)/.test(v)) || gb.find((v) => /\(Enhanced\)/.test(v)) || gb.find((v) => /^Daniel\b/.test(v)) || gb[0] || 'Daniel';
}

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] });
const duration = (file) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

function renderSegment(voice, text) {
    const key = createHash('sha1').update(`${voice}|${RATE}|${SR}|${text}`).digest('hex').slice(0, 16);
    const wav = join(cacheDir, `${key}.wav`);
    if (existsSync(wav) && !FORCE) return wav;
    const aiff = join(tmpdir(), `p2-${key}.raw.wav`);
    const voiceArgs = voice.startsWith('system:') ? [] : ['-v', voice];
    run('say', [...voiceArgs, '-r', String(RATE), '-o', aiff, '--file-format=WAVE', '--data-format=LEI16@' + SR, text]);
    // trim leading/trailing digital silence so our own gaps are exact
    run('ffmpeg', ['-y', '-v', 'error', '-i', aiff,
        '-af', 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.05,areverse',
        '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    rmSync(aiff, { force: true });
    return wav;
}

function silence(sec) {
    const f = join(cacheDir, `silence-${sec.toFixed(2)}.wav`);
    if (!existsSync(f)) run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono`, '-t', sec.toFixed(3), '-c:a', 'pcm_s16le', f]);
    return f;
}

function buildDeck(deck, voice) {
    const dir = join(srcDir, deck);
    const narration = JSON.parse(readFileSync(join(dir, 'narration.json'), 'utf8'));
    const outDir = join(dir, 'audio');
    mkdirSync(outDir, { recursive: true });
    const manifestPath = join(outDir, 'manifest.json');
    const old = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
    const manifest = { deck, voice, rate: RATE, generated: new Date().toISOString(), loudness: '-16 LUFS / -1.5 dBTP', scenes: {} };

    for (const scene of narration.scenes) {
        const parts = [silence(LEAD_IN)];
        const segs = [];
        let t = LEAD_IN;
        const hash = createHash('sha1');
        scene.segments.forEach((seg, i) => {
            const text = spoken(seg.say || seg.text);
            const wav = renderSegment(voice, text);
            hash.update(wav);
            const d = duration(wav);
            segs.push({ id: seg.id, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
            parts.push(wav);
            t += d;
            const gap = i < scene.segments.length - 1 ? (seg.pauseAfter ?? GAP) : TAIL;
            parts.push(silence(gap));
            hash.update(String(gap));
            t += gap;
        });
        const file = `${scene.id}.mp3`;
        const out = join(outDir, file);
        const sig = hash.digest('hex').slice(0, 16);
        const prev = old?.scenes?.[scene.id];
        if (!FORCE && prev && prev.sig === sig && prev.voice === voice && existsSync(out)) {
            manifest.scenes[scene.id] = prev;
            continue;
        }
        const list = join(tmpdir(), `p2-${deck}-${scene.id}.txt`);
        writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
        run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
            '-af', 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', String(SR), '-ac', '1',
            '-c:a', 'libmp3lame', '-b:a', '128k', out]);
        rmSync(list, { force: true });
        const dur = duration(out);
        manifest.scenes[scene.id] = { file, duration: +dur.toFixed(3), voice, sig, segments: segs };
        process.stdout.write(`  ${deck}/${file}  ${dur.toFixed(1)}s  (${segs.length} segments)\n`);
    }
    // Interactive voice lines (phrases.json): one MP3 each in audio/phrases/
    const phrasesPath = join(dir, 'phrases.json');
    if (existsSync(phrasesPath)) {
        const { phrases } = JSON.parse(readFileSync(phrasesPath, 'utf8'));
        mkdirSync(join(outDir, 'phrases'), { recursive: true });
        manifest.phrases = {};
        for (const ph of phrases) {
            const wav = renderSegment(voice, spoken(ph.say || ph.text));
            const file = `phrases/${ph.id}.mp3`;
            const out = join(outDir, file);
            const sig = createHash('sha1').update(wav).digest('hex').slice(0, 16);
            if (FORCE || old?.phraseSigs?.[ph.id] !== sig || !existsSync(out)) {
                run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=9', '-ar', String(SR), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
            }
            manifest.phrases[ph.id] = file;
            (manifest.phraseSigs ||= {})[ph.id] = sig;
        }
        console.log(`  ${deck}: ${phrases.length} interactive phrases`);
    }
    // remove audio for scenes that no longer exist
    for (const f of readdirSync(outDir)) {
        if (f.endsWith('.mp3') && !Object.values(manifest.scenes).some((s) => s.file === f)) rmSync(join(outDir, f));
    }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
    const total = Object.values(manifest.scenes).reduce((a, s) => a + s.duration, 0);
    console.log(`✓ ${deck}: ${Object.keys(manifest.scenes).length} scenes, ${(total / 60).toFixed(1)} min, voice "${voice}"`);
}

const voice = pickVoice();
const all = readdirSync(srcDir).filter((d) => existsSync(join(srcDir, d, 'narration.json')));
const targets = decks.length ? decks : all;
console.log(`Narration voice: ${voice}${/Premium|Enhanced|siri/i.test(voice) ? '' : '  (standard quality — install a Premium/Enhanced en-GB voice for broadcast quality)'}`);
for (const d of targets) {
    if (!all.includes(d)) { console.error(`no narration.json for ${d}`); process.exitCode = 1; continue; }
    buildDeck(d, voice);
}
