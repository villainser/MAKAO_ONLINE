#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import theme from '../theme.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'cards');

const suits = [
  { id: 'hearts', symbol: '♥', label: 'Kier', color: theme.cards.redSuit },
  { id: 'diamonds', symbol: '♦', label: 'Karo', color: theme.cards.redSuit },
  { id: 'clubs', symbol: '♣', label: 'Trefl', color: theme.cards.blackSuit },
  { id: 'spades', symbol: '♠', label: 'Pik', color: theme.cards.blackSuit }
];

const ranks = [
  { id: '2', label: '2', pips: 2 },
  { id: '3', label: '3', pips: 3 },
  { id: '4', label: '4', pips: 4 },
  { id: '5', label: '5', pips: 5 },
  { id: '6', label: '6', pips: 6 },
  { id: '7', label: '7', pips: 7 },
  { id: '8', label: '8', pips: 8 },
  { id: '9', label: '9', pips: 9 },
  { id: '10', label: '10', pips: 10 },
  { id: 'jack', label: 'J', face: 'jack' },
  { id: 'queen', label: 'Q', face: 'queen' },
  { id: 'king', label: 'K', face: 'king' },
  { id: 'ace', label: 'A', pips: 1 }
];

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function svgDocument(inner) {
  const { width, height } = theme.cards;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
${inner}
</svg>
`;
}

function cardBase(title) {
  const { width, height, cornerRadius, faceColor, borderColor } = theme.cards;
  return `<title>${esc(title)}</title>
  <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="${cornerRadius}" fill="${faceColor}" stroke="${borderColor}" stroke-width="4"/>
  <rect x="13" y="13" width="${width - 26}" height="${height - 26}" rx="${Math.max(4, cornerRadius - 4)}" fill="none" stroke="rgba(15,23,42,0.08)" stroke-width="2"/>`;
}

function corner(rank, suit, x, y, rotate = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rotate})" fill="${suit.color}">
    <text x="0" y="0" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="${rank.label.length > 1 ? 34 : 40}" font-weight="900">${rank.label}</text>
    <text x="0" y="34" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="900">${suit.symbol}</text>
  </g>`;
}

function pip(x, y, suit, scale = 1, rotate = 0, opacity = 1) {
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" transform="rotate(${rotate} ${x} ${y})" fill="${suit.color}" opacity="${opacity}" font-family="Arial,sans-serif" font-size="${Math.round(44 * scale)}" font-weight="900">${suit.symbol}</text>`;
}

function pipsFor(rank, suit) {
  const xLeft = 83;
  const xRight = 173;
  const xMid = 128;
  const rows = [92, 128, 166, 204, 240, 278];
  const layouts = {
    1: [[xMid, 184, 2.35, 0]],
    2: [[xMid, 112, 1.25, 0], [xMid, 256, 1.25, 180]],
    3: [[xMid, 96, 1.05, 0], [xMid, 184, 1.2, 0], [xMid, 272, 1.05, 180]],
    4: [[xLeft, rows[1], 1, 0], [xRight, rows[1], 1, 0], [xLeft, rows[4], 1, 180], [xRight, rows[4], 1, 180]],
    5: [[xLeft, rows[1], 0.95, 0], [xRight, rows[1], 0.95, 0], [xMid, 184, 1.05, 0], [xLeft, rows[4], 0.95, 180], [xRight, rows[4], 0.95, 180]],
    6: [[xLeft, rows[0], 0.9, 0], [xRight, rows[0], 0.9, 0], [xLeft, rows[2], 0.9, 0], [xRight, rows[2], 0.9, 0], [xLeft, rows[4], 0.9, 180], [xRight, rows[4], 0.9, 180]],
    7: [[xLeft, rows[0], 0.86, 0], [xRight, rows[0], 0.86, 0], [xMid, rows[1], 0.86, 0], [xLeft, rows[2], 0.86, 0], [xRight, rows[2], 0.86, 0], [xLeft, rows[4], 0.86, 180], [xRight, rows[4], 0.86, 180]],
    8: [[xLeft, rows[0], 0.82, 0], [xRight, rows[0], 0.82, 0], [xMid, rows[1], 0.82, 0], [xLeft, rows[2], 0.82, 0], [xRight, rows[2], 0.82, 0], [xMid, rows[3], 0.82, 180], [xLeft, rows[4], 0.82, 180], [xRight, rows[4], 0.82, 180]],
    9: [[xLeft, rows[0], 0.76, 0], [xRight, rows[0], 0.76, 0], [xLeft, rows[1], 0.76, 0], [xRight, rows[1], 0.76, 0], [xMid, 184, 0.8, 0], [xLeft, rows[3], 0.76, 180], [xRight, rows[3], 0.76, 180], [xLeft, rows[4], 0.76, 180], [xRight, rows[4], 0.76, 180]],
    10: [[xLeft, rows[0], 0.72, 0], [xRight, rows[0], 0.72, 0], [xMid, rows[1] - 12, 0.72, 0], [xLeft, rows[1] + 18, 0.72, 0], [xRight, rows[1] + 18, 0.72, 0], [xLeft, rows[3] - 18, 0.72, 180], [xRight, rows[3] - 18, 0.72, 180], [xMid, rows[4] + 12, 0.72, 180], [xLeft, rows[5], 0.72, 180], [xRight, rows[5], 0.72, 180]]
  };

  return layouts[rank.pips].map(([x, y, scale, rotate]) => pip(x, y, suit, scale, rotate)).join('\n  ');
}

function functionalIcon(rankId, suitId, color) {
  const opacity = theme.cards.functionalIconOpacity;
  const battleKing = rankId === 'king' && ['hearts', 'spades'].includes(suitId);

  if (['2', '3'].includes(rankId) || battleKing) {
    return `<path d="M143 74 96 187h43l-27 108 55-139h-43z" fill="${color}" opacity="${opacity}"/>`;
  }

  if (rankId === '4') {
    return `<g fill="${color}" opacity="${opacity}"><rect x="91" y="87" width="28" height="194" rx="10"/><rect x="137" y="87" width="28" height="194" rx="10"/></g>`;
  }

  if (rankId === 'ace') {
    return `<path d="M128 78c43 25 68 59 68 95 0 43-31 80-68 112-37-32-68-69-68-112 0-36 25-70 68-95Z" fill="${color}" opacity="${opacity}"/>`;
  }

  if (rankId === 'jack') {
    return `<g fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"><path d="M93 121c10-30 69-30 69 8 0 35-44 39-44 72"/><path d="M128 257h.01"/></g>`;
  }

  if (rankId === 'queen') {
    return `<path d="M128 88 179 121v50c0 51-21 87-51 109-30-22-51-58-51-109v-50z" fill="${color}" opacity="${opacity}"/>`;
  }

  return '';
}

function faceArt(rank, suit) {
  const crown = rank.face === 'king'
    ? `<path d="M75 119 99 87l29 38 29-38 24 32-11 33H86z" fill="${theme.cards.accentColor}" opacity="0.9"/>`
    : '';
  const hair = rank.face === 'queen' ? theme.cards.accentColor : suit.color;
  const accessory = rank.face === 'jack'
    ? `<path d="M84 234c32 19 56 19 88 0" fill="none" stroke="${suit.color}" stroke-width="12" stroke-linecap="round" opacity="0.5"/>`
    : `<circle cx="128" cy="237" r="12" fill="${suit.color}" opacity="0.55"/>`;

  return `<g>
    ${functionalIcon(rank.id, suit.id, suit.color)}
    <text x="128" y="198" text-anchor="middle" dominant-baseline="central" fill="${suit.color}" opacity="0.09" font-family="Arial,sans-serif" font-size="170" font-weight="900">${suit.symbol}</text>
    ${crown}
    <circle cx="128" cy="145" r="51" fill="${hair}" opacity="0.18"/>
    <circle cx="128" cy="139" r="38" fill="#f4d3b4"/>
    <path d="M74 288c8-53 28-81 54-81s46 28 54 81z" fill="${suit.color}" opacity="0.24"/>
    <path d="M90 284c9-33 22-50 38-50s29 17 38 50z" fill="${suit.color}" opacity="0.42"/>
    <circle cx="115" cy="136" r="4" fill="#17202a"/>
    <circle cx="141" cy="136" r="4" fill="#17202a"/>
    <path d="M116 158c8 8 16 8 24 0" fill="none" stroke="#17202a" stroke-width="4" stroke-linecap="round"/>
    ${accessory}
  </g>`;
}

function cardSvg(rank, suit) {
  const title = `${rank.label} ${suit.label}`;
  const body = rank.face ? faceArt(rank, suit) : `${functionalIcon(rank.id, suit.id, suit.color)}
  ${pipsFor(rank, suit)}`;

  return svgDocument(`${cardBase(title)}
  ${corner(rank, suit, 37, 52)}
  ${corner(rank, suit, 219, 316, 180)}
  ${body}`);
}

function backSvg() {
  const { width, height, cornerRadius, backColor, backInk, accentColor } = theme.cards;
  const diamonds = Array.from({ length: 6 }).map((_, row) =>
    Array.from({ length: 4 }).map((__, col) => {
      const x = 47 + col * 54 + (row % 2) * 27;
      const y = 56 + row * 48;
      return `<path d="M${x} ${y - 16} ${x + 16} ${y} ${x} ${y + 16} ${x - 16} ${y}Z" fill="${backInk}" opacity="${(0.08 + (row + col) * 0.008).toFixed(3)}"/>`;
    }).join('\n  ')
  ).join('\n  ');

  return svgDocument(`<title>Rewers karty</title>
  <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="${cornerRadius}" fill="${backColor}" stroke="${accentColor}" stroke-width="4"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="${Math.max(4, cornerRadius - 2)}" fill="none" stroke="${backInk}" stroke-width="3" opacity="0.34"/>
  ${diamonds}
  <path d="M128 106 176 184 128 262 80 184Z" fill="none" stroke="${accentColor}" stroke-width="9" opacity="0.8"/>
  <path d="M128 136 157 184 128 232 99 184Z" fill="${accentColor}" opacity="0.16"/>
  <text x="128" y="191" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="30" font-weight="900" fill="${backInk}" opacity="0.72">MAKAO</text>`);
}

function jokerSvg(variant) {
  const colors = {
    'joker-a': theme.cards.accentColor,
    'joker-b': theme.cards.redSuit,
    'joker-d': theme.cards.blackSuit
  };
  const color = colors[variant] || theme.cards.accentColor;

  return svgDocument(`${cardBase(`Joker ${variant}`)}
  <text x="37" y="50" text-anchor="middle" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="31" font-weight="900">JOK</text>
  <text x="219" y="318" text-anchor="middle" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="31" font-weight="900" transform="rotate(180 219 318)">JOK</text>
  <path d="M128 67 145 113l49-7-37 33 21 45-50-21-50 21 21-45-37-33 49 7z" fill="${color}" opacity="0.18"/>
  <path d="M75 166c21-40 85-40 106 0-14 36-25 67-53 67s-39-31-53-67Z" fill="${color}" opacity="0.28"/>
  <circle cx="108" cy="165" r="11" fill="${theme.cards.faceColor}"/>
  <circle cx="148" cy="165" r="11" fill="${theme.cards.faceColor}"/>
  <path d="M103 214c19 17 31 17 50 0" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
  <text x="128" y="300" text-anchor="middle" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="900">JOKER</text>`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const writes = [
    writeFile(path.join(outputDir, 'back.svg'), backSvg(), 'utf8'),
    writeFile(path.join(outputDir, 'joker-a.svg'), jokerSvg('joker-a'), 'utf8'),
    writeFile(path.join(outputDir, 'joker-b.svg'), jokerSvg('joker-b'), 'utf8'),
    writeFile(path.join(outputDir, 'joker-d.svg'), jokerSvg('joker-d'), 'utf8')
  ];

  for (const rank of ranks) {
    for (const suit of suits) {
      writes.push(writeFile(path.join(outputDir, `${rank.id}-${suit.id}.svg`), cardSvg(rank, suit), 'utf8'));
    }
  }

  await Promise.all(writes);
  console.log(`Generated ${writes.length} card SVG files in ${path.relative(projectRoot, outputDir)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
