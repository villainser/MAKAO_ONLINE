#!/usr/bin/env node
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import theme from '../theme.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const defaultSourceDir = path.resolve(projectRoot, '..', 'source-assets', 'later_asset');
const sourceDir = process.env.LATER_CARD_SOURCE
  ? path.resolve(process.env.LATER_CARD_SOURCE)
  : defaultSourceDir;
const outputDir = path.join(projectRoot, 'public', 'cards', 'later');

const suits = {
  kier: 'hearts',
  karo: 'diamonds',
  trefl: 'clubs',
  pik: 'spades'
};

const fileMap = [
  ['backend_card/backend_card.png', 'back.webp'],
  ['joker/JokerB.png', 'joker-b.webp'],
  ['joker/JokerD.png', 'joker-d.webp'],
  ['joker/JokerB.png', 'joker-a.webp'],
  ...['2', '3', '4', '5', '6', '7', '8', '9', '10'].flatMap(rank =>
    Object.entries(suits).map(([sourceSuit, targetSuit]) => [`${rank}/${rank}${sourceSuit}.png`, `${rank}-${targetSuit}.webp`])
  ),
  ...Object.entries(suits).map(([sourceSuit, targetSuit]) => [`krol/Dudu_${sourceSuit}.png`, `king-${targetSuit}.webp`]),
  ['BUBU_DAMA/Dama_kier.png', 'queen-hearts.webp'],
  ['BUBU_DAMA/Dama_karo.png', 'queen-diamonds.webp'],
  ['BUBU_DAMA/Dama_Trefl.png', 'queen-clubs.webp'],
  ['BUBU_DAMA/Dama_pik.png', 'queen-spades.webp'],
  ...Object.entries(suits).map(([sourceSuit, targetSuit]) => [`Dudu_Walet/Walet_${sourceSuit}.png`, `jack-${targetSuit}.webp`]),
  ['Bubu_AS/AS_kier.png', 'ace-hearts.webp'],
  ['Bubu_AS/as_karo.png', 'ace-diamonds.webp'],
  ['Bubu_AS/as_trefl.png', 'ace-clubs.webp'],
  ['Bubu_AS/as_pik.png', 'ace-spades.webp']
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

function getNormalizeOptions(sourceRelativePath) {
  const folder = sourceRelativePath.split('/')[0];

  if (folder === '4') {
    return {
      crop: '94%x94%+0+0',
      clipInsetRatio: 0.058
    };
  }

  if (['BUBU_DAMA', 'krol', 'Dudu_Walet', 'Bubu_AS', 'joker', 'backend_card'].includes(folder)) {
    return {
      crop: null,
      clipInsetRatio: 0.024
    };
  }

  return {
    crop: null,
    clipInsetRatio: 0.048
  };
}

async function assertSourceExists() {
  try {
    const sourceStat = await stat(sourceDir);
    if (!sourceStat.isDirectory()) throw new Error();
  } catch {
    throw new Error(`Missing source dir: ${sourceDir}. Extract later_asset.zip to ../source-assets first or set LATER_CARD_SOURCE.`);
  }
}

function normalizeCard(sourcePath, outputPath, options = {}) {
  const { width, height, borderColor, faceColor, accentColor } = theme.cards;
  const outerRadius = Math.round(width * 0.055);
  const innerRadius = Math.round(width * 0.038);
  const outerInset = Math.round(width * 0.012);
  const clipInset = Math.round(width * (options.clipInsetRatio || 0.048));
  const innerInset = Math.round(width * 0.031);
  const quality = '88';
  const cropArgs = options.crop
    ? ['-gravity', 'center', '-crop', options.crop, '+repage']
    : [];

  run('magick', [
    sourcePath,
    '-auto-orient',
    '-colorspace', 'sRGB',
    ...cropArgs,
    '-filter', 'Lanczos',
    '-resize', `${width}x${height}!`,
    '-unsharp', '0x0.65+0.55+0.015',
    '-strip',
    '-write', 'mpr:resized',
    '+delete',
    '(',
      '-size', `${width}x${height}`,
      'xc:none',
      '-fill', '#ffffff',
      '-draw', `roundrectangle ${clipInset},${clipInset} ${width - clipInset - 1},${height - clipInset - 1} ${innerRadius},${innerRadius}`,
      '-write', 'mpr:clipMask',
      '+delete',
    ')',
    'mpr:resized',
    'mpr:clipMask',
    '-alpha', 'off',
    '-compose', 'CopyOpacity',
    '-composite',
    '-write', 'mpr:maskedCard',
    '+delete',
    '(',
      '-size', `${width}x${height}`,
      `xc:${faceColor}`,
    ')',
    'mpr:maskedCard',
    '-compose', 'Over',
    '-composite',
    '(',
      '-size', `${width}x${height}`,
      'xc:none',
      '-fill', 'none',
      '-stroke', '#ffffff',
      '-strokewidth', String(Math.round(width * 0.022)),
      '-draw', `roundrectangle ${outerInset},${outerInset} ${width - outerInset - 1},${height - outerInset - 1} ${outerRadius},${outerRadius}`,
      '-stroke', faceColor,
      '-strokewidth', String(Math.round(width * 0.018)),
      '-draw', `roundrectangle ${outerInset},${outerInset} ${width - outerInset - 1},${height - outerInset - 1} ${outerRadius},${outerRadius}`,
      '-stroke', borderColor,
      '-strokewidth', String(Math.round(width * 0.009)),
      '-draw', `roundrectangle ${outerInset + 1},${outerInset + 1} ${width - outerInset - 2},${height - outerInset - 2} ${outerRadius},${outerRadius}`,
      '-stroke', '#ffffff',
      '-strokewidth', String(Math.max(1, Math.round(width * 0.004))),
      '-draw', `roundrectangle ${innerInset},${innerInset} ${width - innerInset - 1},${height - innerInset - 1} ${innerRadius},${innerRadius}`,
      '-stroke', accentColor,
      '-strokewidth', String(Math.max(1, Math.round(width * 0.003))),
      '-draw', `roundrectangle ${innerInset - 7},${innerInset - 7} ${width - innerInset + 6},${height - innerInset + 6} ${innerRadius},${innerRadius}`,
    ')',
    '-compose', 'Over',
    '-composite',
    '-define', 'webp:method=6',
    '-quality', quality,
    outputPath
  ]);
}

async function main() {
  await assertSourceExists();
  await mkdir(outputDir, { recursive: true });

  for (const [sourceRelativePath, outputName] of fileMap) {
    const sourcePath = path.join(sourceDir, sourceRelativePath);
    const outputPath = path.join(outputDir, outputName);
    normalizeCard(sourcePath, outputPath, getNormalizeOptions(sourceRelativePath));
  }

  console.log(`Normalized ${fileMap.length} later-card assets into ${path.relative(projectRoot, outputDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
