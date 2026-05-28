#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import theme from '../theme.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'audio');
const tempDir = path.join(outputDir, '.tmp');
const sampleRate = 44100;

const sounds = {
  card_throw: { duration: 0.55, render: renderCardThrow },
  card_land: { duration: 0.28, render: renderCardLand },
  card_draw: { duration: 0.42, render: renderCardDraw },
  deck_shuffle: { duration: 0.9, render: renderDeckShuffle },
  card_function: { duration: 0.55, render: renderCardFunction },
  turn_ping: { duration: 0.45, render: renderTurnPing },
  makao: { duration: 0.9, render: renderMakao },
  round_win: { duration: 2.4, render: renderRoundWin },
  illegal_move: { duration: 0.5, render: renderIllegalMove }
};

function seededRandom(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(t, start, attack, releaseStart, end) {
  if (t < start || t > end) return 0;
  if (t < start + attack) return (t - start) / Math.max(attack, 0.001);
  if (t > releaseStart) return 1 - (t - releaseStart) / Math.max(end - releaseStart, 0.001);
  return 1;
}

function addNoise(buffer, start, duration, peak, seed, tone = 0.72) {
  const random = seededRandom(seed);
  let previous = 0;
  const startFrame = Math.floor(start * sampleRate);
  const endFrame = Math.min(buffer.length, Math.floor((start + duration) * sampleRate));

  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const t = frame / sampleRate;
    const local = t - start;
    const raw = random() * 2 - 1;
    previous = previous * tone + raw * (1 - tone);
    buffer[frame] += previous * peak * envelope(local, 0, duration * 0.12, duration * 0.78, duration);
  }
}

function addTone(buffer, start, duration, frequency, peak, options = {}) {
  const startFrame = Math.floor(start * sampleRate);
  const endFrame = Math.min(buffer.length, Math.floor((start + duration) * sampleRate));
  const endFrequency = options.endFrequency || frequency;
  const type = options.type || 'sine';

  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const t = frame / sampleRate;
    const local = t - start;
    const progress = local / duration;
    const currentFrequency = frequency + (endFrequency - frequency) * progress;
    const phase = 2 * Math.PI * currentFrequency * local;
    const wave = type === 'square'
      ? Math.sign(Math.sin(phase))
      : type === 'saw'
        ? 2 * (local * currentFrequency - Math.floor(0.5 + local * currentFrequency))
        : type === 'triangle'
          ? (2 / Math.PI) * Math.asin(Math.sin(phase))
          : Math.sin(phase);

    buffer[frame] += wave * peak * envelope(local, 0, options.attack || 0.012, duration * (options.releaseAt || 0.82), duration);
  }
}

function renderCardThrow(buffer) {
  addNoise(buffer, 0.03, 0.38, 0.34, 'card_throw', 0.86);
  addTone(buffer, 0.06, 0.32, 520, 0.045, { endFrequency: 220, type: 'triangle', releaseAt: 0.72 });
}

function renderCardLand(buffer) {
  addNoise(buffer, 0.02, 0.08, 0.28, 'card_land', 0.35);
  addTone(buffer, 0.015, 0.09, 190, 0.18, { endFrequency: 88, type: 'triangle', attack: 0.003 });
}

function renderCardDraw(buffer) {
  addNoise(buffer, 0.02, 0.28, 0.32, 'card_draw', 0.8);
  addTone(buffer, 0.03, 0.24, 260, 0.055, { endFrequency: 130, type: 'triangle' });
}

function renderDeckShuffle(buffer) {
  [0.02, 0.08, 0.14, 0.21, 0.28, 0.36, 0.45, 0.55, 0.64, 0.73].forEach((start, index) => {
    addNoise(buffer, start, 0.09, 0.18, `shuffle_${index}`, 0.42 + index * 0.03);
  });
}

function renderCardFunction(buffer) {
  addTone(buffer, 0.02, 0.28, 146, 0.24, { endFrequency: 82, type: 'triangle', attack: 0.004 });
  addTone(buffer, 0.08, 0.24, 740, 0.16, { endFrequency: 990, type: 'sine' });
  addNoise(buffer, 0.02, 0.12, 0.08, 'function_hit', 0.5);
}

function renderTurnPing(buffer) {
  addTone(buffer, 0.04, 0.25, 660, 0.22, { endFrequency: 880, type: 'sine' });
  addTone(buffer, 0.06, 0.23, 990, 0.08, { endFrequency: 1320, type: 'sine' });
}

function renderMakao(buffer) {
  addTone(buffer, 0.04, 0.28, 587, 0.24, { endFrequency: 659, type: 'sine' });
  addTone(buffer, 0.24, 0.42, 784, 0.23, { endFrequency: 1046, type: 'sine' });
  addTone(buffer, 0.25, 0.5, 1568, 0.045, { endFrequency: 2093, type: 'sine' });
}

function renderRoundWin(buffer) {
  const notes = [
    [523.25, 0.03, 0.2],
    [659.25, 0.23, 0.2],
    [783.99, 0.43, 0.22],
    [1046.5, 0.72, 0.28],
    [783.99, 1.03, 0.25],
    [987.77, 1.3, 0.3],
    [1174.66, 1.64, 0.46]
  ];
  notes.forEach(([frequency, start, duration]) => {
    addTone(buffer, start, duration, frequency, 0.18, { type: 'triangle', releaseAt: 0.78 });
    addTone(buffer, start + 0.015, duration, frequency * 1.5, 0.04, { type: 'sine', releaseAt: 0.72 });
  });
}

function renderIllegalMove(buffer) {
  addTone(buffer, 0.02, 0.34, 118, 0.28, { endFrequency: 88, type: 'saw', attack: 0.004 });
  addTone(buffer, 0.09, 0.25, 94, 0.16, { endFrequency: 74, type: 'square', attack: 0.004 });
}

function renderSound({ duration, render }) {
  const frameCount = Math.ceil(duration * sampleRate);
  const buffer = new Float32Array(frameCount);
  render(buffer);

  let peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  const targetPeak = 0.82 * theme.audio.sfxVolume;
  const gain = peak > targetPeak ? targetPeak / peak : 1;

  for (let frame = 0; frame < buffer.length; frame += 1) {
    buffer[frame] = Math.max(-1, Math.min(1, buffer[frame] * gain));
  }

  return buffer;
}

function writeString(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function wavBuffer(samples) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (const sample of samples) {
    view.setInt16(offset, Math.round(sample * 32767), true);
    offset += 2;
  }

  return Buffer.from(buffer);
}

function runFfmpeg(inputPath, outputPath, args) {
  const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, ...args, outputPath], {
    stdio: 'pipe'
  });

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${path.basename(outputPath)}: ${result.stderr.toString().trim()}`);
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  for (const [soundName, definition] of Object.entries(sounds)) {
    const wavPath = path.join(tempDir, `${soundName}.wav`);
    const samples = renderSound(definition);
    await writeFile(wavPath, wavBuffer(samples));
    runFfmpeg(wavPath, path.join(outputDir, `${soundName}.ogg`), ['-codec:a', 'libvorbis', '-q:a', '4']);
    runFfmpeg(wavPath, path.join(outputDir, `${soundName}.mp3`), ['-codec:a', 'libmp3lame', '-q:a', '5']);
  }

  await rm(tempDir, { recursive: true, force: true });
  console.log(`Generated ${Object.keys(sounds).length} sounds as .ogg and .mp3 in ${path.relative(projectRoot, outputDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
