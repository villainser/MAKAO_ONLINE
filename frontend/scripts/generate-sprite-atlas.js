#!/usr/bin/env node
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import theme from '../theme.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cardAssetPath = (theme.cards.assetBase || '/cards').replace(/^\/+/, '');
const cardDir = path.join(projectRoot, 'public', cardAssetPath);
const atlasDir = path.join(projectRoot, 'public', 'atlases');

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function listCardAssets() {
  const extension = `.${theme.cards.assetExtension || 'svg'}`;
  const files = await readdir(cardDir);
  return files
    .filter(file => file.endsWith(extension))
    .sort((a, b) => {
      if (a === 'back.svg') return -1;
      if (b === 'back.svg') return 1;
      return a.localeCompare(b);
    });
}

function buildCardsAtlas(files) {
  const { width: frameWidth, height: frameHeight } = theme.cards;
  const padding = theme.atlas.cardPadding;
  const columns = theme.atlas.cardColumns;
  const rows = Math.ceil(files.length / columns);
  const atlasWidth = columns * frameWidth + Math.max(0, columns - 1) * padding;
  const atlasHeight = rows * frameHeight + Math.max(0, rows - 1) * padding;

  const frames = files.map((file, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * (frameWidth + padding);
    const y = row * (frameHeight + padding);
    return {
      filename: file,
      frame: { x, y, w: frameWidth, h: frameHeight },
      rotated: false,
      trimmed: false,
      sourceSize: { w: frameWidth, h: frameHeight },
      spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight }
    };
  });

  const svgImages = frames.map(frame =>
    `<image href="../${esc(cardAssetPath)}/${esc(frame.filename)}" x="${frame.frame.x}" y="${frame.frame.y}" width="${frame.frame.w}" height="${frame.frame.h}"/>`
  ).join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${atlasWidth}" height="${atlasHeight}" viewBox="0 0 ${atlasWidth} ${atlasHeight}">
  <title>Makao cards atlas</title>
  ${svgImages}
</svg>
`;

  return {
    svg,
    json: {
      meta: {
        app: 'makao-generate-sprite-atlas',
        image: 'cards-atlas.svg',
        format: 'RGBA8888',
        scale: 1,
        size: { w: atlasWidth, h: atlasHeight }
      },
      frames
    }
  };
}

function buildVfxAtlas() {
  const size = theme.atlas.vfxSize;
  const frames = [
    { filename: 'spark', frame: { x: 0, y: 0, w: 64, h: 64 } },
    { filename: 'ring', frame: { x: 64, y: 0, w: 64, h: 64 } },
    { filename: 'burst', frame: { x: 128, y: 0, w: 64, h: 64 } },
    { filename: 'glint', frame: { x: 192, y: 0, w: 64, h: 64 } },
    { filename: 'trail', frame: { x: 0, y: 64, w: 128, h: 64 } },
    { filename: 'soft_dot', frame: { x: 128, y: 64, w: 64, h: 64 } }
  ].map(frame => ({
    ...frame,
    rotated: false,
    trimmed: false,
    sourceSize: { w: frame.frame.w, h: frame.frame.h },
    spriteSourceSize: { x: 0, y: 0, w: frame.frame.w, h: frame.frame.h }
  }));

  const accent = theme.cards.accentColor;
  const red = theme.cards.redSuit;
  const black = theme.cards.blackSuit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <title>Makao VFX atlas</title>
  <g id="spark" transform="translate(0 0)">
    <path d="M32 4 39 25 60 32 39 39 32 60 25 39 4 32 25 25Z" fill="${accent}" opacity="0.9"/>
  </g>
  <g id="ring" transform="translate(64 0)">
    <circle cx="32" cy="32" r="22" fill="none" stroke="${accent}" stroke-width="7" opacity="0.75"/>
  </g>
  <g id="burst" transform="translate(128 0)">
    <path d="M32 5v54M5 32h54M13 13l38 38M51 13 13 51" stroke="${red}" stroke-width="7" stroke-linecap="round" opacity="0.75"/>
  </g>
  <g id="glint" transform="translate(192 0)">
    <path d="M32 10c5 13 9 17 22 22-13 5-17 9-22 22-5-13-9-17-22-22 13-5 17-9 22-22Z" fill="#ffffff" opacity="0.9"/>
  </g>
  <g id="trail" transform="translate(0 64)">
    <path d="M14 34c21-25 55-28 100-8" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity="0.48"/>
    <path d="M16 44c29-12 62-10 96 7" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.42"/>
  </g>
  <g id="soft_dot" transform="translate(128 64)">
    <circle cx="32" cy="32" r="24" fill="${black}" opacity="0.28"/>
    <circle cx="32" cy="32" r="12" fill="${accent}" opacity="0.72"/>
  </g>
</svg>
`;

  return {
    svg,
    json: {
      meta: {
        app: 'makao-generate-sprite-atlas',
        image: 'vfx-atlas.svg',
        format: 'RGBA8888',
        scale: 1,
        size: { w: size, h: size }
      },
      frames
    }
  };
}

async function main() {
  await mkdir(atlasDir, { recursive: true });

  const cardFiles = await listCardAssets();
  const cardsAtlas = buildCardsAtlas(cardFiles);
  const vfxAtlas = buildVfxAtlas();

  await Promise.all([
    writeFile(path.join(atlasDir, 'cards-atlas.svg'), cardsAtlas.svg, 'utf8'),
    writeFile(path.join(atlasDir, 'cards-atlas.json'), `${JSON.stringify(cardsAtlas.json, null, 2)}\n`, 'utf8'),
    writeFile(path.join(atlasDir, 'vfx-atlas.svg'), vfxAtlas.svg, 'utf8'),
    writeFile(path.join(atlasDir, 'vfx-atlas.json'), `${JSON.stringify(vfxAtlas.json, null, 2)}\n`, 'utf8')
  ]);

  console.log(`Generated atlas metadata for ${cardFiles.length} card assets in ${path.relative(projectRoot, atlasDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
