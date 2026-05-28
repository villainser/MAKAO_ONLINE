# Codex resume plan - Makao

Last updated: 2026-05-23

## Current canonical rules

- Makao is mandatory. If a player reaches one card, they have 5 seconds to click `MAKAO`.
- The app may show a small actionable `MAKAO` button, but must not show large reminder text.
- After the 5-second grace window, other players may catch with `ZŁAP`; one catch is enough.
- Catching missing Makao gives the target `+5`.
- If nobody catches and the player still did not declare Makao, then when that player's turn returns they draw `+5` and continue the turn normally.
- If a player tries to finish with zero cards without prior Makao, they do not win and draw `+5`.
- `K kier` always sends `+5` forward.
- `K pik` sends `+5` backward in games with 3+ players; only in a 2-player game it hits the opponent.
- A king battle can be answered only in the battle suit: matching-suit `2`, matching-suit `3`, or matching king.
- Only the `targetPlayerId` of an active effect may resolve it by countering, accepting, or drawing to clear a request.
- Drawing during an active As/Walet suit/rank request is a deliberate pass: the request clears, the drawn card stays in hand, and the turn advances even if that card could satisfy the request.
- The ordinary visible turn timer must not remove active players. The 5-minute cleanup only applies to a paused/blocking room.

## Implemented in this pass

- Backend Makao penalties for no-Makao finish and expired missing-Makao on turn return.
- Backend king battle legality tightened to matching battle suit.
- Backend pause timeout cleanup replaces hard turn-timeout player removal.
- RoomManager-level Makao/catch coverage for catch after the 5-second window and automatic `+5` when the turn returns.
- Native `moveHistory` parsing for `stateVersion`, public move events, played cards, draw/penalty/action details.
- Native table seats for opponents with hand count, current marker, recent move, and legal `ZŁAP` only after catch window opens.
- Native opponent `play_cards` animation from opponent seats to the discard pile, driven by `moveHistory` version deltas.
- Native local-hand focus/collapse: the hand expands for active play/touch/selection/panels and otherwise lowers/scales down to reveal more table and stack.
- Native Makao button hidden after the grace window and no self reminder chip/text.
- Native table cleanup: removed stale HUD/helper texts, moved request badge above the stack, wider deck/stack spacing, larger table background.
- Native draw feel: 0.62-0.76 s draw flight, detach phase, tick at flight start, soft landing already wired.
- Samsung Android 10 smoke: installed/pushed latest debug APK, launched native table, started a one-player smoke game, and verified draw-pull screenshot/logcat.
- Deterministic native debug/test state hook for debuggable Android builds only. `MakaoNativeActivity` accepts a `debugScenario` intent extra, `NativeGameConfig` carries it into LibGDX, and `MakaoGdxGame` seeds local game states without opening Socket.IO.
- Debug scenarios now available: `ace_request_panel`, `jack_request_panel`, `joker_declaration_panel`, `own_missing_makao`, `opponent_catch_makao`, `opponent_play_history`, `opponent_draw_history`, `opponent_penalty_history`, `local_draw_from_deck`, `local_throw_to_stack`, `manual_throw_gesture`, `multi_opponent_table`, `hand_focus_reveal`, `hand_idle_peek`, and `sort_hand`.
- Samsung Android 10 debug-scenario smoke: installed/pushed latest debug APK, captured all six scenario screenshots plus one normal no-debug launch, and verified strict logcat scans were clean.
- Added `scripts/android_debug_scenarios_smoke.sh`, a repeatable debug-scenario ADB harness with build/install switches, scenario screenshots, interaction screenshots, logcat scans, and Samsung wake/keyguard handling.
- Native debug/prototype `ZŁAP` now reapplies state after catch so the red catch action disappears immediately in screenshots. `MAKAO` and `ZŁAP` interaction checks both visually remove their action buttons.
- Native hand double-tap handling is less brittle: the gesture is tracked at the hand-band level, with a slightly wider double-tap interval. Manual Samsung check confirmed sort works; ADB double-tap is kept as a screenshot/log smoke because synthetic taps on this device are less reliable than a finger.
- Native draw-pile drag now opens a live insertion gap in the local hand instead of drawing a guide line. The hand relayout updates while the deck card is being pulled toward the thumb zone.
- Native draw-pile release now uses that live gap as the actual hand insertion slot. New drawn cards are placed into the captured local slot after the backend/prototype state sync instead of being appended to the end.
- Native play-to-discard motion now uses a stable discard-center target and validates stale targets before every throw flight, preventing cards from flying to the bottom-left or leaving the stack wandering around the table.
- Native discard pile now shows exactly two visible cards as a fanned mini-hand: the previous card is spread left/down and the active top card right/up. Only the top card gets active glow/emphasis.
- Native discard visual sync is deferred while a local throw flight is active, so a played card does not replace the visible top card until its animation lands on the stack.
- Native Joker declaration was rebuilt as a compact top strip with rank buttons, suit icons, `Anuluj`, `Zagraj`, and a clear declared-card preview. Suit choice no longer auto-confirms; the player confirms explicitly.
- Native Joker declaration was refined again into a wider clean top panel: larger rank buttons, 2x2 suit icon grid, dedicated `Jako: ...` preview chip, separated actions, and no side notice bubbles visible underneath open choice panels.
- Native declared Joker no longer creates a second table bubble with the same identity. The declaration is shown once on the Joker/card context; active-effect badges remain for real effects only.
- Native dynamic hand reveal: opponent move-history flights temporarily keep the local hand lowered to expose the stack/opponent motion, then the hand expands again for play; touching the hand band cancels the reveal hold. Collapsed hand is lower/smaller, manual throw release near the discard pile is less brittle, and the Android harness now includes `hand_focus_reveal` plus nonblack screenshot assertions.
- Added `scripts/android_record_debug_scenarios.sh` for short Samsung motion-review recordings. It records debug scenarios to MP4, extracts review frames with `ffmpeg`, and requires multiple nonblank frames while tolerating the first black GL startup frame.
- Native dynamic hand now uses three focus levels instead of a binary expanded/collapsed state: full hand for active play/touch/selection, a very low table-reveal state during opponent/stack motion, and a small opponent-turn peek so the hand stays reachable without covering the table.
- Added native debug scenarios `hand_idle_peek`, `local_draw_from_deck`, and `local_throw_to_stack`. The local motion scenarios trigger debug-only delayed autoanimations so screenrecord captures the draw/throw movement after the Samsung GL startup frames.
- Expanded the motion recorder default to cover local draw, local throw, hand reveal, opponent play, opponent draw, opponent penalty, and Joker/stack context in one pass.
- Strengthened `scripts/android_debug_scenarios_smoke.sh` with ImageMagick crop assertions when the matching baseline screenshots exist: `MAKAO` changes after declaration, `ZŁAP` changes after catch, request panel changes after choice, discard undercard region is visible, and screenshot black/blank checks remain active.
- Native manual throw gesture now uses a scored, sticky intent threshold that blends upward travel, table/discard proximity, direction, and velocity. Added `manual_throw_gesture` plus a slow controlled-drag Android interaction assertion so the harness verifies stable stack changes without relying only on ADB flicks.
- Added a guarded live two-client socket smoke path: backend exposes `debug_seed_game_state` only when `MAKAO_ENABLE_TEST_HOOKS=1`, `scripts/live_two_client_smoke.mjs` drives the Node/socket.io player, and `scripts/android_live_two_client_smoke.sh` launches Samsung/native as the other player. The smoke seeds deterministic live states and verifies opponent play, opponent draw, Makao declaration, catching Makao, and expired-Makao auto-penalty with phone screenshots/logcats.
- Strengthened `scripts/live_two_client_smoke.mjs` with ImageMagick crop assertions and extra before/after screenshots: stack changes after opponent play, opponent seat changes after draw, opponent status changes after Makao declaration and expired-Makao penalty, phone hand changes after catch penalty, plus exact state-count checks for opponent draw and catch `+5`.
- Added a real phone-side `ZŁAP` path to the live two-client smoke. The native client now lets visible `MAKAO`/`ZŁAP` game-state actions emit when it is connected to a room, avoiding stale room-status gating during deterministic live seeds. The live harness presses the Samsung `ZŁAP` button through ADB, verifies `catch_makao`, checks Node receives `+5`, and asserts the opponent status crop changes. The driver also exits cleanly on failures instead of leaving an open socket.
- Added a deterministic phone-side `MAKAO` declaration path to the live two-client smoke. Backend debug seed `phone_makao_ready` gives the Samsung enough declaration time for screenshot capture, the live driver taps the native `MAKAO` button and asserts it disappears, and the driver relaunches the phone client between independent phone-side tap scenarios so `ZŁAP` and `MAKAO` each run from a clean native activity state. Native `ZŁAP` hit detection also now recomputes the visible catch button from current game state as a fallback to the last rendered hitbox map.
- Live two-client smoke no longer needs to relaunch the native activity between the phone-side `ZŁAP` and phone-side `MAKAO` scenarios. The driver avoids Samsung `KEYCODE_MENU` wakeups that created transient attached popup windows, retries the `MAKAO` tap until the state confirms the declaration, and keeps an opt-in `--relaunch-before-phone-makao` fallback. Native visible `MAKAO`/`ZŁAP` actions now emit on an active socket connection and let the server validate room/action legality.
- Strengthened debug-scenario interaction assertions for dynamic hand behavior: `hand_focus_reveal` and `hand_idle_peek` now must visually expand after a hand-band touch.
- Strengthened `scripts/android_record_debug_scenarios.sh`: default recordings are now 7 seconds at 4 fps, and motion scenarios must show enough nonblank frames plus a minimum frame-difference score after startup, so static nonblack recordings no longer pass as motion review.
- Native draw-to-hand visual fix: a freshly drawn card is no longer auto-selected into a high hover state in prototype/debug flows, and `hiddenByFlight` is now guarded so a card can only stay hidden while a matching draw flight exists. If the backend clears `drawnCardInstanceId` but exactly one new card arrived after a pending draw, the unbound draw flight is attached to that card instead of leaving the real hand card visually disconnected.
- Backend disconnect stability: ordinary socket game actions now finalize through the same room mutation path as host/admin actions, so if a previously disconnected non-current player becomes current after another player's move, the room enters `game_paused_disconnect`, records that in `moveHistory`, and the existing 5-minute pause timeout can remove the blocker. Added RoomManager coverage for this delayed-offline-current path.
- Backend multi-offline timeout stability: after a disconnect pause timeout removes one offline player, RoomManager now re-checks the newly current player and immediately enters another `game_paused_disconnect` if that player is also offline, preventing 3+ player rooms from stalling outside the pause/cleanup path.
- Backend host-force active-effect stability coverage: RoomManager tests now cover double-confirm protection for forced offline effect resolution, host-forced offline As/Walet request acceptance, and forced offline `4` pause resolution re-entering `game_paused_disconnect` when the next current player is also offline.
- Live rule harness first slice: `debug_seed_game_state` and `scripts/live_two_client_smoke.mjs` now include deterministic Node/socket rule assertions for penalty war countering, 3-player `K pik` previous-player targeting, king-heart counter direction, As/Walet with request and with `none`, card 4 pause, queen clearing a request, and Joker declaration. The existing Samsung live smoke ran with these new rule scenarios plus prior visual checks.
- Live rule harness second slice: backend unit tests now explicitly cover legal same-suit battle batches (`2 kier + 2 kier`) and multiple same-suit battle kings. `debug_seed_game_state` and `scripts/live_two_client_smoke.mjs` now also cover live Node/socket multi-card penalty batch, accepting a draw penalty even while holding a counter, and accepting a two-pause `4` effect while holding a `4`. The live driver now derives `currentPlayerId` from `turnOrder/currentPlayerIndex` when the server payload does not include a denormalized field.
- Request draw resolution slice: `GameEngine.processDrawCard` now clears active As/Walet suit/rank requests before checking whether the drawn card is playable, so drawing accepts/ends the request and advances the turn as documented. Backend tests cover matching drawn suit/rank cards, and the guarded live Samsung/Node smoke now includes `rule_suit_request_draw_node` and `rule_rank_request_draw_node`.
- Last-card effect routing and multi-4 live slice: backend tests now cover 3-player finishing effects for last `2`, last `K pik`, and last Joker declared as `4`. `debug_seed_game_state` and `scripts/live_two_client_smoke.mjs` now also cover live Node/socket `rule_last_king_spades_finish_3p` and `rule_pause_multi_4_batch`.
- Active-effect target hardening: `GameEngine` now rejects wrong-player attempts to counter/accept draw penalties, accept a 4 pause, or draw to clear an As/Walet request if `activeEffect.targetPlayerId` points at another player. Backend regressions cover all four paths.
- Last-card live harness expansion: backend tests now also cover last `3` and last `K kier` finishing in 3-player games. The guarded live Samsung/Node smoke now covers last `2`, last `3`, last `K kier`, last `K pik`, last `4`, and last Joker declared as `4`.
- Last-card As/Walet request live slice: backend tests now cover last As/Walet with `Bez żądania`, and the guarded live Samsung/Node smoke covers last As/Walet with request and with `Bez żądania` in 3-player state.
- Joker/Dama live rule closure: backend tests now cover Joker declared as Walet creating a rank request, Joker battle declarations needing the active battle suit, and last Dama finishing without creating a new active effect. The guarded live Samsung/Node smoke now covers Dama clearing Walet rank requests, default Dama being rejected under draw penalty, Joker as battle counter, Joker as As request, and Joker as Walet request.
- Native table active-mechanic badges: Android now parses `activeEffect.battleSuit`, shows a compact badge beside the discard pile for suit request, rank request, draw penalty with battle suit, pause amount/target, and declared Joker context. The top Joker card stays visibly a Joker and avoids duplicate declared-identity text when the separate Joker context badge is visible.
- Native legal-card marking and tap blocking now follow active effects more closely: battle counters must match `battleSuit`, 4/pause answers are `4` or Joker, As/Walet requests highlight the requested suit/rank plus Dama and the corresponding request card, Joker remains selectable for legal declarations, and Dama is universal when no active penalty/request blocks it.
- Native table event bubbles: Android now displays short transient bubbles near opponent seats for played cards, draws, accepted penalties, pauses, Makao declarations/catches, and host-forced draw penalties. New real move-history events clear/replace old bubbles, stale last-move text under opponent chips was removed, and real move updates suppress duplicate central table notices so the badge/bubble layer carries the communication.
- Native draw-decision bubble: Android parses `moveHistory.details.canPlayDrawnCard` and shows `dobrał, decyduje` when an opponent draws a playable card and still has to decide whether to play it or pass.
- Native pause-4 table readability: Android now parses `turnEvents` in addition to `moveHistory` for `skip_added`, `skip_used`/`skip_finished`, `skip_accepted`, accepted-pause history, and host-forced `skip_turn`. Pause bubbles/badges now name the paused player, pause count/remaining pauses, and current player in short Polish copy, and the active badge/notice placement stays above the deck/stack area.
- Android debug harness crop assertions: `scripts/android_debug_scenarios_smoke.sh` now verifies table badge and opponent bubble crops with ImageMagick dark-panel metrics. Covered screenshots include suit/rank requests, draw penalty, Warsaw draw penalty, pause/4, Joker context, and opponent play/draw/penalty/pause/catch bubbles; missing screenshots are skipped for focused `--scenarios` runs.
- Native Warsaw queen legality: Android now parses `settings.queenVariant` from live game state and treats Dama kier/pik as legal under an active draw penalty only for `warsaw_pardon`, matching backend/web rules. Added `badge_warsaw_queen_penalty` debug scenario plus live Node/socket coverage for Dama kier cancelling a penalty in the Warsaw variant; existing backend coverage already covers Joker declared as Warsaw Dama kier.
- Backend first-player rotation leave edge: if the player scheduled to start the next game leaves before that game starts, `RoomManager` now advances to the next available player in the previous table order instead of resetting to the original selected starter. Regressions cover both the initially selected starter leaving before game one and the rotated next-game starter leaving after returning to lobby.
- Live first-player rotation coverage: `scripts/live_two_client_smoke.mjs` now creates a separate socket-only room and verifies real lobby/game events for selected-starter game 1, host-ended return to lobby, readiness reset, rotated-starter game 2, and next-starter rotation back to host before it launches the native phone room.
- Live socket disconnect/reconnect coverage: `scripts/live_two_client_smoke.mjs` now has `disconnect_before_blocking_turn_reconnect`. The temporary third Node client disconnects while not current, Node plays `K pik` so the offline client becomes the current/blocking active-effect target, the room must enter `game_paused_disconnect` with no `turn_timeout_loss`, and `reconnect_session` for the same `clientId` must clear the pause without removing the player.
- Native feedback/draw polish: LibGDX feedback now routes through one `FeedbackIntent` map for draw, play, landing, illegal, request, Makao, special, sort/shuffle, and opponent-event cues, using existing `NativeFeedback` haptics plus native OGG assets including `turn_ping.ogg`. Draw flights now add deck recoil, stronger landing bounce, wider multi-draw stagger, and final hand relayout/insert-slot cleanup after local draw landings.
- Backend Makao documentation/test closure: the old concept document now matches the canonical rule that Makao must be declared before a later winning move; no-Makao functional last-card attempts, `K trefl`/`K karo` non-battle behavior, and disconnect-pause targeting for `draw_penalty`/`suit_request`/`rank_request` are covered by backend tests.
- Native throw/hand polish: local throws now show a subtle armed magnet visual and warmer card glow, local discard flights temporarily lower the hand, and stack landings have a stronger settle/fan without rewriting the accepted manual throw gesture logic.
- Native opponent/table readability first slice: opponent seats now pulse for the current player, public hand-count changes pop, penalty/pause/Makao/play events trigger short seat impacts, and crowded-table event bubbles use denser collision-checked lanes that still avoid the deck, discard stack, and active stack badge. Added `multi_opponent_bubbles` to the Samsung debug harness with left/top/right crop assertions.
- Native event-bubble icon accents: opponent event bubbles now carry a compact icon slot for played cards, draws/decisions, penalties, pauses, Makao, catches, and pass/no-request events using the existing gameplay icon sheet/card art. Bubble copy was shortened so the icon carries card/effect detail without widening crowded 5-7 player lanes; the Android crop harness was adjusted to the actual side/top lanes.
- Native request-resolution bubbles: `RoomManager` move history now exposes safe public metadata for resolved As/Walet requests, and Android shows opponent request resolution as icon-accented `pas` / `spełnia` bubbles. The event-bubble layout now treats opponent seats as blockers, and the debug harness covers request-pass/request-resolved crops.

## Verification commands

Run from project root unless noted:

```bash
cd backend && npm test
cd frontend/android && ./gradlew :app:assembleDebug
```

Current verification baseline:

- backend `npm test`: 140/140 after request-resolution move-history coverage.
- Android `:app:compileDebugJavaWithJavac :app:assembleDebug`: BUILD SUCCESSFUL after native request-resolution bubble work.
- `node --check scripts/live_two_client_smoke.mjs` and `bash -n scripts/android_live_two_client_smoke.sh`: passed after first-player rotation harness expansion.
- Samsung smoke output: `output/android-smoke/native-makao-rules-table-20260521-samsung/`
- Latest Samsung smoke output: `output/android-smoke/native-hand-focus-opponents-20260521-samsung/`
- Debug-scenario Samsung smoke output: `output/android-smoke/native-debug-scenarios-20260521-samsung/`
- Final debug-scenario interaction smoke output: `output/android-smoke/native-debug-interactions-final-20260521-samsung/`
- Stack/draw/Joker follow-up smoke output: `output/android-smoke/native-stack-joker-redesign-final2-20260521-samsung/`
- Manual draw-drag screenshot: `output/android-smoke/native-stack-joker-redesign-final2-20260521-samsung/manual-draw-drag/draw-drag-gap.png`
- Draw insertion slot follow-up screenshots/logcat: `output/android-smoke/native-draw-insert-slot-final-20260521-samsung/`
- Draw insertion slot harness output: `output/android-smoke/native-draw-insert-slot-harness-20260521-samsung/`
- Joker panel redesign screenshot/logcat: `output/android-smoke/native-joker-panel-redesign-final-20260521-samsung/`
- Joker panel redesign harness output: `output/android-smoke/native-joker-panel-redesign-final-harness-20260521-samsung/`
- Joker single-badge cleanup screenshot/logcat: `output/android-smoke/native-joker-single-badge-20260521-samsung/`
- Joker single-badge cleanup harness output: `output/android-smoke/native-joker-single-badge-harness-20260521-samsung/`
- Stack two-visible screenshot/logcat: `output/android-smoke/native-stack-two-visible-20260522-samsung/`
- Fanned stack + deferred top sync screenshot/logcat: `output/android-smoke/native-stack-fanned-deferred-top-20260522-samsung/`
- Fanned stack + deferred top sync harness output: `output/android-smoke/native-stack-fanned-deferred-top-harness-20260522-samsung/`
- Joker undercard follow-up verification: `output/android-smoke/native-joker-under-card-advances-final-20260522-samsung/`
- Joker undercard follow-up harness output: `output/android-smoke/native-joker-under-card-advances-harness-20260522-samsung/`
- Opponent motion point 1 smoke/video output: `output/android-smoke/native-opponent-motion-20260522-samsung/`
- Opponent seats/readability smoke output: `output/android-smoke/native-opponent-seats-20260522-samsung/`
- Opponent seats/readability full harness output: `output/android-smoke/native-opponent-seats-harness-20260522-samsung/`
- Dynamic hand reveal smoke output: `output/android-smoke/native-hand-focus-reveal-final-20260522-samsung/`
- Motion review recordings/frames: `output/android-smoke/native-motion-review-final-20260522-samsung/`
- Dynamic hand peek smoke: `output/android-smoke/native-hand-peek-20260522-samsung/`
- Local draw/throw scenario smoke: `output/android-smoke/native-local-motion-scenarios-20260522-samsung/`
- Expanded current motion review recordings/frames: `output/android-smoke/native-motion-review-expanded-20260522-samsung/`
- Semantic debug harness assertions: `output/android-smoke/native-debug-semantic-assertions-20260522-samsung/`
- Manual throw focused Samsung smoke: `output/android-smoke/native-manual-throw-gesture-20260522-samsung/`
- Manual throw full Samsung harness: `output/android-smoke/native-manual-throw-full-harness-20260522-samsung/`
- Latest debug-scenario semantic harness: `output/android-smoke/native-debug-harness-hand-motion-20260522-044946-samsung/` (`MAKAO`, `ZŁAP`, request panel, hand reveal expand, idle peek expand, manual drag throw, and discard undercard crop assertions passed).
- Latest motion-review recordings/frames: `output/android-smoke/native-motion-review-motion-assertions-20260522-045735-samsung/` (7 scenarios, 28 frames each, 14-15 nonblank frames, frame-difference motion assertions passed).
- Live two-client Samsung/native + Node/socket.io smoke: first full build/install run `output/android-smoke/live-two-client-20260522-033956-5200df2eee05549b/`; latest no-relaunch phone-side `ZŁAP` + `MAKAO` rerun `output/android-smoke/live-two-client-no-relaunch-no-menu-20260522-044808-samsung/` (`result.json` ok, room `PJNPJ6`, `relaunchBeforePhoneMakao: false`, clean logcats, nonblank screenshots, seven `visualChecks` passed including real Samsung `ZŁAP` and `MAKAO` taps in one native activity session)
- Previous live rule harness smoke: `output/android-smoke/live-two-client-20260522-083217-5200df2eee05549b/` (`result.json` ok, room `YZO42J`, 31 rule scenarios / 38 total scenarios passed including request-draw acceptance for As/Walet, multi-card penalty batch, multi-card `4`, Node accept-penalty, Node accept-pause, temporary 3-player king cases, finishing last `2`, last `3`, last `K kier`, last `K pik`, last `4`, last Joker declared as `4`, last As/Walet with request/no-request, Dama clearing suit/rank requests, default Dama rejection under active penalty, Joker battle counter, Joker-as-As request, and Joker-as-Walet request; seven visual checks passed with clean logcats/nonblank screenshots).
- Native table badge focused Samsung smoke: `output/android-smoke/native-table-badges-final-20260522-samsung/` (`badge_suit_request`, `badge_rank_request`, `badge_draw_penalty`, `badge_skip_turn`, `badge_joker_context`, and `normal-no-debug` passed; screenshots visually inspected and logcats clean). Earlier pre-text-polish run kept at `output/android-smoke/native-table-badges-20260522-samsung/`.
- Native table event-bubble focused Samsung smoke: `output/android-smoke/native-event-bubbles-final-20260522-samsung/` (`opponent_play_history`, `opponent_draw_history`, `opponent_penalty_history`, `opponent_skip_history`, `opponent_catch_history`, and `normal-no-debug` passed; `event-bubbles-contact.png` visually inspected and strict logcat scan clean).
- Native draw-decision bubble Samsung smoke: `output/android-smoke/native-draw-decision-bubble-20260522-samsung/` (`opponent_draw_history` and `normal-no-debug` passed; screenshot visually inspected and strict logcat scan clean).
- Native Warsaw queen focused Samsung smoke: `output/android-smoke/native-warsaw-queen-penalty-20260522-samsung/` (`badge_warsaw_queen_penalty` and `normal-no-debug` passed; screenshot visually inspected and strict logcat scan clean).
- Native table crop-assertion focused Samsung smoke: `output/android-smoke/native-table-crop-assertions-20260523-samsung/` (`badge_suit_request`, `badge_rank_request`, `badge_draw_penalty`, `badge_warsaw_queen_penalty`, `badge_skip_turn`, `badge_joker_context`, `opponent_play_history`, `opponent_draw_history`, `opponent_penalty_history`, `opponent_skip_history`, `opponent_catch_history`, and `normal-no-debug` passed; all table badge/bubble crop assertions passed).
- Latest live rule harness smoke: `output/android-smoke/live-first-player-rotation-20260523-samsung/` (`result.json` ok, room `TY1ARB`, 41 total scenarios passed including `first_player_rotation_socket` and `disconnect_before_blocking_turn_reconnect`, seven visual checks passed with clean/nonblank screenshots and clean logcat scan). Prior live rule smoke kept at `output/android-smoke/live-two-client-20260523-190945-5200df2eee05549b/`.
- Native feedback/draw polish focused smoke: `output/android-smoke/native-feedback-draw-polish-20260523-samsung/` (`local_draw_from_deck`, `local_throw_to_stack`, `opponent_draw_history`, `opponent_play_history`, and `normal-no-debug` passed; targeted screenshots visually inspected).
- Latest phone-native gate: `output/android-smoke/phone-native-feedback-draw-polish-20260523-samsung/` (`result.json` ok, room `8T0F2I`, penalty accept drew `1 -> 3`, plain card drag played `3 -> 2`, top changed to `live_phone_plain_8_spades`, logcat scan clean, `serverErrors` empty).
- Latest backend rule/doc closure: `cd backend && npm test` passed with 139/139 tests.
- Native throw/hand polish focused smoke: `output/android-smoke/native-throw-hand-polish-20260523-samsung/` (`local_throw_to_stack`, `manual_throw_gesture`, `local_draw_from_deck`, `opponent_play_history`, `badge_joker_context`, and `normal-no-debug` passed; available crop assertions passed).
- Latest phone-native gate after throw polish: `output/android-smoke/phone-native-throw-hand-polish-20260523-samsung/` (`result.json` ok, room `FP2SA0`, penalty accept drew `1 -> 3`, plain card drag played `3 -> 2`, top changed to `live_phone_plain_8_spades`, `serverErrors` empty).
- Native opponent/table readability focused smoke: `output/android-smoke/native-opponent-readability-final-20260523-samsung/` (`multi_opponent_table`, `multi_opponent_bubbles`, `opponent_draw_history`, `opponent_penalty_history`, `opponent_skip_history`, `opponent_play_history`, `badge_draw_penalty`, `badge_skip_turn`, and `normal-no-debug` passed; available crop assertions passed including crowded-table left/top/right bubble lanes).
- Latest phone-native gate after opponent readability: `output/android-smoke/phone-native-opponent-readability-20260523-samsung/` (`result.json` ok, room `RVISEN`, penalty accept drew `1 -> 3`, plain card drag played `3 -> 2`, top changed to `live_phone_plain_8_spades`, `serverErrors` empty).
- Native event-bubble icon focused smoke: `output/android-smoke/native-event-bubble-icons-final-20260523-184710-samsung/` (`multi_opponent_bubbles`, `opponent_play_history`, `opponent_draw_history`, `opponent_penalty_history`, `opponent_skip_history`, `opponent_catch_history`, and `normal-no-debug` passed; available crop assertions passed for side/top/crowded bubble lanes).
- Latest phone-native gate after event-bubble icons: `output/android-smoke/phone-native-event-bubble-icons-20260523-184900-samsung/` (`result.json` ok, room `B7S43O`, penalty accept drew `1 -> 3`, plain card drag played `3 -> 2`, top changed to `live_phone_plain_8_spades`, `serverErrors` empty).
- Native request-resolution bubble focused smoke: `output/android-smoke/native-request-resolution-bubbles-final2-20260523-samsung/` (`opponent_request_pass_history`, `opponent_request_resolve_history`, and `multi_opponent_bubbles` passed; request-pass/request-resolved/crowded crop assertions passed).
- Native Android shell immersive focused smoke: `output/android-smoke/native-shell-immersive-20260523-samsung/` (`hand_idle_peek` and `normal-no-debug` passed, screenshots are full `1280x720`, strict logcat scan clean).
- Latest security maintenance: backend/frontend `npm audit` and `npm audit --omit=dev` now report `found 0 vulnerabilities`; backend `npm test` passed 140/140, frontend `npm run lint` and `npm run build` passed. No `--force` and no deploy.
- Final acceptance gate: `output/android-smoke/final-debug-gate-rerun-20260523-samsung/` (full debug scenarios, table badge/bubble crop assertions, and interaction checks passed), `output/android-smoke/final-phone-native-flow-20260523-samsung/` (`result.json` ok; penalty accept `1 -> 3`; plain drag play `3 -> 2`; top `live_phone_plain_8_spades`; `serverErrors` empty), and `output/android-smoke/final-live-two-client-20260523-samsung/` (`result.json` ok; 41 scenarios; seven visual checks). Final APK SHA-256 `32398084a1c94686036f100332e525a82910ff46686a69d2478874a64b019623`, installed on Samsung `5200df2eee05549b`, and pushed to `/sdcard/Download/makao-ze-znajomymi-native-gdx-debug.apk`.

## Next work

Manual throw finger review is accepted by the user as good enough to move on. Do not keep treating manual throw as the next blocker unless a later change regresses it.

Current 2026-05-23 agent handoff:
- Final acceptance is complete. Real remaining work is only: concrete new bugs found during manual gameplay, or production publication/deploy if the user explicitly asks for it. Do not start speculative autonomous polish just because this file still contains historical guard notes.
- The only issue found in the final audit was a stale Android harness crop for `opponent_draw_history`/`opponent_skip_history`; `scripts/android_debug_scenarios_smoke.sh` now checks the left-top bubble lane. No gameplay/input/manual-throw logic changed.
- Three high-reasoning agents audited the next direction. Backend/rules are not showing a large implementation gap for the currently listed Makao areas; the safest backend work is documentation cleanup and small regression tests.
- Feedback map + draw polish is now implemented and verified on Samsung. Latest phone-native gate passed at `output/android-smoke/phone-native-feedback-draw-polish-20260523-samsung/`: penalty accept drew `1 -> 3`, plain card drag played `3 -> 2`, top changed to `live_phone_plain_8_spades`, and `serverErrors` was empty.
- Backend-only closure is complete: the old concept document now says no-Makao finish attempts do not win, functional last-card/no-Makao cases are tested, `K trefl`/`K karo` do not create war, and disconnecting an active-effect target pauses for draw penalty, suit request, and rank request.
- Throw/hand polish after stable draw is complete and verified on Samsung. Keep the accepted manual throw logic intact; future edits here should stay small and must rerun focused debug smoke plus phone-native flow.
- Opponent/table readability first slice is complete and verified on Samsung. Current-player pulse, hand-count pop, penalty/pause/Makao/play impacts, and crowded bubble lane assertions are in place.
- Event-bubble icon accents are complete and verified on Samsung. Bubbles now use compact icon+copy for card/draw/penalty/pause/Makao/catch/pass events, with crop assertions updated for the actual side/top lanes and the phone-native flow still green.
- Request-resolution table readability is complete and verified on Samsung. Draw-to-clear request now reads as `pas` with a request icon, played-card fulfilment reads as `spełnia` with a request icon, and crowded bubble layout avoids opponent seats.
- First-player rotation live polish is now covered in the guarded Samsung live harness. `scripts/live_two_client_smoke.mjs` creates a separate socket-only room and verifies selected-starter game 1, host-ended return to lobby, readiness reset, rotated-starter game 2, and next-starter rotation back to host before running the native phone scenarios.
- Host/admin tools are already implemented in backend/web with double-confirm and private `adminLog` coverage; do not treat that as an open blocker unless a new concrete admin-flow bug appears.
- Android native shell immersive first slice is complete: the LibGDX launcher now uses no-actionbar/no-title fullscreen, reapplies sticky immersive flags on resume/focus, and passed Samsung focused smoke at `output/android-smoke/native-shell-immersive-20260523-samsung/`.
- Security maintenance is complete for the current lockfiles without forced breaking upgrades. Transitive fixes include backend `qs@6.15.2`, `engine.io@6.6.8`, `socket.io-adapter@2.5.7`, `ws@8.20.1`, and frontend `engine.io-client@6.6.5` / `ws@8.20.1`.
- No autonomous slice remains after the final acceptance gate. Continue only with a concrete Android lobby/table/manual-play regression found by the user or screenshots, or with production publication/deploy if the user requests it. Keep the active stack badge as the source of truth and avoid accepted manual throw/input logic unless a regression appears.

1. Rules audit and backend closure against `koncept_makao_ze_znajomymi_wersja_scalona_doprecyzowana.md`.
   Current backend/doc closure is done for the known small gaps. If future work touches rules, keep using focused backend regressions plus full `cd backend && npm test`; the old concept document must stay aligned with canonical Makao.
2. Penalty-war rules and UI legality.
   Backend/live coverage is strong and native legal-card highlighting/tap blocking now uses `battleSuit`. Next value here is only a focused regression if a later change touches battle legality or Joker battle declarations.
3. Pause/4 rules and messages.
   Backend `GameEngine` turnEvents now make pause flow explicit for card 4, and native Android consumes those turn events for table bubbles/badges. Pause counters must remain visible next to affected players. Continue only with live-play readability issues or crop assertions if future UI work changes table geometry.
4. As/Walet request rules and UI state.
   Backend and live harness now cover request, `Bez zadania`, and drawing to accept/end the request. Native badge shows active suit/rank requests, and request-resolution bubbles now cover both draw/pass clearing and played-card fulfilment with request icons. Continue only with concrete live-play readability issues.
5. Dama and Joker rule readability.
   Backend and live harness now cover Dama request clearing, default Dama rejection under draw penalty, Warsaw Dama kier/pik penalty pardon, Joker battle/request paths, Joker-as-Warsaw-Dama, and last Dama/Joker finishing effects. Native Joker context badge keeps the top card visibly a Joker, avoids duplicate declared-identity text, and native legal-card marking now respects `queenVariant`. Continue only with readability issues found in live play.
6. Draw-after-no-play flow.
   Web and native now say clearly that a player who drew a playable card is deciding whether to play it or pass; native opponent bubbles show `dobrał, decyduje`. If future work touches this flow, keep verifying that Makao appears after playing the drawn card down to one card, not before.
7. Online room stability.
   The delayed offline-current stall, chained multi-offline pause-timeout stall, host-forced offline active-effect edge regressions, and a real live socket disconnect/reconnect blocking-player path are covered. Continue only with still-missing lifecycle edges or UI clarity around disconnect pauses. Keep the rule that ordinary turn timeouts do not kick players; only a paused/blocking room may be cleaned up after 5 minutes.
8. Live rule harness expansion.
   Current slices in `scripts/live_two_client_smoke.mjs`: first-player rotation through real socket lobby/game events, penalty counter, multi-card penalty batch, Node accept-penalty, Node accept-pause, temporary 3-player `K pik` previous target, king-heart counter direction, finishing last `2`/`3`/`K kier`/`K pik`/`4`/Joker-as-4/As/Walet routing in 3-player state, As/Walet request/no-request, As/Walet draw-to-pass request resolution, single and multi-card 4/pause, queen suit/rank request cancel, default queen rejection under penalty, Warsaw queen penalty cancel, Joker plain declaration, Joker battle counter, Joker-as-As request, Joker-as-Walet request, live disconnect-before-blocking-turn reconnect, plus Makao/catch visual paths. Continue only with genuinely missing multi-client edge cases; the bigger next value is table communication/UI badges for these already-tested effects.
9. Table communication layer.
   Badge and event-bubble first slices are done, including pause/4 turn-event wording, safer deck/stack placement, focused visual crop assertions for table badges/bubbles, compact Polish copy, icon-style request/Joker badges, current-player pulse, hand-count pop, penalty/pause impacts, crowded-table bubble lane assertions, icon-accented event bubbles for card/draw/penalty/pause/Makao/catch/pass events, and request-resolution `pas`/`spełnia` bubbles. Current request copy rule: do not render literal bracket markers and do not use the word `żądanie`/`żąda` in table badges; active requests use `{gracz} ! ♥` or `{gracz} ! 8`, request-resolution bubbles use short verbs plus icons, the choice strip uses `! kolor` / `! wartość`, and Joker context uses bitmap Joker/arrow/card/suit regions from `native/ui/icon_gameplay.png`, not text arrows or font card ranks. Event bubbles are laid out as a whole layer with collision checks against other bubbles plus deck/stack/active-badge/opponent-seat blockers; update crop coordinates if table geometry changes. Continue here only for concrete live-play readability issues.
10. Native draw-to-hand regression guard.
   The draw-to-hand visual bug must be verified with a real Socket.IO phone flow, not only debug `local_draw_from_deck`. The current fix keeps `pendingDrawRequest` alive through intermediate states, starts a late reveal flight if the server returns the drawn hand card after the original ghost animation has ended, binds all new hand cards after a multi-card penalty draw instead of only the first one, and prevents local hand draw cards from binding to opponent/table-reveal flights. `NativeGameClient` draw/play methods now return whether an event was actually emitted; pending state must not be trusted if the method returns false. Direct drag-to-stack must stay guarded by turn/card legality before throw animation. Known passing outputs: `output/android-smoke/native-draw-flight-pending-fix-20260523-113005-samsung/`, `output/android-smoke/live-phone-draw-pending-fix-20260523-113710-samsung/`, `output/android-smoke/live-phone-draw2-throw-20260523-142115-samsung/`, `output/android-smoke/live-phone-throw-8-20260523-142302-samsung/`, and `output/android-smoke/phone-native-flow-20260523-145243-5200df2eee05549b/`.
   Use the permanent phone-native harness for future regressions:
   `ANDROID_SERIAL=5200df2eee05549b scripts/android_phone_native_flow_smoke.sh --skip-build --skip-install --port 3119`
11. Native discard-stack visual guard.
   The stack now uses incremental visual state: a new top card is only synced to `discardTop` after the matching discard flight lands, and the two visible undercards are maintained from the previous visual top plus same-move played cards instead of rebuilding the stack freely from history every state update. Visual Joker badges read the visible `discardTop`, not the immediately updated logical `latestState.topCard`. Future changes to `syncDiscardVisual`, `startThrowFlight`, `startOpponentPlayFlights`, or `CardFlight` should run:
   `ANDROID_SERIAL=5200df2eee05549b scripts/android_debug_scenarios_smoke.sh --skip-build --skip-install --scenarios local_throw_to_stack,manual_throw_gesture,opponent_play_history,badge_joker_context,joker_declaration_panel --wait-sec 5`
   and then the phone-native harness above.
12. Native feedback/draw polish guard.
   Feedback intent mapping and draw-feel polish are in place. Future changes to draw/play feedback or `CardFlight` should at minimum rerun:
   `ANDROID_SERIAL=5200df2eee05549b scripts/android_debug_scenarios_smoke.sh --skip-build --skip-install --scenarios local_draw_from_deck,local_throw_to_stack,opponent_draw_history,opponent_play_history --wait-sec 5`
   and then the phone-native harness above.
13. Native throw/hand polish guard.
   Armed throw magnet visuals, local hand lowering during discard flights, and discard settle/fan are in place. Future changes to throw feel or local discard flights should rerun:
   `ANDROID_SERIAL=5200df2eee05549b scripts/android_debug_scenarios_smoke.sh --skip-build --skip-install --scenarios local_throw_to_stack,manual_throw_gesture,local_draw_from_deck,opponent_play_history,badge_joker_context --wait-sec 5`
   and then the phone-native harness above.
14. Later polish after the rule/harness pass.
   First-player rotation backend/lobby flow is covered by tests and by the live socket harness, including selected-starter rotation across two games and leave-edge unit coverage. Host/admin tools with double-confirm and `adminLog` are already implemented and covered. Android native shell immersive first slice is complete; continue here only for concrete lobby overflow/readability findings. Npm audit/security maintenance is complete for the current lockfiles without forced breaking upgrades.

## Night Automation

- Updated runner: `scripts/night_codex_loop.sh`.
- Smoke output: `output/night-codex-smoke-20260522/`.
- Safe one-round diagnostic:

```bash
LOG_DIR=output/night-codex-smoke-$(date +%Y%m%d-%H%M%S) MAX_ROUNDS=1 SLEEP_SECONDS=1 SMOKE_PROMPT=1 scripts/night_codex_loop.sh
```

- Overnight autonomous run with system sleep blocked:

```bash
mkdir -p output/night-codex
MAX_ROUNDS=12 SLEEP_SECONDS=30 nohup scripts/run_night_codex_awake.sh > output/night-codex/runner.out 2>&1 &
```

- Monitor:

```bash
tail -f output/night-codex/night.log
```

- Confirm sleep inhibitor while it is running:

```bash
systemd-inhibit --list --no-pager | rg "Codex Makao night runner|sleep:idle"
```

## ADB notes

- Samsung Android 10 was previously usable over ADB and supports the lowered min SDK.
- APK path after build: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
- Installed copy convention used earlier: `/sdcard/Download/makao-ze-znajomymi-native-gdx-debug.apk`.
- Prefer no sudo for ADB unless the device is not visible and udev/permissions block access.
- Repeatable debug harness:

```bash
ANDROID_SERIAL=5200df2eee05549b scripts/android_debug_scenarios_smoke.sh --with-interactions
```

- Repeatable live two-client harness:

```bash
ANDROID_SERIAL=5200df2eee05549b scripts/android_live_two_client_smoke.sh
```

- The script wakes the Samsung and enables `svc power stayon true`; this avoids black portrait screenshots when the physical display sleeps during long ADB runs.
- Debug scenario launch example:

```bash
adb shell am start -S -n pl.makao.zeznajomymi/.MakaoNativeActivity \
  --es debugScenario ace_request_panel \
  --es serverUrl http://127.0.0.1:9 \
  --es playerName Codex
```

- On the Samsung Android 10 device, wait about 5 seconds after `am start -S` before screenshot capture. Earlier 1-2 second screenshots can be black while the GL context is still starting.
