# Makao

Wieloosobowa gra karciana na przeglądarkę i Androida. Twórz pokoje, zapraszaj
graczy i rozgrywaj partie Makao ze wspólnym stanem stołu aktualizowanym w czasie
rzeczywistym. Serwer sprawdza każdy ruch, rozstrzyga działanie kart i pozwala
wrócić do partii po utracie połączenia.

Projekt obejmuje aplikację webową, klienta Android oraz backend Node.js.
Interfejs gry jest w języku polskim.

## Rozgrywka

- Pokoje dla 2–8 graczy, ustawienia 1–3 talii, lobby i zaproszenia udostępniane
  kodem lub linkiem.
- Zagrywanie wielu kart, żądania koloru i wartości, kary dobierania, pauzy,
  deklaracje jokerów oraz zgłaszanie i łapanie Makao.
- Animacje kart, dźwięki, ustawienia haptyki i ograniczania ruchu.
- Wznawianie sesji i ponawianie niepotwierdzonych akcji po rozłączeniu.
- Opcjonalny zapis pokojów na dysku, umożliwiający odtworzenie gry po restarcie
  backendu.

Przeglądarka wyświetla stół w React. Aplikacja Android łączy menu i nakładki
React/Capacitor z natywnym stołem LibGDX. Wersja Androida zapisana w
[`version.properties`](frontend/android/version.properties) to **1.0.2, build 3**.

## Uruchomienie lokalne

Potrzebne są Node.js 22 (co najmniej 22.13) lub 24+ oraz npm. Polecenia wykonuj z katalogu
repozytorium:

```bash
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend start
```

W drugim terminalu uruchom interfejs:

```bash
npm --prefix frontend run dev
```

Otwórz adres pokazany przez Vite. W zakładce **Ustawienia**, w polu **Serwer**,
wpisz `http://localhost:3001` i zatwierdź. Przeglądarka domyślnie łączy się z
własnym adresem strony; serwer deweloperski Vite nie przekazuje żądań Socket.IO
do backendu. Po połączeniu można utworzyć pokój i dołączyć do niego z drugiej
przeglądarki.

Backend używa portu `3001`; można go zmienić przez `PORT`. Opcjonalna zmienna
`MAKAO_STATE_FILE` wskazuje plik trwałego zapisu pokojów. Bez niej stan pozostaje
w pamięci procesu. Plik stanu zawiera dane sesji i nie powinien trafiać do Git.

## Testy i budowanie

```bash
npm --prefix backend test
npm --prefix frontend test
node --test scripts/test/*.test.mjs
npm --prefix frontend run lint
npm --prefix frontend run build
node scripts/reliable_disconnect_smoke.mjs
```

Ostatni skrypt uruchamia własny backend i sprawdza ponawianie ruchów, odzyskanie
sesji oraz odtworzenie stanu po restarcie. Wynik budowania strony trafia do
`frontend/dist/`.

## Android

Potrzebne są JDK 21 i Android SDK z platformą API 36. Aplikacja wymaga Androida
10 lub nowszego (API 29). Ustaw `JAVA_HOME` na JDK 21 oraz `ANDROID_SDK_ROOT`
na katalog SDK.

Podaj adres backendu osiągalny z telefonu. Poniższy adres jest przykładem:

```bash
./scripts/android_build_debug.sh https://game.example
./scripts/android_apk_path.sh debug
```

Skrypt buduje stronę, synchronizuje Capacitor i tworzy APK debug. Druga komenda
wypisuje ścieżkę do pliku `Makao-v1.0.2-build3-debug.apk`.
Budowanie nie instaluje aplikacji na urządzeniu.

Testy Androida można uruchomić po synchronizacji:

```bash
cd frontend/android
VITE_SERVER_URL=https://game.example ./gradlew \
  -Dorg.gradle.java.home="$JAVA_HOME" :app:testDebugUnitTest
```

Konfigurację adresu i listę wycofanych serwerów pokazuje
[`deployment.env.example`](deployment.env.example). `VITE_SERVER_URL` ustala
początkowy backend aplikacji Android, a `VITE_RETIRED_SERVER_URLS` pozwala
przenieść zapisane ustawienia tylko ze wskazanych starych adresów. Gracz może
zmienić serwer w ustawieniach aplikacji.

## Kod i wdrożenie

| Katalog | Zawartość |
| --- | --- |
| `backend/` | Silnik zasad, pokoje, protokół Socket.IO i zapis stanu |
| `frontend/src/` | Menu, lobby, stół przeglądarkowy i most do Androida |
| `frontend/android/` | Projekt Android, stół LibGDX i testy JVM |
| `shared/` | Wspólne zdarzenia, stałe i definicje kart |
| `scripts/` | Budowanie APK i scenariusze weryfikacji |
| `deploy/` | Pakowanie wydania, konfiguracja Nginx i usługa systemd |

Backend jest źródłem stanu rozgrywki. Klienci wysyłają zamiar ruchu wraz z
`actionId` i oczekiwaną wersją stanu; serwer sprawdza uprawnienia i zasady,
odrzuca nieaktualny ruch lub potwierdza jego wykonanie. Ponowienie zaakceptowanej
akcji nie wykonuje jej drugi raz. Prywatne tokeny wznowienia sesji są przekazywane
w odpowiedziach do konkretnego klienta, poza publicznym stanem pokoju.

Katalogi `backend/shared` i `frontend/src/shared` są dowiązaniami do `shared/`.
Przy klonowaniu zachowaj dowiązania symboliczne.

[`deploy/README.md`](deploy/README.md) opisuje wdrożenie za Nginx z HTTPS.
[`frontend/README.md`](frontend/README.md) opisuje zasoby graficzne i dźwiękowe.
Gotowe zasoby są w repozytorium; zwykłe budowanie nie wymaga lokalnych
materiałów źródłowych ani ponownego generowania atlasów.

Historia zmian aplikacji znajduje się w [CHANGELOG.md](CHANGELOG.md).
