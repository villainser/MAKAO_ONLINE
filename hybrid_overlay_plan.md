# Hybrid Android Overlay Plan

Cel: wariant 2 zaakceptowany przez użytkownika. Stół zostaje renderowany przez LibGDX, a popupy, powiadomienia, menu, rezygnacja i docelowo ustawienia stołu są renderowane przez React w WebView jako overlay nad stołem.

## Zasady

- Nie przepisywać stołu i dotyku kart w pierwszym etapie.
- Nie ruszać zaakceptowanej logiki manualnego rzutu, dobierania i legalności kart poza koniecznym spięciem bridge.
- React overlay nie może dublować logiki gry. Backend i `MakaoGdxGame` pozostają źródłem ruchów stołu; React obsługuje tylko UI/popupy i komendy użytkownika.
- Stary `MakaoNativeActivity` zostaje jako fallback i dla debug harnessów, dopóki hybryda nie przejdzie smoke testów.
- Każdy pionowy wycinek kończy się: frontend lint/build, Android compile/build, instalacja na Samsungu `5200df2eee05549b`, screenshot i logcat scan.

## Architektura docelowa

### Dwa etapy architektury

Etap A, pierwszy bezpieczny slice:

- LibGDX nadal ma obecny `NativeGameClient` i Socket.IO.
- React overlay jest nad stołem i obsługuje tylko UI/popupy/komendy, delegując krytyczne akcje do obecnych ścieżek natywnych.
- Celem jest dowód techniczny: GL view pod WebView, transparentny overlay i routing dotyku działają na Samsungu.

Etap B, docelowy control-plane:

- React/WebView trzyma socket, `room`, `gameState`, popupy, powiadomienia i decyzje UI.
- LibGDX renderuje snapshot, animuje i emituje intencje użytkownika do Reacta.
- Serwer pozostaje jedynym autorytetem reguł.
- LibGDX nie powinien docelowo dublować host-confirmów, request/Joker popupów ani reguł UI.

Nie zaczynać od Etapu B bez przejścia Etapu A.

### Android

- Preferowany wariant: `MainActivity` zostaje jedyną aktywnością gry i po `super.onCreate()` instaluje warstwy hybrydowego stołu.
- Root aktywności ma być kontrolowany przez `FrameLayout`/własny layout hybrydowy.
- Warstwa dolna: LibGDX table view/fragment z `MakaoGdxGame` uruchomionym w trybie `hybridOverlay`.
- Warstwa górna: WebView/Capacitor renderujący React overlay z przezroczystym tłem.
- `NativeGamePlugin.open()` ma domyślnie wołać `MainActivity.showHybridNativeGame(config)` zamiast startować drugą aktywność.
- Dodać `MakaoGdxFragment extends AndroidFragmentApplication` albo równoważny lokalnie potwierdzony sposób embeddingu LibGDX, żeby `MainActivity` mogło pozostać `BridgeActivity`.
- WebView overlay musi mieć `setBackgroundColor(Color.TRANSPARENT)`, brak overscrolli i pełny immersive landscape.
- LibGDX w trybie hybrydowym nie rysuje własnych start/lobby/popupów, które przejmie React.
- Stary `MakaoNativeActivity` zostaje jako fallback/debug do czasu stabilizacji hybrydy.

### Touch routing

Przezroczysty DOM nie wystarczy: fullscreen WebView jako Android View przechwytuje dotyk. Potrzebny jest własny root, roboczo `HybridGameRootLayout`, który zna regiony klikalnego overlay UI.

- React raportuje hit-regiony overlayu przez bridge, np. recty menu, bottom sheetów, popupów i przycisków.
- `ACTION_DOWN` w hit-regionie overlayu kieruje cały gest do WebView.
- `ACTION_DOWN` poza hit-regionami kieruje cały gest do widoku LibGDX.
- `MOVE/UP/CANCEL` trzymają target wybrany przy `DOWN`, żeby drag karty nie został przejęty przez WebView w połowie gestu.

### Bridge

Minimalny kontrakt Java/JS:

- `HybridOverlay.getLaunchConfig()`: React overlay pobiera `serverUrl`, `roomId`, `playerName`, `clientId`.
- `HybridOverlay.sendCommand(command, payload)`: React wysyła komendy do aktywności/LibGDX.
- `HybridOverlay.close(action)`: React zamyka hybrydowy stół przez wynik aktywności.
- `notifyListeners("hybridOverlayEvent", payload)`: Android wysyła do Reacta stan popupów/toastów.

Minimalne komendy:

- `leave_room`: rezygnacja z aktywnego stołu i powrót do web start panelu.
- `return_lobby`: powrót po końcu gry lub return-to-lobby do webowego lobby.
- `dismiss_popup`: zamknięcie overlay popupu.

Docelowe komendy:

- `choose_suit_request`, `choose_rank_request`
- `choose_joker`
- `confirm_leave`, `cancel_leave`
- `toggle_pause_menu`
- `set_audio`, `set_haptics`

Minimalne eventy z LibGDX/Android do Reacta:

- `table_ready`
- `toast`
- `confirm_leave`
- `return_lobby`
- `left_room`
- `request_choice_open`
- `joker_choice_open`
- `game_over`

Docelowy kontrakt Etapu B powinien używać wersjonowanych wiadomości (`v`, `roomId`, `gameNumber`, `stateVersion`, `seq`) i ignorować stare eventy/snapshoty. React wysyłałby `state.replace`, `overlay.set`, `selection.set`, `prefs.set`, a LibGDX odsyłałby intencje typu `play.request`, `drawPile.tap`, `turn.pass.request`, `makao.declare.request`, `ui.leave.request`. To jest osobny etap po stabilnym overlay shellu.

## Pionowe wycinki

### Slice 1: Hybrydowa aktywność z pasywnym React overlay

Cel: udowodnić, że React naprawdę rysuje nad LibGDX bez przebijania starego UI.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] W `MainActivity` osadzić LibGDX pod WebView.
- [x] Dodać `MakaoGdxFragment` lub potwierdzony lokalnie odpowiednik z `initializeForView`.
- [x] Dodać `HybridGameRootLayout` lub równoważny routing dotyku.
- [x] W React dodać tryb overlay, np. `NativeTableOverlay`, aktywowany przez launch config/query/bridge.
- [x] Overlay pokazuje tylko top chip pokoju, status i przycisk menu/rezygnacji.
- [x] Rezygnacja może na razie delegować do Androida i zamknąć aktywność tak jak obecny `left_room`.
- [x] Stary `MakaoNativeActivity` zostaje nietknięty jako fallback.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu i screenshot stołu z widocznym React overlay nad GDX.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-slice1-20260527-samsung/`.

Notatki z implementacji:

- `NativeGamePlugin.open()` domyślnie używa hybrydowego `MainActivity`; stary direct `MakaoNativeActivity` zostaje dostępny przez opcję `legacyActivity`.
- React raportuje tylko interaktywne regiony (`MENU`, otwarty panel, panel błędu), więc pasywny chip statusu nie blokuje GDX.
- ADB touch smoke potwierdził oba kierunki routingu: `MENU` trafiło do WebView, tap w rękę poza overlayem trafił do GDX.
- `REZYGNUJ` w Slice 1 delegował bezpośrednio do GDX; confirmation popup został przeniesiony w Slice 2.

### Slice 2: React confirmation popup dla rezygnacji

Cel: pierwszy realny popup React nad LibGDX.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] Ukryć/wyłączyć natywny LibGDX confirm dla rezygnacji w trybie hybrydowym.
- [x] React overlay pokazuje confirm bottom sheet/popup.
- [x] Potwierdzenie wysyła `leave_room`.
- [x] Activity zwraca `left_room`, a główne WebView pokazuje web start panel.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] focused hybrid smoke: ADB tap otwiera `MENU`, ADB tap `REZYGNUJ` pokazuje React confirm nad GDX, ADB tap potwierdzenia wraca do web start panelu.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-confirm-20260527-samsung/`.

Notatki z implementacji:

- `NativeTableOverlay` trzyma modal `Zrezygnować z partii?` i dopiero potwierdzenie wysyła komendę `leave_room` przez `NativeGame.sendCommand`.
- Podczas modala React raportuje pełnoekranowy hit-region, żeby tapy poza sheetem nie trafiały przypadkiem do stołu GDX.
- `MakaoGdxGame` ignoruje własny natywny confirm rezygnacji w trybie `isWebLaunchedNativeTable()`, a stary confirm zostaje dla `MakaoNativeActivity` fallback.
- Samsung WebView raportuje viewport 640x360 przy fizycznym zrzucie 1280x720, więc focused ADB smoke skaluje tapy x2.

### Slice 3: React toast/powiadomienia nad stołem

Cel: przenieść neutralne komunikaty do React overlay bez zmiany mechaniki.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] `MakaoGdxGame` emituje krótkie eventy `toast`.
- [x] React overlay pokazuje app-notification/toast nad stołem.
- [x] LibGDX zostawia krytyczne badge przy stosie jako źródło prawdy dla efektów.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] focused hybrid smoke: WebView reconnectuje do live pokoju, tap w talię trafia do GDX i generuje React toast `Błąd ruchu / Przesuń w dół, aby dobrać`.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-toast-20260527-samsung/`.

Notatki z implementacji:

- `MakaoGdxGame.showNotice()` w trybie `isWebLaunchedNativeTable()` emituje `toast` przez callback do `MakaoGdxFragment`/`MainActivity`, a `NativeGamePlugin` publikuje go jako `hybridOverlayEvent`.
- `NativeTableOverlay` słucha `NativeGame.addListener("hybridOverlayEvent")` i renderuje krótkie, pasywne toasty React nad stołem.
- GDX nie rysuje już własnego `drawNotice()` w web-launched table, żeby nie dublować komunikatu, ale badge efektów i stół pozostają po stronie LibGDX.
- Toasty w trybie overlay są pasywne (`pointer-events: none`), więc nie wymagają nowych hit-regionów i nie zabierają dotyku kartom.

### Slice 4: Request/Joker choice jako React popup

Cel: przenieść największe popupy interakcyjne do Reacta.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] LibGDX wykrywa potrzebę wyboru i emituje `request_choice_open`/`joker_choice_open`.
- [x] React renderuje wybór koloru/wartości/Jokera.
- [x] Komenda wraca do LibGDX, która wykonuje istniejące metody gry.
- [x] Stary panel LibGDX zostaje fallbackiem tylko poza trybem hybrydowym.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] focused hybrid smoke przez `MainActivity`/WebView/CDP i lokalny backend testowy: ADB gest GDX otwiera React `Wybierz kolor`, ADB tap `Pik` wraca jako `suit_request=spades`; ADB gest GDX otwiera React `Joker`, ADB tap `8` + `Pik` + `ZAGRAJ` wraca jako `jokerDeclaration={ rank: "8", suit: "spades" }`.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-request-joker-20260527-samsung/`.

Notatki z implementacji:

- `MakaoGdxGame` trzyma istniejące pending `NativeCard`/joker/request state i w hybrydzie emituje tylko eventy overlayu; wybory wracają przez `choose_joker`, `choose_suit_request`, `choose_rank_request`.
- Ukryto natywne panele `drawRequestDeclaration()`/`drawJokerDeclaration()` tylko dla `isWebLaunchedNativeTable()`, więc `MakaoNativeActivity` nadal ma fallback LibGDX.
- React overlay raportuje pełnoekranowy hit-region podczas wyboru, żeby gesty modala nie trafiały do stołu.

### Slice 5: Game-over i return-to-lobby w React

Cel: końcowe popupy i powroty są webowe.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] React overlay pokazuje game-over popup i akcje.
- [x] `return_lobby` zamyka hybrydę i przywraca web lobby w głównej WebView.
- [x] `left_room` nadal czyści sesję i wraca do web start panelu.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] focused hybrid smoke przez `MainActivity`/WebView/CDP i live room: host kończy partię, GDX emituje React `game_over`, overlay pokazuje `KONIEC GRY`, tap `KOLEJNA PARTIA` wraca do web lobby.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-game-over-20260527-samsung/`.

Notatki z implementacji:

- `MakaoGdxGame` emituje `game_over` przez istniejący `hybridOverlayEvent`, bo po wejściu w hybrydę świeży stan gry może przychodzić do GDX, a nie do Reactowego socketu.
- W web-launched table GDX nie rysuje już własnego game-over panelu i nie wykonuje jego niewidocznych przycisków; Reactowy modal ma pełnoekranowy hit-region.
- `return_lobby` z overlayu deleguje do `NativeGameClient.returnToLobby()` dla hosta i dopiero po serwerowym lobby zamyka warstwę GDX do web lobby.

### Slice 6: Android Back otwiera React confirm

Cel: domknąć podstawowy lifecycle hybrydowego stołu, żeby systemowy Back nie zamykał aktywności/WebView poza kontrolowaną ścieżką `leave_room`.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] `MainActivity` przechwytuje `onBackPressed()` tylko gdy `hybridActive`.
- [x] Android emituje event `confirm_leave` przez istniejący `hybridOverlayEvent`.
- [x] React `NativeTableOverlay` otwiera istniejący confirmation modal rezygnacji.
- [x] Potwierdzenie nadal wysyła `leave_room` do LibGDX/`NativeGameClient`, a aplikacja wraca do web start panelu.
- [x] Fallback `MakaoNativeActivity` pozostaje bez zmian.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] focused hybrid smoke: WebView/MainActivity wszedł do live pokoju `VE4DIM`, `adb shell input keyevent BACK` otworzył React `Zrezygnować z partii?`, a potwierdzenie wróciło do web start panelu.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-back-confirm-20260527-samsung/`.

Notatki z implementacji:

- `MainActivity.onBackPressed()` nie kończy już hybrydy bezpośrednio; wysyła tylko `confirm_leave`, więc WebView overlay zachowuje jeden wspólny flow rezygnacji.
- Existing hit-region reporting obsługuje modal bez nowych regionów po stronie Androida, bo React ponownie raportuje full-screen backdrop.

### Slice 7: Snapshot overlay eventów po reattach WebView

Cel: hybrydowy overlay odtwarza ostatni istotny popup/event, jeśli listener Reacta podepnie się po emisji eventu z Android/LibGDX.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] `NativeGamePlugin` trzyma sticky snapshot ostatniego interaktywnego eventu overlayu: `confirm_leave`, `request_choice_open`, `joker_choice_open`, `game_over`.
- [x] Snapshot czyści się przy `leave_room`, `return_lobby`, zamknięciu hybrydy, zamknięciu request/Joker albo po wyborze.
- [x] React `NativeTableOverlay` po montażu pobiera `getOverlaySnapshot()` i reużywa tego samego handlera co dla `hybridOverlayEvent`.
- [x] Anulowanie Android-Back confirm wysyła `cancel_leave`, żeby sticky `confirm_leave` nie wrócił po remount overlayu.
- [x] Nie zmieniono `NativeGameClient`/Socket.IO ownership ani ręcznego rzutu/dobierania.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] WebView/CDP smoke: `NativeGame.getOverlaySnapshot()` odpowiada `{ "active": false }` na ekranie startowym, więc nowa metoda bridge jest dostępna z Reacta.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-event-recovery-20260527-samsung/`.

Notatki z implementacji:

- Snapshot nie obejmuje toastów, bo są nietrwałe i pasywne; dotyczy tylko popupów/stanów, których zgubienie mogłoby zablokować użytkownika.
- Snapshot jest przechowywany po stronie pluginu, nie Reacta, dzięki czemu działa przy remount overlayu bez przenoszenia control-plane do WebView.

### Slice 8: Reattach WebView do aktywnej hybrydy

Cel: jeśli React/WebView podepnie się ponownie do tej samej aktywnej sali, Android bridge nie odrzuca `NativeGame.open()` i nie kasuje sticky popupu.

Status 2026-05-27: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`.

Zakres:

- [x] `NativeGamePlugin.open()` rozpoznaje aktywną hybrydę z tym samym `roomId` jako reattach, podmienia oczekujący `PluginCall` i zostawia istniejący `MakaoGdxFragment`.
- [x] Reattach tej samej sali nie czyści `stickyHybridOverlayEvent`.
- [x] Inna sala nadal jest odrzucana, gdy hybryda jest aktywna.
- [x] Nie zmieniono `NativeGameClient`/Socket.IO ownership ani manualnego rzutu/dobierania.

Weryfikacja:

- [x] `npm --prefix frontend run lint`
- [x] `npm --prefix frontend run build`
- [x] `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`
- [x] `./scripts/android_build_debug.sh http://8.231.197.182`
- [x] install na Samsungu `5200df2eee05549b`
- [x] launcher smoke przez `ANDROID_SERIAL=5200df2eee05549b ./scripts/android_smoke_test.sh http://8.231.197.182`
- [x] focused hybrid smoke: lokalny backend testowy, WebView/MainActivity wszedł do live pokoju `SAJR7C`, ponowne `NativeGame.open()` dla tej samej sali pozostało `pending` zamiast odrzucać, Android Back dał sticky `confirm_leave`, host game-over dał sticky `game_over`, a snapshot `game_over` przetrwał kolejny reattach.
- [x] logcat scan: `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`

Artefakty: `output/android-smoke/hybrid-overlay-reattach-recovery-20260527-samsung/`.

Notatki z implementacji:

- Poprawka zamyka lukę po reload/remount WebView, gdzie poprzedni `PluginCall` mógł być martwy, a kolejne `open()` było wcześniej odrzucane jako `Hybrid native game is already open`.
- Request/Joker nadal używają tej samej sticky storage path z Slice 7; ich live eventy i payloady zostały zweryfikowane w Slice 4. Ten slice skupia się na reattach mechanice i długotrwałych popupach `confirm_leave`/`game_over`.
- Etap A jest gotowy do ręcznej akceptacji na telefonie przed jakimkolwiek przechodzeniem do socket/snapshot ownership po stronie Reacta.

### Slice 9: Minimalistyczny redesign React popupów i komunikatów stołu

Cel: domknąć Etap A jako spójny wizualnie React/WebView overlay nad stołem, bez przechodzenia do Etapu B. Ekran startowy jest wzorcem jakości: ciemny transparentny glass, krótkie komunikaty, złoto/niebieskie akcenty, mało tekstu, wysoka czytelność.

Status 2026-05-28: gotowe i zweryfikowane na Samsungu `5200df2eee05549b`. Etap B nie został rozpoczęty.

Zakres:

- [x] Ujednolicić lobby stołu kolorystycznie z ekranem startowym: mniej zielonego stołu w UI webowym, więcej transparentnego granatu/szkła i subtelnych złotych akcentów. Nie ruszać mechaniki lobby.
- [x] Przerobić React overlay popupów na minimalistyczne boczne/topowe popovery:
  - confirm rezygnacji i game-over: prawa strona / prawy górny obszar, kompaktowe, transparentne, bez pełnoekranowego zaciemnienia stołu;
  - Joker: prawy bok, siatka krótka, bez przewijania;
  - żądanie koloru i wartości: zawsze na samej górze stołu, kompaktowe, nie niżej niż top HUD.
- [x] Warunek kategoryczny: popupy, toasty i statusy nigdy nie zasłaniają ręki gracza ani dolnej strefy akcji. Dolny pas ręki pozostaje wolny.
- [x] Usunąć lub zastąpić długi poziomy komunikat o tym, co trafiło na stos. Nie może być szerokiego bannera przez środek stołu typu `Na stosie...`.
  - Główne źródło do sprawdzenia: hybrydowy toast/notice `stos ...` z `MakaoGdxGame.java`; nie powinien trafiać do React toastów w web-launched table.
- [x] Komunikaty o ruchach skrócić do małych bocznych toastów/znaczników. Tekst ma być krótki: maksymalnie 1-2 krótkie linie, bez pełnych zdań i bez długich opisów reguł.
- [x] Informację `czyja tura` pokazywać w React web design jako stały kompaktowy status overlayu, a nie jako długi komunikat GDX. Status ma jasno odróżniać `Twoja tura` / `Tura: Gracz`.
- [x] Żądania aktywne po zagraniu Asa/Waleta mają być czytelne w top overlayu: ikona/skrót koloru albo wartości, krótki podpis, bez zasłaniania kart na stole i ręki.
- [x] Zachować touch routing: React raportuje tylko realne interaktywne recty paneli/przycisków; pasywne statusy i toasty mają `pointer-events: none`.
- [x] Nie przenosić socket ownership do Reacta i nie ruszać logiki legalności/rzutu/dobierania.

Warunki akceptacji:

- [x] Samsung `5200df2eee05549b`, landscape screenshot stołu: brak popupu/toastu/statusu w dolnej strefie ręki.
- [x] Samsung screenshot request koloru: panel na samej górze, cały widoczny, brak przewijania, brak elementów poza ekranem.
- [x] Samsung screenshot request wartości: panel na samej górze, cały widoczny, brak przewijania, brak elementów poza ekranem.
- [x] Samsung screenshot Joker: panel boczny/top-boczny, cały widoczny, brak przewijania, brak zasłonięcia ręki.
- [x] Samsung screenshot game-over/confirm: panel boczny, kompaktowy, nie zasłania kart w ręce.
- [x] Screenshot po zagraniu/dobraniu: nie ma długiego poziomego bannera o stosie; jest tylko krótki boczny/toastowy komunikat albo status.
- [x] Screenshot zwykłej tury: `czyja tura` jest widoczne w React overlay i mieści się bez łamania layoutu.
- [x] Zwykłe webowe `.turn-events` / `.table-banner` też nie pokazują długich poziomych opisów; jeśli pojawiają się eventy, są krótkie i boczne albo kompaktowe.
- [x] CDP layout check na Samsung WebView `640x360`, DPR `2`: panel `bottom <= 255`, brak scrolla strony/panelu, panel w ekranie, żądania `top <= 72`, boczny panel `left <= 18` albo `right >= 622`, przyciski minimum `44x44`, krótkie teksty bez overflowu.
- [x] Logcat scan czysty dla `FATAL EXCEPTION| E AndroidRuntime|TypeError|ReferenceError|ANR`.
- [x] `npm --prefix frontend run lint`, `npm --prefix frontend run build`, `cd frontend/android && ./gradlew :app:compileDebugJavaWithJavac`, `./scripts/android_build_debug.sh http://8.231.197.182`.

Artefakty: `output/android-smoke/hybrid-popup-redesign-slice9-20260528-001045-samsung/`.

Notatki z implementacji:

- `NativeTableOverlay` używa kompaktowego React statusu tury (`Twoja tura` / `Tura: Gracz`), a `MakaoGdxGame` emituje lekkie `turn_status` eventy w trybie hybrydowym, więc status aktualizuje się po ruchu bez przenoszenia Socket.IO/control-plane do Reacta.
- Request koloru/wartości jest topowym popoverem; Joker jest top-bocznym popoverem; confirm/game-over są boczne. Top HUD jest chwilowo ukryty tylko podczas paneli wyboru, żeby popupy nie nachodziły na tekst i rękę.
- GDX w web-launched table nie rysuje już własnego top HUD i nie wysyła `stos ...` jako React toastu po zmianie stosu. Badge aktywnych efektów zostają po stronie stołu.
- Focused smoke potwierdził screenshoty: `01-normal-turn-status.png`, `02-after-play-no-stack-banner.png`, `03-request-color-top.png`, `04-request-value-top.png`, `05-joker-side.png`, `06-confirm-side.png`; `layout-checks.json` ma WebView `640x360`, DPR `2`, request `top=8`, Joker `bottom=230.8`, confirm `bottom=178.1`, bez scrolla i bez logcat crash patternów.
- Zwykły web table ma skrócone teksty aktywnych efektów i `fit-content` dla `.table-banner`, a `.turn-events` zostają kompaktowymi pillami.

## Etap B: plan po stabilnym overlay shellu

Nie zaczynać przed ręczną akceptacją stabilności Etapu A i Slice 9 na telefonie.

Kolejność migracji:

1. Dodać wersjonowany kontrakt `state.replace` z polami `v`, `roomId`, `gameNumber`, `stateVersion`, `seq`, wysyłany z Reacta do LibGDX bez zmiany renderera.
2. Dodać w LibGDX tryb snapshot-only, który renderuje stan z Reacta, ale nadal pozwala przełączyć fallback na obecny `NativeGameClient`.
3. Przenieść socket ownership do Reacta dopiero po porównaniu snapshotów React/GDX w tym samym pokoju i po ignorowaniu starych `seq`.
4. Przenieść intencje GDX do Reacta jako `play.request`, `drawPile.tap`, `turn.pass.request`, `makao.declare.request`, `ui.leave.request`.
5. Usunąć dublujące request/Joker/game-over ścieżki z LibGDX dopiero po osobnym smoke z reconnectem, Android Back i return-to-lobby.

## Ryzyka

- LibGDX backend embedding: trzeba potwierdzić, czy najbezpieczniej użyć `AndroidFragmentApplication`, `initializeForView`, czy osobny fragment wrapper. Nie zgadywać, sprawdzić API w lokalnym Gradle/cache przed większym kodem.
- Przezroczysty WebView: React overlay musi mieć przezroczyste tło tylko w trybie overlay, inaczej przykryje stół.
- Lifecycle: WebView i LibGDX muszą pauzować/wznawiać się razem. Nie zostawiać socketów po zamknięciu aktywności.
- Input: WebView overlay może przechwytywać dotyk. Overlay musi mieć `pointer-events: none` na pełnym ekranie i `pointer-events: auto` tylko na panelach/przyciskach.
- Testy: bez screenshotu z realnego Samsunga nie uznawać slice za gotowy.

## Kryterium gotowości pierwszej nocy

- Działa co najmniej Slice 1 albo jest zapisany konkretny blocker z nazwą brakującego API/klasy.
- APK buduje się i instaluje na Samsungu.
- Screenshot potwierdza brak starego LibGDX start/lobby przy wejściu na stół.
- `progress.md` i ten plan są zaktualizowane.
