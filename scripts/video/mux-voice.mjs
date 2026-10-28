/**
 * Lays the ElevenLabs voice files (video/voice/v1..v8.*) onto the silent cut at
 * the segment starts from the last assemble run, normalises to -16 LUFS and
 * checks nothing overlaps or runs past 3:00.  ->  video/terracity-final.mp4
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

const STARTS = [0.3, 10.0, 21.4, 31.9, 45.9, 69.9, 81.8, 109.5]; // seconds in the silent cut
const VIDEO = 'video/terracity-silent.mp4';
const dur = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const files = STARTS.map((_, i) => {
  const hit = readdirSync('video/voice').find((f) => new RegExp(`^v${i + 1}\\.(mp3|wav|m4a)$`, 'i').test(f));
  if (!hit) throw new Error(`missing video/voice/v${i + 1}.mp3`);
  return `video/voice/${hit}`;
});
const videoLen = dur(VIDEO);
let ok = true;
files.forEach((f, i) => {
  const end = STARTS[i] + dur(f);
  const limit = STARTS[i + 1] ?? videoLen;
  const flag = end > limit ? `  <-- overlaps by ${(end - limit).toFixed(1)} s` : '';
  if (flag) ok = false;
  console.log(`v${i + 1}: ${STARTS[i].toFixed(1)}s -> ${end.toFixed(1)}s (limit ${limit.toFixed(1)}s)${flag}`);
});
if (!ok) console.log('Some lines are too long: trim them or speed them up slightly in ElevenLabs.');
const inputs = files.flatMap((f) => ['-i', f]);
const delays = files.map((_, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(STARTS[i] * 1000)}:all=1[a${i}]`);
const mix = `${files.map((_, i) => `[a${i}]`).join('')}amix=inputs=${files.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', VIDEO, ...inputs, '-filter_complex', [...delays, mix].join(';'),
  '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', 'video/terracity-final.mp4'], { stdio: 'inherit' });
const final = dur('video/terracity-final.mp4');
console.log(`final ${final.toFixed(1)} s ${final < 180 ? '(under 3:00)' : 'OVER 3:00'} -> video/terracity-final.mp4`);
if (!existsSync('video/terracity-final.mp4')) process.exit(1);
