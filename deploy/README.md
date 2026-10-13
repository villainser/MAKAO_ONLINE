# Wdrożenie Makao

Makao działa za Nginx: pliki aplikacji webowej są serwowane statycznie, a żądania
Socket.IO trafiają do backendu Node.js. Instalator obsługuje systemy z `apt-get`
(Debian/Ubuntu) i `dnf` (AlmaLinux/RHEL).

W przykładach `game.example` i `203.0.113.10` oznaczają domenę oraz publiczny
adres docelowego serwera. Zastąp je własnymi wartościami. `makao-server` to
przykładowy alias w konfiguracji klienta SSH. Klucze SSH przechowuj poza projektem.

## Układ usługi

```text
Nginx :80/:443
  /              → /var/www/makao
  /socket.io/    → 127.0.0.1:3001

systemd: makao-backend.service
  kod backendu   → /opt/makao/backend
  stan pokojów   → /opt/makao/data/rooms.json
```

Przeglądarka domyślnie łączy się z adresem strony (`window.location.origin`).
Frontend i proxy Socket.IO powinny zatem działać pod tą samą domeną.
`VITE_SERVER_URL` określa początkowy adres backendu w aplikacji Android.

## Przygotowanie wydania

Zainstaluj zależności zgodnie z [głównym README](../README.md), a następnie
wykonaj z katalogu repozytorium:

```bash
npm --prefix frontend run build
./deploy/build_release.sh
```

Archiwum `output/deploy/makao-release.tar.gz` zawiera backend, wspólny kod,
zbudowaną stronę i pliki wdrożeniowe. Dowiązanie `backend/shared` jest podczas
pakowania zastępowane rzeczywistymi plikami. Archiwum nie zawiera danych pokojów.

## Instalacja na serwerze

Przed aktualizacją zachowaj poprzednie pliki aplikacji, konfigurację Nginx,
jednostkę systemd oraz aktualny zapis pokojów. Instalator zastępuje kod i
konfigurację witryny oraz restartuje backend. Na serwerze obsługującym inne
witryny przejrzyj wcześniej jego działania w
[`install_on_vm.sh`](install_on_vm.sh), w tym obsługę domyślnej witryny Nginx.

Skopiuj archiwum i połącz się ze skonfigurowanym serwerem:

```bash
scp output/deploy/makao-release.tar.gz makao-server:/tmp/
ssh makao-server
```

Na serwerze rozpakuj wydanie i uruchom instalator:

```bash
mkdir -p "$HOME/releases"
tar -xzf /tmp/makao-release.tar.gz -C "$HOME/releases"
sudo bash "$HOME/releases/makao-release/deploy/install_on_vm.sh" \
  game.example "$HOME/releases/makao-release" 203.0.113.10
```

Instalator tworzy konto systemowe `makao`, instaluje zależności, kopiuje pliki
aplikacji i uruchamia `makao-backend.service`. W systemach z SELinux dopuszcza
połączenia proxy Nginx. Jeśli działa `firewalld`, dodaje usługi HTTP i HTTPS.
Reguły sieciowe dostawcy chmury trzeba skonfigurować oddzielnie.

## HTTPS i odbiór wdrożenia

Skieruj rekord DNS `A` domeny na publiczny adres serwera. Udostępnij porty TCP
80 i 443 w regułach sieciowych serwera i dostawcy chmury. Następnie wykonaj:

```bash
sudo certbot --nginx -d game.example
sudo nginx -t
systemctl status makao-backend
```

Sprawdź stronę w przeglądarce oraz utworzenie pokoju i dołączenie drugiego
gracza. Z komputera z zainstalowanymi zależnościami projektu można dodatkowo
uruchomić:

```bash
node scripts/production_release_smoke.mjs https://game.example
```

Ten test tworzy tymczasowy pokój, łączy dwóch klientów przez WebSocket,
sprawdza prywatne odpowiedzi z tokenami sesji, a następnie opuszcza i usuwa pokój.

## Stan pokojów i aktualizacje

Jednostka systemd ustawia
`MAKAO_STATE_FILE=/opt/makao/data/rooms.json`. Backend zapisuje stan atomowo,
a przy poprawnym zamknięciu procesu opróżnia kolejkę zapisów. Katalog danych
jest oddzielony od kodu synchronizowanego przez `rsync --delete`, dzięki czemu
instalator nie usuwa go przy aktualizacji.

Dostęp do pliku stanu powinno mieć wyłącznie konto usługi: zawiera dane
rozgrywek i sesji. Nie umieszczaj go w repozytorium ani w publicznych archiwach.
Na serwerze produkcyjnym pozostaw wyłączone `MAKAO_ENABLE_TEST_HOOKS` i
`MAKAO_ENABLE_LEGACY_GAME_ACTIONS`.

Jeśli aktualizacja nie przejdzie odbioru, przywróć poprzedni kod i konfigurację,
sprawdź `nginx -t`, a następnie uruchom ponownie backend i przeładuj Nginx.
Nie nadpisuj bieżącego zapisu pokojów starszą kopią bez oceny wpływu na trwające
rozgrywki.

Lokalny test zachowania sesji i odporności na restart:

```bash
node scripts/reliable_disconnect_smoke.mjs
```

## Android

Wersję aplikacji określa
[`frontend/android/version.properties`](../frontend/android/version.properties).
Przed dystrybucją nowej wersji zwiększ `VERSION_CODE` i zaktualizuj
`VERSION_NAME`. Plik APK ma nazwę `Makao-v<WERSJA>-build<NUMER>-<wariant>.apk`.

Z katalogu repozytorium zbuduj APK dla docelowego serwera:

```bash
./scripts/android_build_debug.sh https://game.example
APK="$(./scripts/android_apk_path.sh debug)"
APK_NAME="$(basename "$APK")"
```

Wybierz konkretne urządzenie z `adb devices -l`. W poniższym przykładzie
zastąp `NUMER_URZADZENIA` jego identyfikatorem:

```bash
DEVICE=NUMER_URZADZENIA
adb -s "$DEVICE" install -r "$APK"
adb -s "$DEVICE" push "$APK" "/sdcard/Download/$APK_NAME"
```

Jest to kompilacja debug do testowania. Konfiguracja podpisywania wydania
produkcyjnego i prywatny klucz podpisu nie są częścią tego procesu.
