// Cuts, levels and encodes the raw recordings in data-src/audio/ (see `npm run audio:fetch`)
// into the game's sound files, then writes the library the game loads and the attribution list.
//   - effects: trimmed, peak-normalised to -1 dBFS, mono MP3 (each cue's own volume is in src/audio/cues.ts)
//   - the battle loop: cross-faded end into start so it repeats without a seam
//   - music: loudness-normalised to -20 LUFS (quiet, behind the game), mono for the old 78 rpm transfers
// Requires ffmpeg on the PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOURCES, rawName } from './sources.mjs';

const root = process.cwd();
const rawDir = join(root, 'data-src', 'audio');
const outDir = join(root, 'src', 'audio', 'files');
const tmp = mkdtempSync(join(tmpdir(), 'wc-audio-'));
mkdirSync(outDir, { recursive: true });

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
/** For the measuring filters, which report on stderr. */
const ffmpegStderr = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' }).stderr;
const probe = (file, entry) =>
  execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', entry, '-of', 'csv=p=0', file]).toString().trim();
const probeDuration = (file) => Number(probe(file, 'format=duration'));

/** The raw file for a source, extracting the entry from a zip when there is one. */
function input(src) {
  const raw = join(rawDir, rawName(src.url));
  if (!existsSync(raw)) throw new Error(`Missing ${raw}: run npm run audio:fetch first.`);
  if (!src.zip) return raw;
  const out = join(tmp, `${src.out}-${src.zip.split('/').pop()}`);
  writeFileSync(out, execFileSync('unzip', ['-p', raw, src.zip], { maxBuffer: 1 << 28 }));
  return out;
}

/** Trim, correct the speed, clean and fade to an intermediate WAV. */
function cut(src, file) {
  const dur = probeDuration(file);
  const [start, end] = src.trim ?? [0, dur];
  const speed = src.speed ?? 1;
  const len = (Math.min(end, dur) - start) / speed;
  const fadeIn = src.fade?.[0] ?? 0.004;
  const fadeOut = src.fade?.[1] ?? Math.min(0.05, len / 4);
  const rate = Number(probe(file, 'stream=sample_rate'));
  const filters = [
    `atrim=start=${start}:end=${Math.min(end, dur)}`,
    'asetpts=PTS-STARTPTS',
    // Like correcting a turntable: pitch and tempo together.
    ...(speed !== 1 ? [`asetrate=${Math.round(rate * speed)}`, `aresample=${rate}`] : []),
    ...(src.filters ?? []),
    `afade=t=in:d=${fadeIn}`,
    `afade=t=out:st=${Math.max(0, len - fadeOut)}:d=${fadeOut}`,
  ];
  const wav = join(tmp, `${src.out}.wav`);
  ffmpeg(['-i', file, '-af', filters.join(','), '-ac', src.stereo ? '2' : '1', '-ar', '44100', wav]);
  return wav;
}

/** MP3 for every browser. Mono music is band-limited 78s, so 40 kbps at 32 kHz loses nothing audible. */
function encode(wav, src, filters) {
  const out = join(outDir, `${src.out}.mp3`);
  const music = src.kind === 'music';
  const bitrate = src.bitrate ?? (music ? (src.stereo ? '96k' : '40k') : '96k');
  const rate = music && !src.stereo ? '32000' : '44100';
  ffmpeg(['-i', wav, ...(filters.length ? ['-af', filters.join(',')] : []), '-map_metadata', '-1', '-ar', rate, '-c:a', 'libmp3lame', '-b:a', bitrate, out]);
  return out;
}

const peak = (wav) => Number(/max_volume: (-?[\d.]+) dB/.exec(ffmpegStderr(['-i', wav, '-af', 'volumedetect', '-f', 'null', '-']))?.[1] ?? 0);
const peakGain = (wav) => -1 - peak(wav);

/** An effect starts on its first sound (40 dB under its peak), so a click answers at once. */
function trimLead(wav, src) {
  const out = join(tmp, `${src.out}-lead.wav`);
  ffmpeg(['-i', wav, '-af', `silenceremove=start_periods=1:start_threshold=${peak(wav) - 40}dB:start_silence=0.003,afade=t=in:d=0.003`, out]);
  return out;
}

function loudnorm(wav) {
  const target = 'I=-20:TP=-2:LRA=11';
  const log = ffmpegStderr(['-i', wav, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  return `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
}

/** Mix extra recordings over the main one (e.g. a bell after typing), each cut like a source. */
function addLayers(wav, src) {
  let out = wav;
  (src.layers ?? []).forEach((layer, i) => {
    const lw = cut({ ...layer, out: `${src.out}-layer${i}` }, input({ ...layer, out: `${src.out}-layer${i}` }));
    const mixed = join(tmp, `${src.out}-mix${i}.wav`);
    const ms = Math.round((layer.delay ?? 0) * 1000);
    ffmpeg([
      '-i', out, '-i', lw,
      '-filter_complex', `[1]adelay=delays=${ms}:all=1,volume=${layer.gain ?? 0}dB[l];[0][l]amix=inputs=2:duration=longest:normalize=0`,
      mixed,
    ]);
    out = mixed;
  });
  return out;
}

/** Cross-fade the last `seconds` into the first, so the loop's end flows into its start. */
function seamless(wav, seconds) {
  const looped = join(tmp, `loop-${Date.now()}.wav`);
  const x = Math.min(seconds, probeDuration(wav) / 3);
  // The file is read twice: acrossfade needs all of its first input before the second, so asplit would stall.
  ffmpeg([
    '-i', wav,
    '-i', wav,
    '-filter_complex',
    `[0]atrim=start=${x},asetpts=PTS-STARTPTS[body];[1]atrim=end=${x},asetpts=PTS-STARTPTS[head];` +
      `[body][head]acrossfade=d=${x}:c1=qsin:c2=qsin`,
    looped,
  ]);
  return looped;
}

for (const f of readdirSync(outDir)) if (f.endsWith('.mp3')) rmSync(join(outDir, f));

const library = { cues: {}, battleLoop: null, music: [] };
for (const src of SOURCES) {
  let wav = addLayers(cut(src, input(src)), src);
  const filters = [];
  if (src.kind === 'effect') wav = trimLead(wav, src);
  if (src.kind === 'loop') wav = seamless(wav, src.crossfade ?? 2);
  if (src.kind === 'music') filters.push(loudnorm(wav));
  else filters.push(`volume=${(peakGain(wav) + (src.gain ?? 0)).toFixed(2)}dB`);
  const out = encode(wav, src, filters);
  console.log(`${src.out}.mp3  ${probeDuration(out).toFixed(1)} s  ${(readFileSync(out).length / 1024).toFixed(0)} KB`);
  if (src.kind === 'music') library.music.push({ file: src.out, title: src.title, ...(src.nations ? { nations: src.nations } : {}), ...(src.menu ? { menu: true } : {}) });
  else if (src.kind === 'loop') library.battleLoop = src.out;
  else (library.cues[src.cue] ??= []).push(src.out);
}
writeFileSync(join(outDir, 'library.json'), JSON.stringify(library, null, 2) + '\n');

// Attribution: regenerate the list between the markers in docs/ATTRIBUTION.md.
const attribution = join(root, 'docs', 'ATTRIBUTION.md');
const doc = readFileSync(attribution, 'utf8');
const rows = SOURCES.map((s) => `| \`${s.out}.mp3\` | ${s.title} | ${s.author} | ${s.licence} | [source](${s.page}) |`);
const table = ['| File | What | By | Licence | |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
const START = '<!-- audio:start -->';
const END = '<!-- audio:end -->';
if (doc.includes(START)) {
  writeFileSync(attribution, doc.slice(0, doc.indexOf(START) + START.length) + '\n' + table + '\n' + doc.slice(doc.indexOf(END)));
}
rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${SOURCES.length} files and library.json to src/audio/files/`);
