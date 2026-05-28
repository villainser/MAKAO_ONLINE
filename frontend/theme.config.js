export const theme = {
  cards: {
    width: 512,
    height: 768,
    cornerRadius: 12,
    assetBase: '/cards/later',
    assetExtension: 'webp',
    backColor: '#1a1a2e',
    backInk: '#dbeafe',
    backPattern: 'geometric',
    redSuit: '#e74c3c',
    blackSuit: '#2c3e50',
    faceColor: '#fffdf7',
    borderColor: '#d8cbb6',
    accentColor: '#f2c14e',
    functionalIconOpacity: 0.16
  },
  animations: {
    throwDuration: 300,
    drawDuration: 200,
    bounceIntensity: 0.05,
    arcHeight: 60,
    drawPileShrinkScale: 0.94,
    drawFlipAt: 0.5
  },
  audio: {
    sfxVolume: 0.8,
    musicVolume: 0.4,
    muted: false,
    maxConcurrentSfx: 8,
    basePath: '/audio',
    extensionPreference: ['ogg', 'mp3'],
    sounds: {
      card_throw: 'card_throw',
      card_land: 'card_land',
      card_draw: 'card_draw',
      deck_shuffle: 'deck_shuffle',
      card_function: 'card_function',
      turn_ping: 'turn_ping',
      makao: 'makao',
      round_win: 'round_win',
      illegal_move: 'illegal_move'
    }
  },
  atlas: {
    cardColumns: 8,
    cardPadding: 4,
    vfxSize: 256
  },
  table: {
    backgroundColor: '#0d5e2e',
    feltTexture: true
  }
};

export default theme;
