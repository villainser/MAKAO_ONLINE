#!/usr/bin/env node
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import theme from '../theme.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cardAssetPath = (theme.cards.assetBase || '/cards').replace(/^\/+/, '');
const cardSourceDir = path.join(projectRoot, 'public', cardAssetPath);
const audioSourceDir = path.join(projectRoot, 'public', 'audio');
const nativeRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'native');
const nativeCardsDir = path.join(nativeRoot, 'cards');
const nativeAudioDir = path.join(nativeRoot, 'audio');

const frameWidth = theme.cards.width;
const frameHeight = theme.cards.height;
const nativePadding = 4;
const atlasRowsPerPage = 5;
const cellWidth = frameWidth + nativePadding * 2;
const cellHeight = frameHeight + nativePadding * 2;

const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'ace'];
const nativeRows = [
  ...ranks.map(rank => suits.map(suit => `${rank}-${suit}`)),
  ['joker-a', 'joker-b', 'joker-d', 'back']
];
const cardNames = [
  ...nativeRows.flat()
];
const audioNames = [
  'card_draw',
  'card_throw',
  'card_land',
  'deck_shuffle',
  'card_function',
  'turn_ping',
  'makao',
  'round_win',
  'illegal_move'
];

async function mustExist(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error();
  } catch {
    throw new Error(`Missing required asset: ${filePath}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr.toString().trim()}`);
  }
}

function pageFileName(pageIndex) {
  return pageIndex === 0 ? 'cards.png' : `cards${pageIndex + 1}.png`;
}

function buildPages(sheetWidth) {
  return Array.from({ length: Math.ceil(nativeRows.length / atlasRowsPerPage) }, (_, pageIndex) => {
    const firstRow = pageIndex * atlasRowsPerPage;
    const rowCount = Math.min(atlasRowsPerPage, nativeRows.length - firstRow);
    return {
      index: pageIndex,
      file: pageFileName(pageIndex),
      firstRow,
      rowCount,
      width: sheetWidth,
      height: rowCount * cellHeight
    };
  });
}

function frameForGrid(row, column) {
  const pageIndex = Math.floor(row / atlasRowsPerPage);
  const rowInPage = row % atlasRowsPerPage;
  return {
    pageIndex,
    page: pageFileName(pageIndex),
    x: column * cellWidth + nativePadding,
    y: rowInPage * cellHeight + nativePadding,
    w: frameWidth,
    h: frameHeight
  };
}

function buildAtlas(frames, pages) {
  const lines = [];

  for (const page of pages) {
    if (lines.length > 0) lines.push('');
    lines.push(
      page.file,
      `size: ${page.width}, ${page.height}`,
      'format: RGBA8888',
      'filter: Linear, Linear',
      'repeat: none'
    );

    for (const frame of frames.filter(candidate => candidate.pageIndex === page.index)) {
      lines.push(
        frame.name,
        '  rotate: false',
        `  xy: ${frame.x}, ${frame.y}`,
        `  size: ${frame.w}, ${frame.h}`,
        `  orig: ${frame.w}, ${frame.h}`,
        '  offset: 0, 0',
        '  index: -1'
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function buildJson(frames, pages) {
  const firstPage = pages[0];
  return {
    meta: {
      image: 'cards.png',
      images: pages.map(page => ({
        image: page.file,
        size: { w: page.width, h: page.height },
        firstRow: page.firstRow,
        rowCount: page.rowCount
      })),
      format: 'RGBA8888',
      size: { w: firstPage.width, h: firstPage.height },
      frame: { w: frameWidth, h: frameHeight },
      columns: nativeRows[0].length,
      rows: nativeRows.length,
      layout: 'rank-rows_suit-columns',
      columnOrder: suits,
      rowOrder: [...ranks, 'special'],
      padding: nativePadding,
      cell: { w: cellWidth, h: cellHeight }
    },
    frames: frames.map(frame => ({
      name: frame.name,
      filename: frame.name,
      page: frame.page,
      frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
      rotated: false,
      trimmed: false,
      sourceSize: { w: frame.w, h: frame.h },
      spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h }
    })),
    regions: Object.fromEntries(frames.map(frame => [
      frame.name,
      { page: frame.page, x: frame.x, y: frame.y, w: frame.w, h: frame.h }
    ]))
  };
}

async function exportCards() {
  await rm(nativeCardsDir, { recursive: true, force: true });
  await mkdir(nativeCardsDir, { recursive: true });

  const extension = theme.cards.assetExtension || 'webp';
  const sourceFiles = cardNames.map(cardName => path.join(cardSourceDir, `${cardName}.${extension}`));
  await Promise.all(sourceFiles.map(mustExist));

  const sheetWidth = nativeRows[0].length * cellWidth;
  const pages = buildPages(sheetWidth);
  const frames = nativeRows.flatMap((rowItems, row) =>
    rowItems.map((name, column) => ({
      name,
      ...frameForGrid(row, column)
    }))
  );

  for (const page of pages) {
    const magickArgs = [
      '-size',
      `${page.width}x${page.height}`,
      'xc:transparent'
    ];

    for (const frame of frames.filter(candidate => candidate.pageIndex === page.index)) {
      const sourceFile = path.join(cardSourceDir, `${frame.name}.${extension}`);
      magickArgs.push(
        '(',
          sourceFile,
          '-resize', `${frameWidth}x${frameHeight}!`,
          '-virtual-pixel', 'Edge',
          '-filter', 'point',
          '-set', 'option:distort:viewport', `${cellWidth}x${cellHeight}-${nativePadding}-${nativePadding}`,
          '-distort', 'SRT', '0',
        ')',
        '-geometry', `+${frame.x - nativePadding}+${frame.y - nativePadding}`,
        '-composite'
      );
    }

    magickArgs.push('-define', 'png:color-type=6', path.join(nativeCardsDir, page.file));
    run('magick', magickArgs);
  }

  await writeFile(path.join(nativeCardsDir, 'cards.atlas'), buildAtlas(frames, pages), 'utf8');
  await writeFile(path.join(nativeCardsDir, 'cards.json'), `${JSON.stringify(buildJson(frames, pages), null, 2)}\n`, 'utf8');
}

async function exportAudio() {
  await rm(nativeAudioDir, { recursive: true, force: true });
  await mkdir(nativeAudioDir, { recursive: true });

  for (const audioName of audioNames) {
    const sourceFile = path.join(audioSourceDir, `${audioName}.ogg`);
    await mustExist(sourceFile);
    await copyFile(sourceFile, path.join(nativeAudioDir, `${audioName}.ogg`));
  }
}

async function main() {
  await exportCards();
  await exportAudio();
  console.log(`Exported ${cardNames.length} native card frames and ${audioNames.length} OGG files to ${path.relative(projectRoot, nativeRoot)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
