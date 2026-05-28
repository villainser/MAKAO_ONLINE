import theme from '../../theme.config.js';

function setVar(style, name, value) {
  style.setProperty(name, String(value));
}

export function applyThemeVariables(nextTheme = theme) {
  const root = document.documentElement;
  const style = root.style;
  const { cards, animations, table } = nextTheme;

  setVar(style, '--card-back', cards.backColor);
  setVar(style, '--card-back-ink', cards.backInk);
  setVar(style, '--card-red-suit', cards.redSuit);
  setVar(style, '--card-black-suit', cards.blackSuit);
  setVar(style, '--card-face', cards.faceColor);
  setVar(style, '--card-border', cards.borderColor);
  setVar(style, '--card-accent', cards.accentColor);
  setVar(style, '--table-theme-bg', table.backgroundColor);
  setVar(style, '--throw-duration-ms', `${animations.throwDuration}ms`);
  setVar(style, '--draw-duration-ms', `${animations.drawDuration}ms`);
  setVar(style, '--draw-pile-shrink-scale', animations.drawPileShrinkScale);

  root.dataset.feltTexture = table.feltTexture ? 'true' : 'false';
}

export default applyThemeVariables;
