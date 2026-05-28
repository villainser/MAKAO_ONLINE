# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Makao visual/audio assets

The card, audio, and atlas assets are generated locally from `theme.config.js`:

```bash
npm run assets:cards
npm run assets:cards:svg
npm run assets:audio
npm run assets:atlas
npm run assets:native
npm run assets:all
```

- `assets:cards` normalizes the hand-made/AI-assisted source PNGs from `../source-assets/later_asset` into `public/cards/later`.
- `assets:cards:svg` keeps the older fully programmatic SVG generator available.
- SFX are generated as `.ogg` and `.mp3` files in `public/audio`; the runtime AudioManager also synthesizes Web Audio fallbacks if files are missing.
- Atlas metadata and SVG sheets are generated in `public/atlases`.
- `assets:native` exports LibGDX-ready files to `android/app/src/main/assets/native`: `cards/cards.png`, `cards/cards.atlas`, `cards/cards.json`, and `audio/*.ogg`.

## Native LibGDX asset contract

The native Android client should treat cards the same way Slay the Spire treats its card art: cards are static `TextureRegion`s loaded from a LibGDX `.atlas`, while motion is done in code by changing position, rotation, scale, tint/alpha, and draw order. Do not expect baked card animation frames in the card atlas.

Load the card art from:

```text
android/app/src/main/assets/native/cards/cards.atlas
```

The atlas is intentionally split into multiple PNG pages to stay under common Android texture limits:

```text
cards.png   2080x3880
cards2.png  2080x3880
cards3.png  2080x3104
```

Keep all referenced page PNGs next to `cards.atlas`. The first page remains `cards.png` for compatibility with the original native export request, but `cards.atlas` references all pages.

Each card region is a fixed `512x768` frame with 4 px edge-extruded padding around the region to avoid Linear-filter bleeding between cards. Region names are stable and should be loaded with `TextureAtlas.findRegion(name)`, for example:

```text
2-hearts
queen-spades
ace-diamonds
joker-a
joker-b
joker-d
back
```

For native animation, use the region as a sprite and animate transforms in `SpriteBatch`/scene code. Existing `MakaoGdxGame` flight-style movement (`x/y`, angle, scale, arc/easing) matches this direction; replace procedural card textures with atlas regions instead of replacing the animation system.

Audio for native lives under:

```text
android/app/src/main/assets/native/audio/*.ogg
```

The expected sound ids are `card_draw`, `card_throw`, `card_land`, `deck_shuffle`, `card_function`, `turn_ping`, `makao`, `round_win`, and `illegal_move`.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
