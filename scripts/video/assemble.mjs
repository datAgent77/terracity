/**
 * Cuts the raw recording into the silent submission cut using the marks in
 * video/raw/manifest.json: build montages are sped up 2.5× (the on-screen
 * caption says so), everything else is real time. Upscales to 1920×1080.
 *   node scripts/video/assemble.mjs  ->  video/terracity-silent.mp4
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { marks } = JSON.parse(readFileSync('video/raw/manifest.json', 'utf8'));
const at = (n) => marks.find((m) => m.name === n).ms / 1000;
const FAST = 2.5;
const parts = [
  [at('s1-intro') - 0.3, at('s5-build-fast-start'), 1],
  [at('s5-build-fast-start'), at('s5-build-fast-end'), FAST],
  [at('s5-build-fast-end'), at('s7-plan-b-start'), 1],
  [at('s7-plan-b-start'), at('s7-plan-b-end'), FAST],
  [at('s7-plan-b-end'), at('end'), 1],
];
const filters = parts.map(
  ([a, b, k], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=(PTS-STARTPTS)/${k}[p${i}]`,
);
const concat = `${parts.map((_, i) => `[p${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[c]`;
const scale = `[c]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[v]`;
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', 'video/raw/terracity-raw.webm',
  '-filter_complex', [...filters, concat, scale].join(';'),
  '-map', '[v]', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
  'video/terracity-silent.mp4',
], { stdio: 'inherit' });
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'video/terracity-silent.mp4']).toString().trim();
// Segment start times in the final cut (for the voice-over script).
let t = 0;
const timeline = parts.map(([a, b, k]) => { const s = t; t += (b - a) / k; return { from: a, to: b, speed: k, cutStart: +s.toFixed(1), cutEnd: +t.toFixed(1) }; });
const cutTime = (ms) => {
  const x = ms / 1000;
  for (const p of timeline) if (x >= p.from && x <= p.to) return +(p.cutStart + (x - p.from) / p.speed).toFixed(1);
  return null;
};
console.log(`duration ${(+dur).toFixed(1)} s (limit 180)`);
for (const m of marks) console.log(`${m.name.padEnd(22)} cut ${cutTime(m.ms)} s`);
