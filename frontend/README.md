# Interfejs Makao

React odpowiada za grę w przeglądarce, menu, lobby i nakładki Androida.
Capacitor łączy interfejs webowy z natywnym stołem LibGDX w
`android/app/src/main/java/`. Instrukcje uruchomienia i budowania znajdują się
w [głównym README](../README.md).

## Grafika i dźwięk

Gotowe karty, dźwięki i atlasy są zapisane w repozytorium. Zwykłe budowanie strony
lub APK korzysta z nich bez ponownego generowania. Konfigurację zasobów zawiera
[`theme.config.js`](theme.config.js).

Poniższe polecenia wykonuje się z katalogu `frontend/`:

| Polecenie | Działanie |
| --- | --- |
| `npm run assets:cards` | Normalizacja źródłowych grafik kart do `public/cards/later/` |
| `npm run assets:cards:svg` | Generowanie alternatywnych kart SVG |
| `npm run assets:audio` | Generowanie efektów dźwiękowych OGG i MP3 |
| `npm run assets:atlas` | Generowanie metadanych atlasów i arkuszy SVG |
| `npm run assets:native` | Eksport atlasów i dźwięków dla LibGDX |
| `npm run assets:all` | Uruchomienie całego procesu generowania |

Normalizacja kart wymaga lokalnych plików PNG w `../source-assets/later_asset/`.
Materiały źródłowe nie są częścią repozytorium. Nie uruchamiaj `assets:all` jako
kroku instalacji projektu; do budowania wystarczają gotowe zasoby.

`AudioManager` korzysta z plików w `public/audio/`. Jeżeli są niedostępne, może
syntetyzować efekty za pomocą Web Audio.

## Atlasy Androida

LibGDX ładuje karty z `android/app/src/main/assets/native/cards/cards.atlas`.
Każda karta jest statycznym regionem tekstury. `MakaoGdxGame` animuje jej pozycję,
obrót, skalę i przezroczystość; atlas nie zawiera klatek animacji.

Atlas odwołuje się do trzech plików, które muszą pozostać w tym samym katalogu:

| Plik | Rozmiar |
| --- | --- |
| `cards.png` | 2080 × 3880 px |
| `cards2.png` | 2080 × 3880 px |
| `cards3.png` | 2080 × 3104 px |

Region karty ma rozmiar 512 × 768 px i 4 px powielonej krawędzi, ograniczającej
przenikanie sąsiednich tekstur przy filtrowaniu. Nazwy regionów, np. `2-hearts`,
`queen-spades`, `ace-diamonds`, `joker-a` i `back`, są używane przez
`TextureAtlas.findRegion(name)`.

Dźwięki natywne znajdują się w `android/app/src/main/assets/native/audio/`.
Identyfikatory efektów: `card_draw`, `card_throw`, `card_land`, `deck_shuffle`,
`card_function`, `turn_ping`, `makao`, `round_win` i `illegal_move`.
