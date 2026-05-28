#!/usr/bin/env bash
set -u

PROJECT_DIR="${PROJECT_DIR:-/home/villains/Dokumenty/MAKAO}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/output/night-codex}"
MAX_ROUNDS="${MAX_ROUNDS:-24}"
SLEEP_SECONDS="${SLEEP_SECONDS:-20}"
MODEL_ARGS="${MODEL_ARGS:-}"
SMOKE_PROMPT="${SMOKE_PROMPT:-0}"
PROMPT_FILE="${PROMPT_FILE:-}"

mkdir -p "$LOG_DIR"

write_smoke_prompt() {
  cat <<'EOF'
To jest test automatyzacji nocnej Codex dla projektu Makao.

Nie edytuj plików i nie uruchamiaj długich testów. Sprawdź tylko, że jesteś w stanie odpowiedzieć w tym trybie.

Na końcu finalnej odpowiedzi wpisz dokładnie:
NIGHT_DONE
EOF
}

write_default_prompt() {
  cat <<EOF
Kontynuuj pracę nad grą Makao w katalogu $PROJECT_DIR.

Kontekst:
- Użytkownik śpi; pracuj autonomicznie w małych, kompletnych krokach.
- Nie pytaj o potwierdzenie, chyba że operacja jest destrukcyjna lub wymaga sekretów.
- Nie deployuj produkcji i nie rób zmian poza projektem, jeśli nie jest to konieczne do testów.
- Nie cofaj cudzych zmian. Jeżeli widzisz istniejące modyfikacje, pracuj z nimi.
- Samsung Android 10 jest dostępny jako preferowane urządzenie testowe, gdy ADB go widzi: 5200df2eee05549b.

Czytaj najpierw:
- codex_resume_plan.md
- progress.md
- raport_realizacji_planu_makao.html tylko gdy potrzebujesz kontekstu historycznego
- koncept_makao_ze_znajomymi_wersja_scalona_doprecyzowana.md tylko sekcje potrzebne do bieżącego punktu

Aktualny stan:
- Użytkownik zaakceptował feeling manualnego rzutu palcem na Samsungu.
- Dynamiczna ręka, fanned stos, Joker panel, realne ZŁAP/MAKAO tapy, ikonografia żądań/Jokera i live two-client smoke mają już działającą bazę.
- Najnowsza bramka realnego telefonu przeszła: phone-native flow potwierdził dobieranie kary 1 -> 3, zagranie karty 3 -> 2 i stabilny top/stos bez server errors.
- Backend reguł Makao jest mocno pokryty; zostały głównie niespójności dokumentacji i małe backend-only test gaps.
- Teraz nie wracaj do manualnego rzutu jako blockera, chyba że nowa zmiana go popsuje.

Aktualne priorytety, w tej kolejności:
1. Feedback map + polish dobierania:
   - zintegruj spójną mapę intencji feedbacku dla draw/play/land/illegal/request/Makao/special/opponent event,
   - użyj istniejących NativeFeedback i audio assetów zamiast rozproszonych wywołań,
   - popraw deck recoil, landing bounce, multi-draw stagger i relayout ręki po lądowaniu,
   - po zmianach obowiązkowo Android build, focused debug smoke i phone-native flow.
2. Backend-only domknięcia bez ryzyka UI:
   - ujednolić dokumentację: canonical Makao wymaga deklaracji przed wygraną; stary koncept nie może mówić odwrotnie,
   - dodać testy no-Makao finish kartami funkcyjnymi,
   - dodać testy, że K trefl/K karo nie tworzą wojny,
   - dodać RoomManager testy disconnect targeta aktywnych efektów: draw_penalty, suit_request, rank_request.
3. Throw/hand polish po stabilnym draw:
   - magnet/armed visual przy rzucaniu, mocniejszy settle/fan na stosie, lokalne chowanie ręki podczas lotu karty,
   - nie ruszaj zaakceptowanej logiki manualnego rzutu poza małymi poprawkami feelingu.
4. Przeciwnicy i czytelność stołu:
   - current-player pulse, hand-count pop po dobraniu, shake/impact dla kar i pauz,
   - dymki z ikonami, bez nakładania, także przy 5-7 graczach,
   - aktywne badge przy stosie zostaje źródłem prawdy dla żądań/kar/pauz/Jokera.
5. Harness/bramki:
   - rozszerz istniejące debug/live/phone smoke tylko wtedy, gdy nowa funkcja wymaga pokrycia,
   - po zmianach natywnych uruchom minimum Gradle build; po zmianach input/draw/throw uruchom phone-native flow,
   - po zmianach reguł uruchom backend npm test i, jeśli dotykasz live flow, android_live_two_client_smoke.
6. Dopiero po powyższych punktach:
   - rotacja pierwszego gracza w kolejnych partiach,
   - host/admin tools z double-confirm i adminLog,
   - Android shell/lobby immersive/overflow polish,
   - security maintenance npm audit bez wymuszania breaking upgrade.

Zasady pracy:
- Po każdej istotnej zmianie uruchom adekwatny build/test, minimum Android Gradle build dla zmian natywnych.
- Gdy używasz telefonu, zapisuj screenshoty/logcat do output/android-smoke/<opis>-<data>-samsung/.
- Aktualizuj progress.md i codex_resume_plan.md po kompletnym kawałku.
- Jeśli zadanie jest duże, zrób najmniejszy kompletny pionowy wycinek i zostaw konkretny następny krok.
- Jeżeli nie da się użyć telefonu, zrób część kodową/harnessową i jasno zapisz blokadę.

Na samym końcu finalnej odpowiedzi wpisz dokładnie jeden marker:
NIGHT_CONTINUE - jeśli kolejna iteracja ma dalej pracować samodzielnie,
NIGHT_DONE - jeśli wszystko z aktualnego planu jest gotowe albo dalszy krok wymaga ręcznego testu użytkownika.
EOF
}

round=1
while [ "$round" -le "$MAX_ROUNDS" ]; do
  stamp="$(date +%Y%m%d-%H%M%S)"
  out_file="$LOG_DIR/round-${round}-${stamp}.last.txt"
  json_log="$LOG_DIR/round-${round}-${stamp}.jsonl"
  prompt_path="$LOG_DIR/round-${round}-${stamp}.prompt.txt"

  if [ -n "$PROMPT_FILE" ]; then
    cp "$PROMPT_FILE" "$prompt_path"
  elif [ "$SMOKE_PROMPT" = "1" ]; then
    write_smoke_prompt > "$prompt_path"
  else
    write_default_prompt > "$prompt_path"
  fi

  echo "[$(date --iso-8601=seconds)] start round $round/$MAX_ROUNDS" | tee -a "$LOG_DIR/night.log"

  # shellcheck disable=SC2086
  codex exec \
    -C "$PROJECT_DIR" \
    --skip-git-repo-check \
    --dangerously-bypass-approvals-and-sandbox \
    --json \
    -o "$out_file" \
    $MODEL_ARGS \
    - < "$prompt_path" \
    > "$json_log" 2>&1

  exit_code=$?
  echo "[$(date --iso-8601=seconds)] round $round exit code $exit_code" | tee -a "$LOG_DIR/night.log"

  if [ -f "$out_file" ] && grep -q "NIGHT_DONE" "$out_file"; then
    echo "[$(date --iso-8601=seconds)] NIGHT_DONE found, stopping" | tee -a "$LOG_DIR/night.log"
    exit 0
  fi

  if [ "$exit_code" -ne 0 ]; then
    echo "[$(date --iso-8601=seconds)] codex exec failed, stopping; see $json_log" | tee -a "$LOG_DIR/night.log"
    exit "$exit_code"
  fi

  if [ -f "$out_file" ] && ! grep -q "NIGHT_CONTINUE" "$out_file"; then
    echo "[$(date --iso-8601=seconds)] no NIGHT_CONTINUE marker, stopping for safety; see $out_file" | tee -a "$LOG_DIR/night.log"
    exit 0
  fi

  round=$((round + 1))
  sleep "$SLEEP_SECONDS"
done

echo "[$(date --iso-8601=seconds)] max rounds reached, stopping" | tee -a "$LOG_DIR/night.log"
