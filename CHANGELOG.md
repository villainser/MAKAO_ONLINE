# Zmiany w Makao

## Wersja 1.0.2 — build 3

### Rozgrywka i sesje

- Obsługa wielokartowych ruchów kończących partię i deklaracji Makao przed
  zagraniem ostatnich kart.
- Poprawki interakcji kar dobierania, pauz, waletów, asów, króli i jokerów.
- Ponawianie akcji z identyfikatorem `actionId`, kontrola wersji stanu
  i zabezpieczenie przed ponownym wykonaniem tego samego ruchu.
- Trwały zapis pokojów, odzyskiwanie sesji po restarcie backendu i dostarczanie
  rezygnacji gracza po odzyskaniu połączenia.
- Prywatne tokeny wznowienia sesji oraz obsługa nieprawidłowych żądań Socket.IO.

### Interfejs i Android

- Animacje zagrywania i dobierania kart powiązane z potwierdzeniem ruchu przez
  serwer; ustawienia ograniczania ruchu i haptyki.
- Rozwijane menu startowe i odświeżony wygląd stołu przeglądarkowego.
- Natywny stół LibGDX połączony z menu i nakładkami React/Capacitor.
- Udostępnianie zaproszeń, wklejanie kodów i linków oraz odbieranie zaproszeń
  przez aplikację Android.
- Konfigurowalny adres backendu i migracja ustawień ze wskazanych wycofanych
  serwerów.
- Wersjonowane pliki APK pod nazwą Makao.

### Narzędzia projektu

- Testy zasad, sesji, obsługi żądań i interfejsu oraz testy JVM Androida.
- Scenariusze sprawdzające rozłączenia, restart backendu i grę dwóch klientów.
- Instrukcje uruchomienia, budowania Androida i wdrożenia za Nginx z HTTPS.
