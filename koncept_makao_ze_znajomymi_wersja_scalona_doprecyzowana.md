# Koncept aplikacji mobilnej: Makao ze znajomymi

Wersja scalona na podstawie plików `aktualizacja.md` i `aktualizacja_v2.md`. Bazą jest `aktualizacja.md`, z przeniesionymi doprecyzowaniami dotyczącymi asów, waletów, damy, ruchów wielokartowych, przetasowania, Makao oraz wybranych zasad UI. Wersja uzupełniona o doprecyzowania końca gry, dobrania i natychmiastowego zagrania karty, rozliczania efektów po wygranej gracza, uprawnień hosta oraz scenariuszy testowych silnika zasad.

## 1. Założenie główne

Aplikacja służy wyłącznie do gry w Makao ze znajomymi. Nie ma losowego matchmakingu, nie ma botów i nie ma automatycznego zastępowania graczy.

Główna pętla użycia:

1. Gracz tworzy pokój.
2. Aplikacja generuje kod albo link zaproszenia.
3. Znajomi dołączają do pokoju.
4. Host ustawia liczbę talii, jokery, wariant damy, limit czasu i pozostałe ustawienia stołu.
5. Każdy gracz oznacza gotowość.
6. Host rozpoczyna partię.
7. Gra trwa bez limitu czasu, chyba że host ustawi inaczej.

## 2. Czego aplikacja nie robi

- brak botów;
- brak gry przeciwko komputerowi;
- brak zastępowania rozłączonego gracza botem;
- brak losowego dobierania graczy;
- brak obowiązkowego rankingu;
- brak wymuszonych krótkich partii;
- brak automatycznego zakończenia gry tylko dlatego, że ktoś gra wolno.

Jeśli gracz się rozłączy albo nie wykonuje ruchu, gra nie powinna sama podejmować decyzji za niego. Decyzję podejmuje host albo grupa według ustawień pokoju.

## 3. Pokoje prywatne

### 3.1. Tworzenie pokoju

Host tworzy pokój i ustawia:

- nazwę pokoju;
- maksymalną liczbę graczy;
- liczbę talii;
- grę z jokerami: tak / nie;
- limit czasu albo brak limitu;
- wariant damy;
- możliwość zagrywania wielu kart naraz;
- sposób wyboru pierwszego gracza;
- sposób obsługi pauzy i rozłączeń.

Nie robimy ustawień, które zmieniają podstawową naturę kart funkcyjnych. Zasady takie jak 5 kart na start, działanie 2, 3, 4, asów, jopków oraz króli pik/kier są stałe.

### 3.2. Dołączanie i gotowość graczy

Host tworzy pokój i zaprasza graczy linkiem albo kodem. System nie dobiera nikogo automatycznie z zewnątrz.

Przepływ:

1. Host tworzy pokój.
2. Host wybiera podstawowe ustawienia albo zostawia domyślne.
3. Aplikacja generuje link zaproszenia i kod pokoju.
4. Host wysyła link znajomym.
5. Każdy gracz dołącza do pokoju.
6. Każdy gracz klika „Gotowy”.
7. Host widzi listę graczy i statusy gotowości.
8. Gdy wszyscy są gotowi, host może kliknąć „Start gry”.

Ważne założenie:

- system nie wyszukuje graczy;
- system nie podstawia botów;
- system nie rozpoczyna gry bez decyzji hosta;
- system może jedynie zasugerować liczbę talii na podstawie liczby gotowych graczy.

Przykład:

- host zaprasza 6 osób;
- do pokoju wchodzi 5 osób;
- 4 osoby klikają „Gotowy”;
- host widzi, że jedna osoba nie jest gotowa;
- host może poczekać, usunąć niegotowego gracza albo rozpocząć tylko z gotowymi, jeśli ustawienia pokoju na to pozwalają.

### 3.3. Uprawnienia hosta

Host powinien móc:

- rozpocząć partię;
- zmienić ustawienia przed startem;
- pauzować grę;
- wznowić grę;
- pominąć turę gracza;
- usunąć gracza z pokoju;
- przekazać hosta komuś innemu;
- zakończyć partię ręcznie.

### 3.4. Ograniczenia uprawnień hosta i przejrzystość decyzji

Host ma narzędzia administracyjne, ale nie może mieć przewagi informacyjnej ani dowolnie zmieniać zasad w trakcie partii.

Zasady:

- host nie może podejrzeć kart innych graczy;
- host nie może zmienić zasad działania kart po rozpoczęciu partii;
- host nie może zmienić liczby talii w aktywnej partii;
- host nie może zmienić wariantu damy, Makao, jokerów ani zasad kar w aktywnej partii;
- host może zmieniać tylko ustawienia techniczne, jeśli pokój na to pozwala, np. limit czasu, pauzę albo zachowanie przy rozłączeniu;
- działania hosta, które wpływają na przebieg gry, muszą być widoczne w historii publicznej;
- każde działanie administracyjne hosta musi być zapisane w `admin_log`;
- wymuszenie wznowienia, pominięcie tury, wymuszenie przyjęcia efektu albo usunięcie gracza wymaga podwójnego potwierdzenia.

Przykłady publicznych komunikatów:

```text
Host wznowił grę mimo pauzy gracza.
Host pominął turę gracza offline.
Host wymusił przyjęcie aktywnej kary przez gracza offline.
```

Zmiana zasad kart między partiami w tym samym pokoju jest dozwolona tylko przed startem kolejnej partii i powinna być widoczna dla wszystkich graczy w lobby.

## 4. Liczba talii

### 4.1. Wiele talii

Aplikacja ma obsługiwać grę na 1, 2, 3 lub więcej taliach. Liczba talii może zależeć od liczby graczy albo od decyzji hosta.

System może automatycznie zaproponować liczbę talii po sprawdzeniu liczby graczy oznaczonych jako „Gotowy”. To nie jest automatyczne dobieranie graczy, tylko automatyczna sugestia konfiguracji.

| Liczba gotowych graczy | Rekomendowana liczba talii |
|---:|---:|
| 2-4 | 1 talia |
| 5-6 | 2 talie |
| 7-8 | 2-3 talie |
| 9+ | 3-4 talie |

Host może przyjąć sugestię albo ustawić liczbę talii ręcznie. Może też celowo ustawić więcej talii niż rekomendowane, żeby gra była dłuższa i bardziej chaotyczna.

### 4.2. Po co wiele talii

Wiele talii zwiększa zabawę, bo:

- jest więcej kart atakujących;
- można mocniej kumulować kary;
- częściej pojawiają się duplikaty;
- łatwiej położyć kilka kart jednocześnie;
- partie są mniej przewidywalne;
- gracze mogą dobrać dużo więcej kart po serii dwójek, trójek albo króli.

### 4.3. Identyfikacja kart

System musi odróżniać fizyczne egzemplarze tej samej karty.

Przykład:

- `deck1_2_hearts`;
- `deck2_2_hearts`;
- `deck3_2_hearts`.

Dla gracza to nadal po prostu dwójka kier, ale serwer musi wiedzieć, który egzemplarz gdzie się znajduje.

To jest potrzebne do:

- liczenia kart;
- historii ruchów;
- kontroli poprawności stanu gry;
- tasowania stosu zużytych kart;
- zapobiegania błędom i duplikatom.

## 5. Czas gry

### 5.1. Domyślnie bez limitu

Domyślny tryb: brak limitu czasu na ruch i brak limitu czasu całej rozgrywki.

Uzasadnienie:

- gra jest ze znajomymi;
- gracze mogą rozmawiać w trakcie;
- ktoś może odejść od telefonu;
- aplikacja nie powinna wymuszać tempa jak w grach rankingowych.

### 5.2. Opcjonalny limit

Host może ustawić limit, jeśli grupa tego chce.

Opcje:

- brak limitu;
- 30 sekund na ruch;
- 60 sekund na ruch;
- 2 minuty na ruch;
- 5 minut na ruch;
- własna wartość.

Po przekroczeniu limitu możliwe ustawienia:

- tylko ostrzeżenie;
- pominięcie tury;
- decyzja hosta.

Nie robimy automatycznego ruchu za gracza.

## 6. Stałe zasady bazowe

Te zasady traktujemy jako rdzeń gry i nie robimy od nich wyjątków w podstawowym trybie aplikacji.

| Element | Stała zasada |
|---|---|
| Start gry | Każdy gracz zawsze zaczyna z 5 kartami |
| 2 | Zawsze karta bitewna, +2 karty |
| 3 | Zawsze karta bitewna, +3 karty |
| 4 | Zawsze pauzuje |
| Asy | Mogą żądać koloru albo zostać zagrane z opcją `Bez żądania` |
| Jopki / walety | Mogą żądać wartości 5-10 albo zostać zagrane z opcją `Bez żądania` |
| Król kier | Zawsze +5 kart dla następnego gracza |
| Król pik przy 3+ osobach | Zawsze +5 kart dla poprzedniego gracza |
| Król pik przy 2 osobach | Działa jak król kier, czyli +5 kart dla przeciwnika |
| Król trefl | Niewaleczny, zwykły król |
| Król karo | Niewaleczny, zwykły król |

Nie robimy checkboxów typu:

- „czy 4 pauzuje”;
- „czy 2 jest bitewna”;
- „czy 3 jest bitewna”;
- „czy as może żądać koloru”;
- „czy jopek może żądać wartości”;
- „czy król pik/kier są bitewne”.

As i walet mają stałe działanie specjalne, ale gracz może wybrać opcję `Bez żądania`. To nie oznacza, że as albo walet stają się zwykłymi kartami. Oznacza tylko, że gracz rezygnuje z utworzenia aktywnego efektu żądania.

Jeśli as zostanie zagrany z opcją `Bez żądania`, kolejny gracz gra normalnie względem koloru asa albo może zagrać damę.

Jeśli jopek zostanie zagrany z opcją `Bez żądania`, kolejny gracz gra normalnie względem koloru jopka albo może zagrać damę.

## 7. Rozdanie i start gry

### 7.1. Wirtualny krupier

Rozdanie wykonuje wirtualny krupier po stronie serwera.

Krupier:

1. Tworzy talię albo wiele talii według ustawień pokoju.
2. Dodaje jokery, jeśli gracze zaznaczyli grę z jokerami.
3. Tasuje karty po stronie serwera.
4. Rozdaje każdemu graczowi po 5 kart.
5. Wybiera kartę startową ze stosu dobierania.
6. Sprawdza, czy karta startowa jest niefunkcyjna.
7. Jeśli karta jest funkcyjna, odkłada ją na spód stosu dobierania i sprawdza następną kartę.
8. Powtarza to do momentu znalezienia karty niefunkcyjnej.
9. Kładzie kartę niefunkcyjną jako pierwszą kartę na stole.
10. Ustala pierwszego gracza zgodnie z ustawieniami pokoju.
11. Rozpoczyna grę od wybranego pierwszego gracza, a kolejne tury idą zgodnie z ruchem wskazówek zegara, chyba że aktywny efekt zasad zmienia kolejność.

### 7.2. Karta startowa musi być niefunkcyjna

Gra nie może rozpocząć się kartą funkcyjną.

Jako karty funkcyjne traktujemy:

- 2;
- 3;
- 4;
- dama;
- walet, czyli jopek;
- as;
- król pik;
- król kier;
- joker, jeśli jokery są włączone.

Karta startowa musi być zwykłą kartą, np. 5, 6, 7, 8, 9, 10, król karo albo król trefl.

### 7.3. Ukryte przenoszenie kart funkcyjnych na spód talii

Jeśli po rozdaniu krupier próbuje położyć kartę startową i trafia na kartę funkcyjną, system nie pokazuje tego graczom.

Zachowanie:

- karta funkcyjna trafia na spód stosu dobierania;
- system pobiera następną kartę;
- proces trwa, aż zostanie znaleziona karta niefunkcyjna;
- gracze widzą tylko finalną kartę startową;
- aplikacja nie pokazuje komunikatu typu „pominięto kartę funkcyjną”.

To zdarzenie zapisuje się wyłącznie w logach serwera.

### 7.4. Wybór pierwszego gracza

Przed każdą rozgrywką system musi jednoznacznie ustalić, kto rozpoczyna partię.

Dostępne tryby wyboru pierwszego gracza:

- losowanie przez system przed każdą rozgrywką;
- ręczny wybór pierwszego gracza przez hosta przed pierwszą rozgrywką;
- rotacja zgodnie z ruchem wskazówek zegara w kolejnych rozgrywkach.

Rekomendacja domyślna:

- przy pierwszej rozgrywce w pokoju host może wybrać pierwszego gracza albo użyć losowania;
- przy kolejnych rozgrywkach pierwszy gracz przesuwa się automatycznie do następnej osoby zgodnie z ruchem wskazówek zegara;
- aplikacja pokazuje w lobby informację, kto zaczyna następną partię.

Przykład:

1. W pokoju grają A, B, C i D.
2. Host wybiera, że pierwszą partię zaczyna B.
3. Kolejność tur w partii to B, C, D, A.
4. Drugą partię automatycznie zaczyna C.
5. Trzecią partię automatycznie zaczyna D.
6. Czwartą partię automatycznie zaczyna A.

Jeśli gracz, który miał zaczynać kolejną partię, opuścił pokój, system wybiera następną dostępną osobę zgodnie z ruchem wskazówek zegara.

Stan techniczny pokoju powinien przechowywać co najmniej:

```json
{
  "turnOrder": ["player_a", "player_b", "player_c", "player_d"],
  "firstPlayerMode": "host_selected_then_rotate",
  "firstPlayerId": "player_b",
  "nextGameFirstPlayerId": "player_c"
}
```

### 7.5. Jokery

Jokery są opcjonalne.

Definicja podstawowa:

- joker zastępuje każdą kartę;
- joker jest kartą funkcyjną;
- joker nie może być kartą startową;
- po zagraniu jokera gracz musi wskazać, jaką kartę albo jaki efekt joker zastępuje;
- po deklaracji joker działa tak, jak zadeklarowana karta albo efekt.

Przykłady deklaracji jokera:

- joker jako zwykła karta, np. `10 trefl`;
- joker jako dwójka, czyli karta bitewna +2;
- joker jako trójka, czyli karta bitewna +3;
- joker jako czwórka, czyli pauza;
- joker jako as, czyli żądanie koloru;
- joker jako walet, czyli żądanie wartości;
- joker jako dama, czyli karta zgodna z zasadą "dama na wszystko, wszystko na damę";
- joker jako król kier, czyli +5 dla następnego gracza;
- joker jako król pik, czyli +5 dla poprzedniego gracza przy grze 3+ osób albo +5 dla przeciwnika przy grze 2-osobowej.

Zasada techniczna:

- w logice gry joker nie jest traktowany jako nieokreślona karta;
- po zagraniu musi otrzymać konkretną deklarację;
- deklaracja jokera jest zapisywana w historii ruchów;
- serwer waliduje ruch tak, jakby joker był zadeklarowaną kartą;
- klient pokazuje graczom zarówno jokera, jak i jego zadeklarowany efekt.

Przykład logu:

```json
{
  "event": "joker_played",
  "playerId": "player_b",
  "cardInstanceId": "card_joker_01",
  "declaredAs": {
    "rank": "queen",
    "suit": null,
    "effect": "queen_anything"
  }
}
```

Do późniejszego doprecyzowania pozostaje, czy joker może być użyty jako ostatnia karta kończąca grę. Domyślna rekomendacja: tak, jeśli jego deklaracja tworzy legalny ruch.

## 8. Karty funkcyjne

### 8.1. Dwójki i trójki

Dwójki i trójki są zawsze kartami bitewnymi.

Reguła:

- 2 zawsze nakazuje dobranie 2 kart;
- 3 zawsze nakazuje dobranie 3 kart;
- kary mogą się kumulować;
- przy wielu taliach można uzyskać bardzo wysoką karę;
- gracz może odpowiedzieć legalną kartą bitewną albo przyjąć karę i dobrać aktualną sumę kart.

Nie robimy wariantu, w którym 2 albo 3 są kartami zwykłymi.

Ważna zasada decyzyjności gracza:

- gra nie może zmuszać gracza do zagrania karty tylko dlatego, że ma legalną odpowiedź;
- gracz zawsze może przyjąć karę, nawet jeśli ma kartę, którą mógłby przebić;
- przyjęcie kary kończy aktywną karę i usuwa ją z `activeEffect`;
- karta bitewna, która wywołała karę, zostaje na stole jako zwykła karta odniesienia dla kolejnego gracza.

Przykład:

1. Gracz A kładzie 2.
2. Gracz B ma 3, ale nie chce jej zagrywać.
3. Gracz B wybiera `Dobierz 2`.
4. Serwer rozlicza karę i ustawia `activeEffect = null`.
5. Gracz C gra normalnie względem dwójki leżącej na stole.

#### 8.1.1. Przebijanie kart bitewnych i wojna karna

Podczas aktywnej kary gracz może wykonać jedną z dwóch akcji:

- przyjąć karę i dobrać wymaganą liczbę kart;
- przebić karę legalną kartą bitewną.

Gra nie może zmuszać gracza do przebicia kary, nawet jeśli gracz ma na ręce kartę, którą mógłby legalnie zagrać. Gracz zawsze ma prawo świadomie przyjąć karę.

Karty bitewne to:

- 2;
- 3;
- król kier;
- król pik;
- joker zadeklarowany jako jedna z legalnych kart bitewnych.

Król trefl i król karo nie są kartami bitewnymi. Nie mogą rozpoczynać wojny karnej i nie mogą przebijać aktywnej kary.

##### Wojna karna jako aktywny efekt

Kara nie wynika wyłącznie z tego, jaka karta leży na stole. Kara musi być zapisana jako osobny aktywny efekt gry.

Aktywna wojna karna powinna zawierać:

- sumę kart do dobrania;
- kolor wojny;
- kierunek ataku;
- gracza, który musi odpowiedzieć albo przyjąć karę;
- karty, które zbudowały aktualną karę;
- informację, czy karę można przebić;
- informację, czy gracz może ją przyjąć.

Przykład aktywnej wojny karnej:

```json
{
  "type": "draw_penalty",
  "amount": 7,
  "battleSuit": "hearts",
  "direction": "next",
  "targetPlayerId": "player_b",
  "sourceCards": [
    "deck1_2_hearts",
    "deck1_3_hearts",
    "deck2_king_hearts"
  ],
  "canBeAccepted": true,
  "canBeCountered": true
}
```

##### Kolor wojny karnej

Każda wojna karna ma swój kolor.

Przykłady:

- 2 kier tworzy wojnę karną kier;
- 3 pik tworzy wojnę karną pik;
- król kier tworzy wojnę karną kier;
- król pik tworzy wojnę karną pik.

Kolor wojny jest ważny, ponieważ nie każda karta bitewna może zostać położona na każdą aktywną karę.

##### Zasada dokładania kart bitewnych

Podczas aktywnej wojny karnej gracz może przebić karę tylko kartą bitewną zgodną z aktualną wojną.

Zasady:

- 2 można położyć na aktywną karę z 2 albo 3, jeśli odpowiada kolorowi wojny;
- 3 można położyć na aktywną karę z 2 albo 3, jeśli odpowiada kolorowi wojny;
- 2 można położyć na aktywną karę z króla, jeśli kolor dwójki odpowiada kolorowi wojny;
- 3 można położyć na aktywną karę z króla, jeśli kolor trójki odpowiada kolorowi wojny;
- król kier może zostać położony jako karta bitewna kier;
- król pik może zostać położony jako karta bitewna pik;
- król kier albo król pik może zmienić kierunek ataku zgodnie z własnym działaniem;
- joker może przebić karę tylko wtedy, gdy zostanie zadeklarowany jako legalna karta bitewna w aktualnej wojnie.

##### Przykłady

Przykład 1: wojna kier

1. Gracz A rzuca 2 kier.
2. Powstaje aktywna kara +2.
3. Kolor wojny: kier.
4. Gracz B może:
   - dobrać 2 karty i zakończyć karę;
   - położyć 2 kier;
   - położyć 3 kier;
   - położyć króla kier;
   - położyć jokera zadeklarowanego jako legalna karta bitewna kier.
5. Gracz B nie może położyć 2 pik, 3 karo ani króla pik, jeśli nie pasują do aktualnej wojny kier.

Przykład 2: wojna pik

1. Gracz A rzuca króla pik.
2. Powstaje aktywna kara +5.
3. Kolor wojny: pik.
4. Kierunek ataku: poprzedni gracz, jeśli grają co najmniej 3 osoby.
5. Gracz, w którego idzie atak, może:
   - dobrać 5 kart i zakończyć karę;
   - położyć 2 pik;
   - położyć 3 pik;
   - położyć króla pik;
   - położyć jokera zadeklarowanego jako legalna karta bitewna pik.

Przykład 3: gracz przyjmuje karę mimo posiadania odpowiedzi

1. Gracz A rzuca 2 kier.
2. Gracz B ma na ręce 3 kier.
3. Gracz B nie chce jej zagrywać.
4. Gracz B wybiera "Dobierz 2".
5. Serwer pozwala na tę decyzję.
6. Gracz B dobiera 2 karty.
7. Aktywna kara zostaje zakończona.
8. Na stole nadal leży 2 kier, ale jej kara nie działa już na kolejnego gracza.
9. Gracz C gra normalnie względem karty leżącej na stole.

##### Zakończenie wojny karnej

Wojna karna kończy się, gdy:

- gracz przyjmie karę i dobierze wymaganą liczbę kart;
- efekt zostanie anulowany przez legalną kartę według wariantu zasad;
- host rozstrzygnie sytuację administracyjnie w przypadku błędu albo sporu.

Po zakończeniu wojny karnej:

- aktywny efekt `draw_penalty` zostaje usunięty;
- karta bitewna nadal leży na stole;
- jej efekt nie działa ponownie na kolejnych graczy;
- kolejny gracz gra już normalnie względem aktualnej karty na stole.

##### Komunikat dla gracza

Przy aktywnej wojnie karnej aplikacja powinna jasno pokazywać:

```text
Aktywna kara: +7
Wojna: kier
Możesz dobrać 7 kart albo przebić kartą bitewną kier.
```

Jeśli gracz ma legalną odpowiedź, aplikacja może ją podświetlić, ale nadal musi pokazać możliwość przyjęcia kary.

Przykład:

```text
Masz 3 kier, którą możesz przebić karę.
Możesz też dobrać 7 kart.
```

##### Zasada techniczna

Legalność ruchu podczas wojny karnej nie może być sprawdzana wyłącznie na podstawie ostatniej karty na stole.

Silnik musi sprawdzić:

1. Czy istnieje aktywny efekt `draw_penalty`.
2. Jaka jest suma kary.
3. Jaki jest kolor wojny.
4. Kto jest aktualnym celem kary.
5. Czy karta zagrana przez gracza jest legalną kartą bitewną dla tej wojny.
6. Czy gracz wybrał przyjęcie kary.
7. Czy po wykonaniu akcji należy zakończyć karę, czy zaktualizować jej wartość.

##### Przykład kodu TypeScript

Poniższy kod nie jest pełnym silnikiem gry. Pokazuje przykładową strukturę walidacji aktywnej wojny karnej.

```ts
type Suit = "hearts" | "diamonds" | "clubs" | "spades";

type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "jack"
  | "queen"
  | "king"
  | "ace"
  | "joker";

type Direction = "next" | "previous";

type Card = {
  cardInstanceId: string;
  deckNumber?: number;
  rank: Rank;
  suit?: Suit;
};

type DrawPenaltyEffect = {
  type: "draw_penalty";
  amount: number;
  battleSuit: Suit;
  direction: Direction;
  targetPlayerId: string;
  sourceCards: string[];
  canBeAccepted: boolean;
  canBeCountered: boolean;
};

type ActiveEffect = DrawPenaltyEffect | null;

type GameState = {
  topCard: Card;
  activeEffect: ActiveEffect;
  currentPlayerId: string;
  hands: Record<string, Card[]>;
};

type PlayerAction =
  | {
      type: "accept_penalty";
      playerId: string;
    }
  | {
      type: "counter_penalty";
      playerId: string;
      card: Card;
      jokerDeclaration?: Card;
    };

function isBattleCard(card: Card): boolean {
  if (card.rank === "2") return true;
  if (card.rank === "3") return true;

  if (card.rank === "king" && card.suit === "hearts") return true;
  if (card.rank === "king" && card.suit === "spades") return true;

  return false;
}

function getBattleValue(card: Card): number {
  if (card.rank === "2") return 2;
  if (card.rank === "3") return 3;

  if (card.rank === "king" && card.suit === "hearts") return 5;
  if (card.rank === "king" && card.suit === "spades") return 5;

  throw new Error("Card is not a battle card.");
}

function getBattleDirection(card: Card, playerCount: number): Direction {
  if (card.rank === "king" && card.suit === "spades") {
    return playerCount >= 3 ? "previous" : "next";
  }

  return "next";
}

function getBattleSuit(card: Card): Suit {
  if (!card.suit) {
    throw new Error("Battle card must have a suit.");
  }

  return card.suit;
}

function resolveJokerDeclaration(card: Card, jokerDeclaration?: Card): Card {
  if (card.rank !== "joker") {
    return card;
  }

  if (!jokerDeclaration) {
    throw new Error("Joker requires declaration.");
  }

  if (!isBattleCard(jokerDeclaration)) {
    throw new Error("Joker must be declared as a legal battle card.");
  }

  return {
    ...jokerDeclaration,
    cardInstanceId: card.cardInstanceId
  };
}

function canCounterDrawPenalty(
  activePenalty: DrawPenaltyEffect,
  playedCard: Card,
  playerCount: number
): boolean {
  if (!activePenalty.canBeCountered) {
    return false;
  }

  if (!isBattleCard(playedCard)) {
    return false;
  }

  const playedBattleSuit = getBattleSuit(playedCard);

  if (playedBattleSuit !== activePenalty.battleSuit) {
    return false;
  }

  const direction = getBattleDirection(playedCard, playerCount);

  if (playedCard.rank === "king" && playedCard.suit === "spades") {
    return direction === "previous" || direction === "next";
  }

  if (playedCard.rank === "king" && playedCard.suit === "hearts") {
    return direction === "next";
  }

  return playedCard.rank === "2" || playedCard.rank === "3";
}

function playerHasCard(hand: Card[], cardInstanceId: string): boolean {
  return hand.some(card => card.cardInstanceId === cardInstanceId);
}

function acceptDrawPenalty(
  state: GameState,
  playerId: string
): GameState {
  const effect = state.activeEffect;

  if (!effect || effect.type !== "draw_penalty") {
    throw new Error("There is no active draw penalty.");
  }

  if (effect.targetPlayerId !== playerId) {
    throw new Error("This player is not the target of the penalty.");
  }

  if (!effect.canBeAccepted) {
    throw new Error("This penalty cannot be accepted.");
  }

  /*
    W pełnym silniku należy tutaj dobrać effect.amount kart
    z drawPile i dodać je do ręki gracza.

    Po dobraniu kara zostaje zakończona.
    Karta bitewna nadal zostaje na stole, ale activeEffect znika.
  */

  return {
    ...state,
    activeEffect: null
  };
}

function counterDrawPenalty(
  state: GameState,
  action: Extract<PlayerAction, { type: "counter_penalty" }>,
  playerCount: number,
  nextTargetPlayerId: string
): GameState {
  const effect = state.activeEffect;

  if (!effect || effect.type !== "draw_penalty") {
    throw new Error("There is no active draw penalty.");
  }

  if (effect.targetPlayerId !== action.playerId) {
    throw new Error("This player is not the target of the penalty.");
  }

  const playerHand = state.hands[action.playerId] ?? [];

  if (!playerHasCard(playerHand, action.card.cardInstanceId)) {
    throw new Error("Player does not have this card.");
  }

  const playedAsCard = resolveJokerDeclaration(
    action.card,
    action.jokerDeclaration
  );

  if (!canCounterDrawPenalty(effect, playedAsCard, playerCount)) {
    throw new Error("This card cannot counter the active draw penalty.");
  }

  const addedPenalty = getBattleValue(playedAsCard);
  const newDirection = getBattleDirection(playedAsCard, playerCount);

  const updatedEffect: DrawPenaltyEffect = {
    ...effect,
    amount: effect.amount + addedPenalty,
    direction: newDirection,
    targetPlayerId: nextTargetPlayerId,
    sourceCards: [...effect.sourceCards, action.card.cardInstanceId]
  };

  /*
    W pełnym silniku należy tutaj:
    - usunąć kartę z ręki gracza;
    - położyć ją na stos zagranych;
    - ustawić ją jako topCard;
    - wyliczyć kolejny targetPlayerId zgodnie z direction.
  */

  return {
    ...state,
    topCard: action.card,
    activeEffect: updatedEffect
  };
}

function handlePenaltyAction(
  state: GameState,
  action: PlayerAction,
  playerCount: number,
  nextTargetPlayerId: string
): GameState {
  if (action.type === "accept_penalty") {
    return acceptDrawPenalty(state, action.playerId);
  }

  if (action.type === "counter_penalty") {
    return counterDrawPenalty(
      state,
      action,
      playerCount,
      nextTargetPlayerId
    );
  }

  throw new Error("Unsupported action.");
}
```

##### Krótki pseudokod

```text
if activeEffect.type == "draw_penalty":
    if player chooses accept_penalty:
        draw activeEffect.amount cards
        activeEffect = null
        end turn

    if player chooses counter_penalty:
        if card is not battle card:
            reject move

        if card battle suit != activeEffect.battleSuit:
            reject move

        add card penalty value to activeEffect.amount
        update activeEffect.direction
        update activeEffect.targetPlayerId
        add card to activeEffect.sourceCards
        place card on table
        end turn
```

Najważniejsza zasada dla silnika:

```text
Karta bitewna na stole nie oznacza automatycznie aktywnej kary.

Aktywna kara istnieje tylko wtedy, gdy activeEffect.type == "draw_penalty".

Po dobraniu kart przez gracza activeEffect zostaje usunięty, nawet jeśli karta bitewna nadal leży na stole.
```

### 8.2. Czwórka

Czwórka zawsze pauzuje.

Reguła:

- 4 zawsze powoduje pauzę następnego gracza;
- jeśli zostanie zagranych kilka czwórek, pauzy się kumulują;
- czwórki nigdy nie pauzują dwóch kolejnych graczy;
- pauza odkłada się na jednym graczu, czyli na graczu, który ma przyjąć efekt czwórki;
- gracz może odpowiedzieć czwórką albo przyjąć pauzę;
- gra nie może zmuszać gracza do zagrania czwórki, nawet jeśli ją posiada;
- nie robimy wariantu, w którym 4 jest zwykłą kartą;
- nie robimy wyjątku od działania czwórki.

Zasada kumulacji:

- jedna 4 oznacza jedną pauzę dla wskazanego gracza;
- dwie 4 oznaczają dwie pauzy dla tego samego wskazanego gracza;
- trzy 4 oznaczają trzy pauzy dla tego samego wskazanego gracza;
- pauza nie przechodzi automatycznie na dwóch kolejnych graczy.

Przykład:

1. Gracz A rzuca 4.
2. Efekt pauzy trafia w gracza B.
3. Gracz B może odpowiedzieć własną 4 albo przyjąć pauzę.
4. Jeśli gracz B przyjmie pauzę, traci turę i efekt czwórki zostaje rozliczony.
5. Jeśli gracz B rzuci 4, pauza kumuluje się dalej na następnym wskazanym graczu według aktywnej kolejności.

Model techniczny:

```json
{
  "activeEffect": {
    "type": "skip_turn",
    "skipCount": 2,
    "targetPlayerId": "player_b",
    "sourceCardIds": ["card_401", "card_402"]
  }
}
```

`skipCount` oznacza liczbę własnych tur, które wskazany gracz ma stracić.

Zasada rozliczania:

- jeśli `skipCount = 1`, gracz traci jedną swoją turę;
- jeśli `skipCount = 2`, gracz traci dwie swoje najbliższe tury;
- po każdej utraconej turze `skipCount` zmniejsza się o 1;
- gdy `skipCount` spadnie do 0, `activeEffect` zostaje usunięty;
- gracz może odpowiedzieć czwórką zamiast przyjąć pauzę, jeśli ma legalną czwórkę i chce jej użyć;
- gra nie może zmusić gracza do zagrania czwórki, nawet jeśli ją posiada.

#### 8.2.1. Czwórka jako ostatnia karta

Jeśli gracz zagra czwórkę jako ostatnią kartę, natychmiast wygrywa lub zajmuje kolejne miejsce w klasyfikacji, o ile spełnił wymagania Makao.

Efekt czwórki nadal może zostać utworzony, ale nie może wrócić do gracza, który nie ma już kart. Pauza trafia do pierwszego gracza, który nadal ma karty, zgodnie z aktualną kolejnością gry.

Przykład:

1. Kolejność graczy: A, B, C, D.
2. Gracz A zagrywa ostatnią kartę: 4 kier.
3. Gracz A kończy grę jako zwycięzca.
4. Efekt pauzy idzie do pierwszego gracza z kartami zgodnie z kolejką, czyli do B.
5. Jeśli B też nie ma już kart, efekt przechodzi do C.

Zasada nadrzędna:

```text
Rzucenie ostatniej karty kończy udział gracza w partii.
Aktywne efekty po tym ruchu są kierowane tylko do graczy, którzy nadal mają karty.
```

### 8.3. Asy

Asy zawsze mają możliwość żądania koloru, ale gracz nie musi z tej możliwości korzystać.

Po zagraniu asa gracz wybiera jedną z opcji:

- `Żądam kier`;
- `Żądam karo`;
- `Żądam pik`;
- `Żądam trefl`;
- `Bez żądania`.

Nie robimy wariantu, w którym as jest zwykłą kartą bez możliwości żądania. Opcja `Bez żądania` oznacza tylko, że gracz świadomie nie tworzy aktywnego efektu `suit_request`.

#### 8.3.1. As z żądaniem koloru

Jeśli gracz zagra asa i wybierze kolor, powstaje aktywny efekt `suit_request`.

Przykład:

```json
{
  "type": "suit_request",
  "requestedSuit": "spades",
  "sourceCardId": "deck1_ace_hearts",
  "createdByPlayerId": "player_a",
  "targetPlayerId": "player_b",
  "canBeAccepted": true,
  "canBeCountered": true
}
```

Dopóki aktywny efekt `suit_request` istnieje, gracz wskazany jako `targetPlayerId` musi rozwiązać żądanie.

Gracz może rozwiązać żądanie koloru przez:

1. zagranie karty w żądanym kolorze;
2. zagranie damy, która przerywa żądanie;
3. zagranie innego asa i wybranie nowego koloru albo opcji `Bez żądania`;
4. zagranie jokera zadeklarowanego jako legalna karta rozwiązująca żądanie;
5. dobranie karty, jeśli nie chce albo nie może odpowiedzieć.

Gra nie może zmuszać gracza do zagrania karty, nawet jeśli gracz ma legalną odpowiedź na ręce.

#### 8.3.2. As bez żądania

Jeśli gracz zagra asa i wybierze `Bez żądania`:

- as zostaje położony na stół;
- nie powstaje aktywny efekt `suit_request`;
- kolejny gracz gra normalnie względem asa jako aktualnej karty na stole;
- kolejny gracz powinien położyć kartę w kolorze asa, innego asa, damę, jokera albo inną legalną kartę zgodnie z zasadami stołu.

Przykład:

1. Gracz A rzuca asa kier.
2. Gracz A wybiera `Bez żądania`.
3. `activeEffect` pozostaje puste.
4. Gracz B nie musi spełniać żadnego żądania.
5. Gracz B gra normalnie do asa kier, czyli przede wszystkim kartę kier, innego asa, damę albo jokera.

#### 8.3.3. Przebicie żądania innym asem

Jeśli trwa aktywne żądanie koloru po asie, gracz może zagrać innego asa.

Zagranie asa na aktywne żądanie koloru:

- jest legalną odpowiedzią na żądanie;
- może zastąpić stare żądanie nowym żądaniem koloru;
- może zakończyć stare żądanie bez tworzenia nowego, jeśli gracz wybierze `Bez żądania`;
- przenosi obowiązek odpowiedzi na kolejnego gracza tylko wtedy, gdy gracz wybrał nowe żądanie.

Przykład z nowym żądaniem:

1. Gracz A rzuca asa kier.
2. Gracz A żąda koloru pik.
3. Aktywny efekt: `suit_request = pik`.
4. Gracz B rzuca asa karo.
5. Gracz B żąda koloru trefl.
6. Stare żądanie koloru pik zostaje usunięte.
7. Nowe żądanie koloru trefl trafia do kolejnego gracza.
8. Gracz C musi odpowiedzieć na żądanie trefl.

Przykład bez nowego żądania:

1. Gracz A rzuca asa kier.
2. Gracz A żąda koloru pik.
3. Gracz B rzuca asa pik.
4. Gracz B wybiera `Bez żądania`.
5. Aktywne żądanie koloru pik zostaje zakończone.
6. Na stole leży as pik.
7. Gracz C gra normalnie do asa pik.

#### 8.3.4. As jako odpowiedź albo nowe żądanie

Jeśli gracz zagrywa asa przy aktywnym żądaniu koloru, aplikacja powinna zapytać, jak ma potraktować asa.

Komunikat:

```text
Co chcesz zrobić asem?
[Bez żądania] [Żądaj kier] [Żądaj karo] [Żądaj pik] [Żądaj trefl]
```

Jeśli gracz wybierze `Bez żądania`:

- obecne żądanie zostaje zakończone;
- as zostaje położony na stół;
- nowy efekt żądania nie powstaje.

Jeśli gracz wybierze kolor:

- obecne żądanie zostaje zastąpione nowym;
- gracz wybiera kolor;
- kolejny gracz musi odpowiedzieć na nowe żądanie.

#### 8.3.5. Dobranie karty zamiast odpowiedzi

Gracz może dobrać kartę zamiast odpowiadać na żądanie koloru, nawet jeśli ma kartę w żądanym kolorze, damę albo asa.

Po dobraniu:

- żądanie koloru zostaje zakończone;
- aktywny efekt `suit_request` zostaje usunięty;
- karta asa nadal leży na stole;
- kolejny gracz gra normalnie względem aktualnej karty na stole.

#### 8.3.6. Zasada techniczna

As na stole nie oznacza automatycznie aktywnego żądania koloru.

Aktywne żądanie istnieje tylko wtedy, gdy `activeEffect.type == "suit_request"`.

Po spełnieniu, przebiciu, przerwaniu damą albo dobraniu karty żądanie musi zostać zakończone albo zastąpione nowym żądaniem.

Jeśli gracz zagra asa i wybierze `Bez żądania`, `activeEffect` pozostaje puste.

### 8.4. Jopki / walety

Jopki zawsze mają funkcję żądania wartości, ale gracz może świadomie zrezygnować z utworzenia aktywnego żądania.

Po zagraniu jopka gracz wybiera jedną z opcji:

- `Żądam 5`;
- `Żądam 6`;
- `Żądam 7`;
- `Żądam 8`;
- `Żądam 9`;
- `Żądam 10`;
- `Bez żądania`.

Nie robimy wariantu, w którym jopek jest zwykłą kartą bez możliwości żądania. Opcja `Bez żądania` oznacza tylko, że gracz świadomie nie tworzy aktywnego efektu `rank_request`.

Jopek nie może żądać kart funkcyjnych ani bitewnych.

Niedozwolone żądania po jopku:

- 2;
- 3;
- 4;
- dama;
- as;
- jopek;
- król;
- joker.

Dozwolone żądania po jopku to wyłącznie: 5, 6, 7, 8, 9 i 10.

#### 8.4.1. Jopek z żądaniem wartości

Jeśli gracz zagra jopka i wybierze wartość, powstaje aktywny efekt `rank_request`.

Przykład:

```json
{
  "type": "rank_request",
  "requestedRank": "10",
  "sourceCardId": "deck1_jack_hearts",
  "createdByPlayerId": "player_a",
  "targetPlayerId": "player_b",
  "canBeAccepted": true,
  "canBeCountered": true
}
```

Dopóki aktywny efekt `rank_request` istnieje, gracz wskazany jako `targetPlayerId` musi rozwiązać żądanie.

Gracz może rozwiązać żądanie wartości przez:

1. zagranie karty o żądanej wartości;
2. zagranie damy, która przerywa żądanie;
3. zagranie innego jopka i wybranie nowej wartości albo opcji `Bez żądania`;
4. zagranie jokera zadeklarowanego jako legalna karta rozwiązująca żądanie;
5. dobranie karty, jeśli nie chce albo nie może odpowiedzieć.

Gra nie może zmuszać gracza do zagrania karty, nawet jeśli gracz ma legalną odpowiedź na ręce.

#### 8.4.2. Jopek bez żądania

Jeśli gracz zagra jopka i wybierze `Bez żądania`:

- jopek zostaje położony na stół;
- nie powstaje aktywny efekt `rank_request`;
- kolejny gracz gra normalnie względem jopka jako aktualnej karty na stole;
- kolejny gracz powinien położyć kartę w kolorze jopka, innego jopka, damę, jokera albo inną legalną kartę zgodnie z zasadami stołu.

Przykład:

1. Gracz A rzuca jopka kier.
2. Gracz A wybiera `Bez żądania`.
3. `activeEffect` pozostaje puste.
4. Gracz B nie musi spełniać żadnego żądania wartości.
5. Gracz B gra normalnie do jopka kier, czyli przede wszystkim kartę kier, innego jopka, damę albo jokera.

#### 8.4.3. Przebicie żądania innym jopkiem

Jeśli trwa aktywne żądanie wartości po jopku, gracz może zagrać innego jopka.

Zagranie jopka na aktywne żądanie wartości:

- jest legalną odpowiedzią na żądanie;
- może zastąpić stare żądanie nowym żądaniem wartości;
- może zakończyć stare żądanie bez tworzenia nowego, jeśli gracz wybierze `Bez żądania`;
- przenosi obowiązek odpowiedzi na kolejnego gracza tylko wtedy, gdy gracz wybrał nowe żądanie.

Przykład z nowym żądaniem:

1. Gracz A rzuca jopka kier.
2. Gracz A żąda dziesiątek.
3. Aktywny efekt: `rank_request = 10`.
4. Gracz B rzuca jopka karo.
5. Gracz B żąda siódemek.
6. Stare żądanie dziesiątek zostaje usunięte.
7. Nowe żądanie siódemek trafia do kolejnego gracza.
8. Gracz C musi odpowiedzieć na żądanie siódemek.

Przykład bez nowego żądania:

1. Gracz A rzuca jopka kier.
2. Gracz A żąda dziesiątek.
3. Gracz B rzuca jopka pik.
4. Gracz B wybiera `Bez żądania`.
5. Aktywne żądanie dziesiątek zostaje zakończone.
6. Na stole leży jopek pik.
7. Gracz C gra normalnie do jopka pik.

#### 8.4.4. Jopek jako odpowiedź albo nowe żądanie

Jeśli gracz zagrywa jopka przy aktywnym żądaniu wartości, aplikacja powinna zapytać, jak ma potraktować jopka.

Komunikat:

```text
Co chcesz zrobić jopkiem?
[Bez żądania] [Żądaj 5] [Żądaj 6] [Żądaj 7] [Żądaj 8] [Żądaj 9] [Żądaj 10]
```

Jeśli gracz wybierze `Bez żądania`:

- obecne żądanie zostaje zakończone;
- jopek zostaje położony na stół;
- nowy efekt żądania nie powstaje.

Jeśli gracz wybierze wartość:

- obecne żądanie zostaje zastąpione nowym;
- gracz wybiera wartość;
- kolejny gracz musi odpowiedzieć na nowe żądanie.

#### 8.4.5. Dobranie karty zamiast odpowiedzi

Gracz może dobrać kartę zamiast odpowiadać na żądanie wartości, nawet jeśli ma kartę o żądanej wartości, damę albo jopka.

Po dobraniu:

- żądanie wartości zostaje zakończone;
- aktywny efekt `rank_request` zostaje usunięty;
- karta jopka nadal leży na stole;
- kolejny gracz gra normalnie względem aktualnej karty na stole.

#### 8.4.6. Zasada techniczna

Jopek na stole nie oznacza automatycznie aktywnego żądania wartości.

Aktywne żądanie istnieje tylko wtedy, gdy `activeEffect.type == "rank_request"`.

Po spełnieniu, przebiciu, przerwaniu damą albo dobraniu karty żądanie musi zostać zakończone albo zastąpione nowym żądaniem.

Jeśli gracz zagra jopka i wybierze `Bez żądania`, `activeEffect` pozostaje puste.

#### 8.4.7. Jopek jako ostatnia karta

Jeśli gracz zagrywa jopka jako ostatnią kartę, wygrywa albo zajmuje kolejne miejsce w klasyfikacji natychmiast po legalnym zagraniu.

Zasady:

- jeśli gracz wybierze żądanie wartości 5-10, `rank_request` trafia do pierwszego gracza, który nadal ma karty, zgodnie z kolejką;
- jeśli gracz wybierze `Bez żądania`, żaden aktywny efekt nie powstaje;
- gracz, który zagrał ostatniego jopka, nie musi już sam odpowiadać na żadne żądanie, ponieważ skończył grę;
- kolejny gracz z kartami gra normalnie względem koloru jopka albo rozwiązuje `rank_request`, jeśli jopek został zagrany z żądaniem.

#### 8.4.8. Wspólny model asa i jopka

As i jopek działają według tego samego modelu technicznego: karta może utworzyć aktywne żądanie albo zostać zagrana bez tworzenia żądania.

| Karta | Efekt aktywny | Opcja bez efektu |
|---|---|---|
| As | `suit_request` | `Bez żądania` |
| Jopek | `rank_request` | `Bez żądania` |

Zasada techniczna:

```text
As albo jopek na stole nie oznacza automatycznie aktywnego żądania.
Aktywne żądanie istnieje tylko wtedy, gdy istnieje odpowiedni activeEffect.
```

### 8.5. Króle

Króle pik i kier są zawsze kartami bitewnymi. Króle trefl i karo są niewaleczne.

Nie robimy wariantu, w którym król pik albo król kier są kartami zwykłymi.

#### 8.5.1. Król kier

Król kier atakuje następnego gracza.

Reguła:

- król kier oznacza +5 kart dla następnego gracza;
- przy grze na wiele talii kary mogą się kumulować.

#### 8.5.2. Król pik

Król pik działa zależnie od liczby graczy.

Przy grze w co najmniej 3 osoby:

- król pik oznacza +5 kart dla poprzedniego gracza;
- atak idzie „do tyłu” względem aktualnej kolejności gry.

Przy grze w 2 osoby:

- król pik zachowuje się jak król kier;
- oznacza +5 kart dla drugiego gracza;
- przeciwnik jest jednocześnie następnym i poprzednim graczem, więc efekt idzie w niego.

#### 8.5.3. Króle trefl i karo

Król trefl i król karo są niewaleczne.

Reguła:

- król trefl nie nakazuje dobierania kart;
- król karo nie nakazuje dobierania kart;
- są traktowane jak zwykłe karty, o ile żadna inna zasada nie wpływa na ich zagranie.

#### 8.5.4. Kierunek ataku po przebiciu króla

Wojna karna podąża w kierunku wyznaczonym przez ostatnio rzuconą kartę atakującą.

Reguła:

- król pik atakuje poprzedniego gracza;
- król kier atakuje następnego gracza;
- jeśli gracz broni się królem, kierunek ataku może się zmienić zgodnie z ostatnim zagranym królem;
- ostatnia karta atakująca decyduje, kto ma odpowiedzieć albo dobrać karę.

Przykład przy 4 graczach:

1. Kolejność: A, B, C, D.
2. Gracz C kładzie króla pik.
3. Atak idzie do tyłu, czyli w gracza B.
4. Gracz B broni się królem kier.
5. Król kier kieruje atak do przodu, czyli z powrotem w gracza C.
6. Teraz to C musi odpowiedzieć albo dobrać skumulowaną karę.

### 8.6. Dobranie karty i natychmiastowe zagranie

Wierne odwzorowanie gry przy stole wymaga, aby dobraną kartę można było od razu zagrać, jeśli jest legalna w aktualnej sytuacji.

Zasada:

- jeśli gracz nie ma albo nie chce zagrać karty z ręki, może dobrać kartę;
- jeśli dobrana karta pasuje do aktualnej karty na stole albo rozwiązuje aktywny efekt, gracz może ją natychmiast zagrać;
- jeśli dobrana karta nie pasuje albo gracz nie chce jej zagrać, karta zostaje w ręce, a tura przechodzi dalej;
- serwer musi oznaczyć, że karta została dobrana w tej samej turze, ale legalność jej zagrania jest sprawdzana normalnie;
- jeśli dobrana karta jest ostatnią kartą gracza po wcześniejszym zejściu do jednej karty, nadal obowiązują zasady Makao.

Przykład:

1. Na stole leży 7 kier.
2. Gracz B nie chce albo nie może zagrać karty z ręki.
3. Gracz B dobiera jedną kartę.
4. Dobiera 10 kier.
5. 10 kier pasuje kolorem, więc gracz B może ją od razu zagrać.
6. Jeśli jej nie zagra, zostaje mu w ręce i tura przechodzi dalej.

Przy aktywnej karze dobranie oznacza przyjęcie kary i rozliczenie aktywnego efektu. Kart dobranych w ramach kary nie zagrywa się od razu jako odpowiedzi na tę samą karę.

## 9. Dama na wszystko, wszystko na damę

To jedna z głównych zasad aplikacji, ale jej działanie musi być jasno zdefiniowane, żeby uniknąć sporów przy stole.

### 9.1. Zasada domyślna

Reguła bazowa:

- damę można położyć na dowolną kartę;
- dowolną kartę można położyć na damę;
- dama działa jako neutralna karta przejściowa;
- dama nigdy nie zmienia koloru;
- dama nie tworzy aktywnego żądania koloru;
- dama nie tworzy aktywnego żądania wartości.

Dama nie jest kartą zmieniającą kolor. Nie dodajemy wariantu, w którym dama po zagraniu pozwala wybrać nowy kolor.

Wariant warszawski dotyczy wyłącznie możliwości anulowania aktywnej kary przez określone damy. Nie zmienia to zasady, że dama sama nie wybiera ani nie zmienia koloru.

### 9.2. Dama a aktywna kara

Zasada domyślna aplikacji:

**Dama na wszystko nie obowiązuje podczas trwania aktywnej kary.**

Oznacza to:

- dama nie przebija kary z 2;
- dama nie przebija kary z 3;
- dama nie przebija kary z króla kier;
- dama nie przebija kary z króla pik;
- dama nie anuluje sumy kart do dobrania;
- dama nie może zostać użyta jako ucieczka od wojny karnej.

Przykład:

1. Gracz A kładzie 2.
2. Gracz B dokłada 3.
3. Kara wynosi +5.
4. Gracz C ma damę.
5. Gracz C nie może położyć damy, żeby uniknąć dobrania kart.
6. Musi przebić legalną kartą bitewną albo dobrać karę według zasad pokoju.

Ta reguła eliminuje częsty spór, czy dama może zatrzymać np. sumę +15 kart z dwójek, trójek i króli. W domyślnym wariancie: nie może.

### 9.3. Dama a żądanie waleta lub asa

Dama może zostać zagrana na aktywne żądanie asa albo waleta, jeśli nie trwa aktywna kara.

W tym wariancie dama nie tylko spełnia żądanie, ale kończy je dla kolejnego gracza.

Reguła:

- jeśli as żąda koloru, gracz może położyć damę niezależnie od koloru damy;
- jeśli walet żąda wartości, gracz może położyć damę niezależnie od żądanej wartości;
- po zagraniu damy aktywne żądanie zostaje zakończone;
- kolejny gracz nie musi już spełniać poprzedniego żądania;
- kolejny gracz gra normalnie na damę, zgodnie z zasadą "dama na wszystko, wszystko na damę";
- dama nie może przerwać aktywnej kary z 2, 3, króla kier albo króla pik, chyba że wybrany wariant damy jawnie na to pozwala.

Przykład z asem:

1. Gracz A zagrywa asa i żąda koloru pik.
2. Gracz B zagrywa damę.
3. Żądanie koloru pik zostaje zakończone.
4. Gracz C może zagrać dowolną kartę legalną na damę.

Przykład z waletem:

1. Gracz A zagrywa waleta i żąda dziesiątek.
2. Gracz B zagrywa damę.
3. Żądanie dziesiątek zostaje zakończone.
4. Gracz C nie musi zagrywać dziesiątki, ponieważ działa zasada "wszystko na damę".

Uproszczony zapis dla UI:

> Dama przerywa żądania, ale nie chroni przed karami.

### 9.4. Warianty damy w ustawieniach pokoju

Host nie powinien wybierać działania damy z suchych checkboxów. UI musi pokazywać jasny opis konsekwencji.

#### Opcja A: Dama niefunkcyjna w obronie

Wariant domyślny aplikacji.

Opis w UI:

> Dama na wszystko, wszystko na damę. Dama ratuje przed żądaniami waletów, ale NIE chroni przed karami z 2, 3 i króli.

Konsekwencja:

- gra jest bardziej strategiczna;
- trudniej uciec od dużej kary;
- karty bitewne mają większą wartość;
- mniej sporów o anulowanie kar.

#### Opcja B: Zasady Warszawskie - Dama uniewinniająca

Wariant opcjonalny.

Opis w UI:

> Dama na wszystko, wszystko na damę. Dama pik i dama kier zatrzymują i anulują każdą aktywną karę brania kart.

Konsekwencja:

- gra jest bardziej wyrozumiała;
- ataki dwójkami, trójkami i królami mogą zostać zneutralizowane;
- gracze mają większą szansę uciec przed dużą karą;
- damy pik i kier stają się bardzo mocnymi kartami defensywnymi.

### 9.5. Widoczność działania damy w UI

Przy ustawieniach pokoju każda opcja dotycząca damy musi mieć opis albo ikonę informacji.

UI powinien pokazywać:

- czy dama działa podczas kary;
- czy dama anuluje karę;
- czy tylko konkretne damy, np. pik i kier, mają efekt obronny;
- czy dama może spełniać żądania;
- krótki przykład konsekwencji.

## 10. Zagrywanie wielu kart jednocześnie

### 10.1. Główna reguła

Gracz może położyć więcej niż jedną kartę w jednym ruchu, jeśli mają tę samą wartość.

Przykłady:

- dwie damy;
- trzy dwójki;
- dwie siódemki;
- dwa asy;
- dwa walety.

Pierwsza karta musi być legalna względem aktualnej karty na stole albo aktywnego efektu. Kolejne karty muszą mieć tę samą wartość.

### 10.2. Efekty wielu kart

Gracz może położyć kilka kart w jednym ruchu tylko wtedy, gdy wszystkie zagrywane karty mają tę samą wartość.

Nigdy nie mieszamy różnych wartości w jednym ruchu.

Nie dodajemy wariantu pozwalającego mieszać np.:

- 2 + 3;
- 2 + król;
- 3 + król;
- 2 + 3 + król;
- as + dama;
- walet + walet + inna karta;
- dowolne inne połączenie różnych wartości.

Kolor może decydować o tym, czy pierwsza karta jest legalna wobec aktualnego stołu albo aktywnego efektu, ale nie pozwala mieszać wartości. Jeśli gracz ma dwójkę i trójkę w tym samym kolorze, nadal nie może położyć ich razem. Musi wybrać jedną wartość.

| Karty położone razem | Efekt |
|---|---|
| dwie 2 tego samego legalnego koloru wojny | +4 do kary |
| trzy 2 tego samego legalnego koloru wojny | +6 do kary |
| dwie 3 tego samego legalnego koloru wojny | +6 do kary |
| dwie 4 | dwie pauzy kumulowane na graczu, który musi rozwiązać efekt |
| dwie damy | neutralny ruch; w wariancie warszawskim mogą anulować karę tylko wtedy, gdy spełniają warunek wariantu |
| dwa asy | gracz wybiera jeden końcowy efekt po całym ruchu: żądanie koloru albo `Bez żądania` |
| dwa walety | gracz wybiera jedno końcowe żądanie z listy 5-10 albo wybiera `Bez żądania` |
| dwa króle kier | +10 do kary kier |
| dwa króle pik | +10 do kary pik |

#### 10.2.1. Jedna wartość w jednym ruchu

Podstawowa zasada silnika:

```text
Jeden ruch może zawierać jedną wartość kart.
```

Przykłady legalne:

- 2 kier + 2 kier z drugiej talii;
- 3 pik + 3 pik z drugiej talii;
- dama kier + dama trefl;
- as kier + as pik;
- walet kier + walet karo;
- król kier + król kier z drugiej talii.

Przykłady nielegalne:

- 2 kier + 3 kier;
- 2 pik + król pik;
- 3 kier + król kier;
- as kier + dama pik;
- walet kier + 10 kier;
- 2 kier + 2 pik, jeśli aktywna wojna wymaga koloru kier.

#### 10.2.2. Kolejność kart przy wielu asach i waletach

Jeśli gracz zagrywa kilka asów albo kilka waletów naraz, wybiera kolejność ich położenia.

Ostatnia karta z ruchu staje się kartą wierzchnią stołu.

Dla wielu asów:

- po całym ruchu gracz wybiera jeden końcowy efekt: żądanie koloru albo `Bez żądania`;
- jeśli wybierze kolor, powstaje jeden aktywny efekt `suit_request`;
- jeśli wybierze `Bez żądania`, nie powstaje aktywny efekt, a kolejny gracz gra względem koloru ostatniego asa na stole.

Dla wielu waletów:

- po całym ruchu gracz wybiera jedno końcowe żądanie z listy 5-10 albo `Bez żądania`;
- jeśli wybierze wartość, powstaje jeden aktywny efekt `rank_request`;
- jeśli wybierze `Bez żądania`, nie powstaje aktywny efekt, a kolejny gracz gra względem koloru ostatniego waleta na stole.

#### 10.2.3. Zbiorcze rozliczenie efektu wielu kart

Jeśli gracz zagrywa wiele kart tej samej wartości, silnik traktuje je jako jeden ruch.

Zasady:

- efekt liczony jest zbiorczo;
- ostatnia karta wybrana przez gracza staje się kartą wierzchnią stołu;
- kolejność wybrania kart ma znaczenie dla `topCard`, zwłaszcza przy asach, jopkach i kartach różnych kolorów;
- jeśli ruch kończy grę gracza, ten gracz natychmiast zajmuje kolejne miejsce w klasyfikacji, a efekt kierowany jest do pierwszego gracza, który nadal ma karty.

| Ruch | Efekt |
|---|---|
| 2 kier + 2 kier | kara +4, wojna kier |
| 3 pik + 3 pik | kara +6, wojna pik |
| 4 karo + 4 trefl | dwie pauzy, target według kolejności po ruchu |
| as kier + as pik | jeden końcowy wybór: żądanie koloru albo `Bez żądania`; `topCard = as pik` |
| jopek trefl + jopek karo | jedno końcowe żądanie albo `Bez żądania`; `topCard = jopek karo` |

#### 10.2.4. Zasada techniczna

Silnik musi odrzucić każdy ruch wielokartowy, w którym występuje więcej niż jedna wartość kart.

Pseudokod:

```text
if selectedCards.count > 1:
    if not all selectedCards have same rank:
        reject move

    if activeEffect exists:
        validate first card against activeEffect
        validate all selected cards as same-rank extension
    else:
        validate first card against topCard
        validate all selected cards as same-rank extension
```

### 10.3. Wielokrotne karty a żądania

Jeśli gracz odpowiada na żądanie waleta, może zagrać serię kart tej samej wartości, jeśli ustawienia pokoju pozwalają na zagrywanie wielu kart.

Przykład:

1. Gracz A kładzie waleta i żąda dziesiątek.
2. Gracz B ma trzy dziesiątki.
3. Gracz B może położyć trzy dziesiątki naraz.
4. Pierwsza dziesiątka spełnia i zamyka żądanie.
5. Pozostałe dziesiątki są zagrane na zasadzie tej samej wartości.

Ta reguła powinna działać tylko wtedy, gdy:

- wartość kart odpowiada żądaniu;
- pierwsza karta serii jest legalna;
- wszystkie kolejne karty mają tę samą wartość;
- pokój ma włączone zagrywanie wielu kart jednocześnie.

### 10.4. UX wyboru kilku kart

Na telefonie:

1. Gracz klika pierwszą kartę.
2. Aplikacja podświetla inne karty, które można dołożyć.
3. Gracz klika kolejne karty tej samej wartości.
4. Aplikacja pokazuje „Wybrane: 3 karty”.
5. Jeśli ruch ma efekt, aplikacja pokazuje go przed zatwierdzeniem, np. „Kara: +6”.
6. Gracz klika „Zagraj”.

Dodatkowe akcje:

- kliknięcie wybranej karty odznacza ją;
- przycisk „Wyczyść” usuwa wybór;
- długie przytrzymanie pokazuje większy podgląd karty.

## 11. Sortowanie kart

Sortowanie jest obowiązkowe, bo przy wielu taliach gracze mogą mieć dużo kart.

Tryby sortowania:

- według wartości;
- według koloru;
- według typu: atakujące, pauzujące, specjalne, zwykłe;
- według możliwości zagrania teraz;
- grupowanie duplikatów;
- ręczne układanie kart.

UI:

- krótki klik w „Sortuj” zmienia tryb sortowania;
- długie przytrzymanie otwiera listę trybów;
- aktualny tryb jest pokazany małą etykietą.

Przy dużej liczbie kart:

- ręka przewijana poziomo;
- karty lekko nachodzą na siebie;
- możliwy tryb kompaktowy;
- filtr „pokaż tylko możliwe do zagrania”.

### 11.1. Grupowanie duplikatów kart

Przy grze na wielu taliach identyczne karty w ręce gracza powinny być grupowane w jeden widoczny stos.

Przykład:

- jeśli gracz ma trzy dwójki kier z różnych talii, widzi jedną dwójkę kier z oznaczeniem `x3`;
- jeśli gracz ma dwie damy pik, widzi jedną damę pik z oznaczeniem `x2`;
- dla gracza są to identyczne karty, ale serwer nadal rozróżnia konkretne egzemplarze przez `cardInstanceId`.

Zachowanie UI:

1. Na grupie kart widoczna jest liczba egzemplarzy, np. `x3`.
2. Po tapnięciu grupa wysuwa się do przodu.
3. Karty z grupy rozkładają się na pierwszym planie.
4. Gracz może wybrać jedną, kilka albo wszystkie karty z grupy.
5. Wybrane karty są podświetlone.
6. Aplikacja pokazuje licznik wybranych kart.
7. Jeśli wszystkie karty z grupy mogą zostać legalnie zagrane, aplikacja pokazuje przycisk `Rzuć wszystkie`.
8. Przycisk `Rzuć wszystkie` wybiera wszystkie legalne egzemplarze z grupy, ale nie zatwierdza ruchu bez kliknięcia `Zagraj`.

Przykład:

```text
Gracz ma 3 x dwójka kier.

Widok podstawowy:
[2 kier x3]

Po tapnięciu:
[2 kier] [2 kier] [2 kier]

Dostępne akcje:
- wybierz jedną;
- wybierz kilka;
- rzuć wszystkie;
- anuluj wybór.
```

### 11.2. Podgląd efektu przed zagraniem

Po wybraniu jednej albo wielu kart aplikacja powinna pokazać przewidywany efekt ruchu przed zatwierdzeniem.

Przykłady komunikatów:

- `Wybrane: 3 karty. Efekt: kara +6.`;
- `Wybrane: 2 walety. Po zagraniu wybierzesz żądaną wartość.`;
- `Wybrane: 1 dama. Efekt: przerwanie aktywnego żądania.`;
- `Wybrane: 4 dziesiątki. Po ruchu zostanie Ci 1 karta. Wymagane Makao.`

Podgląd efektu powinien być liczony przez ten sam silnik zasad, który waliduje ruch po stronie serwera.

## 12. Liczenie kart, stan gry i logi

Serwer musi znać dokładny stan każdej karty.

Śledzone strefy:

- stos dobierania;
- ręka każdego gracza;
- stos zagranych;
- spód stosu dobierania;
- karty wybrane do aktualnego ruchu;
- karty czekające na przetasowanie.

Każdy ruch zapisuje:

- gracza;
- kartę albo karty;
- efekt ruchu;
- liczbę dobranych kart;
- zmianę koloru;
- żądanie po walecie;
- Makao;
- karę za brak Makao;
- przetasowanie stosu, jeśli wystąpiło.

Klient gracza widzi tylko:

- własne karty;
- liczbę kart innych graczy;
- karty jawne na stole;
- publiczną historię ruchów;
- aktualny efekt gry.

Klient nie widzi:

- kart przeciwników;
- kolejności stosu dobierania;
- ukrytych informacji serwera;
- kart funkcyjnych przeniesionych na spód talii przy wyborze karty startowej.

### 12.1. Przejrzyste logi serwerowe

Aplikacja musi mieć czytelne logi serwerowe, żeby można było później sprawdzić, czy rozgrywka działała poprawnie.

Logi powinny być użyteczne do:

- debugowania zasad;
- sprawdzania poprawności rozdania;
- sprawdzania, dlaczego ruch został uznany za legalny albo nielegalny;
- analizy błędów po reconnectcie;
- sprawdzania przetasowań;
- odtwarzania kolejności zdarzeń;
- wykrywania niespójności stanu gry.

### 12.2. Rodzaje logów

Proponowany podział:

- `room_log` - tworzenie pokoju, wejścia graczy, gotowość, start;
- `deal_log` - tasowanie, rozdanie, karta startowa;
- `game_event_log` - ruchy graczy i efekty kart;
- `rule_validation_log` - decyzje silnika zasad;
- `connection_log` - połączenia, rozłączenia, reconnect;
- `admin_log` - działania hosta;
- `cleanup_log` - usuwanie logów i zakończonych gier.

### 12.3. Widoczność logów

Nie wszystkie logi są dla graczy.

Podział:

- publiczna historia gry - widoczna dla graczy;
- log techniczny - tylko dla serwera/admina;
- log debugowania - do analizy błędów;
- log bezpieczeństwa - do sprawdzenia, kto usunął dane albo zmienił ustawienia.

Przykład: jeśli krupier trafił na damę jako kartę startową i przeniósł ją na spód talii, gracze tego nie widzą. Widzi to tylko log techniczny.

### 12.4. Usuwanie logów

W ustawieniach aplikacji powinna istnieć możliwość usunięcia logów, ale tylko po świadomym potwierdzeniu.

Proponowany mechanizm:

1. Użytkownik wchodzi w ustawienia.
2. Wybiera „Usuń logi”.
3. Aplikacja pokazuje ostrzeżenie, że logi pomagają diagnozować błędy i nie da się ich przywrócić.
4. Użytkownik musi podać hasło konta albo hasło administratora/hosta, zależnie od poziomu uprawnień.
5. System usuwa logi zgodnie z uprawnieniami.
6. Sam fakt usunięcia logów zapisuje się w osobnym logu bezpieczeństwa.

Rekomendacja:

- gracz może usunąć lokalne logi aplikacji;
- host może usunąć historię swojego pokoju po zakończeniu gry;
- pełne logi serwerowe usuwa tylko administrator;
- usunięcie logów wymaga hasła;
- usunięcie logów zostawia ślad audytowy.

### 12.5. Log startu gry

Log startu gry powinien zawierać:

- ID pokoju;
- ID partii;
- datę i czas startu;
- liczbę graczy;
- liczbę talii;
- informację, czy jokery są włączone;
- kolejność graczy;
- wynik tasowania jako bezpieczny zapis techniczny, niedostępny dla zwykłego klienta;
- rozdane karty, przypisane do graczy;
- karty odrzucone ze startu jako funkcyjne i przeniesione na spód talii;
- finalną kartę startową;
- aktywne ustawienia zasad.

Przykład logu technicznego:

```json
{
  "event": "initial_card_rejected",
  "reason": "functional_card",
  "card": "deck1_queen_hearts",
  "action": "moved_to_bottom_of_draw_pile",
  "visibleToPlayers": false
}
```

Drugi przykład:

```json
{
  "event": "initial_card_selected",
  "card": "deck1_7_clubs",
  "visibleToPlayers": true
}
```

## 13. Kończenie się kart i tasowanie

### 13.1. Gdy kończy się stos dobierania

Gdy kończy się stos dobierania, system wykonuje przetasowanie kart zagranych i kontynuuje grę bez przerywania rozgrywki.

Przetasowanie musi działać podobnie jak w realnej grze:

1. Gracz dobiera karty ze stosu dobierania tak długo, jak są dostępne.
2. Jeśli stos dobierania skończy się w trakcie dobierania, serwer zbiera dostępne karty ze stosu zagranych.
3. Serwer tasuje zebrane karty po stronie serwera.
4. Gracz dobiera brakujące karty z nowo przetasowanego stosu.
5. Dopiero po zakończeniu dobierania serwer wybiera nową neutralną kartę stołu.
6. Jeśli przy wyborze nowej karty stołu serwer trafi na kartę funkcyjną, odkłada ją na spód stosu dobierania i sprawdza kolejną kartę.
7. Proces trwa do momentu znalezienia karty niefunkcyjnej.
8. Znaleziona karta niefunkcyjna zostaje położona jako aktualna karta stołu.
9. Gra toczy się dalej od tej neutralnej karty stołu.

Karty funkcyjne odrzucone przy szukaniu neutralnej karty stołu trafiają na spód stosu dobierania, a nie na stos kart już zagranych.

Gracze nie widzą informacji, ile kart funkcyjnych zostało pominiętych przy wyborze neutralnej karty stołu. To zdarzenie zapisuje się wyłącznie w logach technicznych.

### 13.2. Wymagania tasowania

Tasowanie musi być po stronie serwera.

Wymagania:

- używać algorytmu Fisher-Yates;
- używać solidnego generatora losowego;
- nie ujawniać klientom kolejności kart;
- nie odtwarzać kolejności, w jakiej karty były zagrywane;
- każdy nowy stos musi być losowy;
- nie tworzyć aktywnego efektu tylko dlatego, że podczas przetasowania albo wybierania karty stołu pojawiła się karta funkcyjna.

### 13.3. Wybór neutralnej karty stołu po przetasowaniu

Po przetasowaniu serwer musi wybrać neutralną kartę stołu.

Neutralna karta stołu to karta, która mogłaby być kartą startową gry.

Neutralne karty:

- 5;
- 6;
- 7;
- 8;
- 9;
- 10;
- król trefl;
- król karo.

Kartami neutralnymi nie są:

- 2;
- 3;
- 4;
- dama;
- walet;
- as;
- król kier;
- król pik;
- joker.

Jeśli serwer podczas wybierania karty stołu trafi na kartę funkcyjną:

1. nie pokazuje jej graczom;
2. nie uruchamia jej efektu;
3. odkłada ją na spód stosu dobierania;
4. sprawdza kolejną kartę;
5. powtarza proces do znalezienia karty neutralnej.

Przykład:

1. Gracz A musi dobrać 2 karty.
2. W stosie dobierania została 1 karta.
3. Gracz A dobiera ostatnią kartę.
4. Serwer zbiera stos zagranych i tasuje go.
5. Gracz A dobiera brakującą drugą kartę z nowo przetasowanego stosu.
6. Dopiero po zakończeniu dobierania serwer wybiera nową kartę stołu.
7. Serwer trafia na 3 pik.
8. 3 pik jest funkcyjna, więc trafia na spód stosu dobierania.
9. Serwer sprawdza następną kartę.
10. Serwer trafia na 7 trefl.
11. 7 trefl zostaje położona jako neutralna karta stołu.
12. Kara zostaje rozliczona.
13. Gra toczy się dalej od 7 trefl.

### 13.4. Skrajny przypadek: brak neutralnej karty po przetasowaniu

To jest sytuacja skrajna i powinna być praktycznie niewidoczna dla graczy.

Serwer przed wyborem neutralnej karty powinien sprawdzić, czy w przetasowanym stosie istnieje przynajmniej jedna karta neutralna.

Jeśli karta neutralna istnieje:

- serwer tasuje stos;
- szuka neutralnej karty;
- każdą trafioną kartę funkcyjną odkłada na spód stosu dobierania;
- powtarza czynność aż do położenia neutralnej karty stołu;
- nie pokazuje graczom żadnego komunikatu o pominiętych kartach funkcyjnych.

Jeśli po analizie matematycznej okaże się, że w dostępnych kartach nie ma żadnej karty neutralnej:

- serwer nie powinien losowo uruchamiać efektu karty funkcyjnej;
- serwer nie powinien prosić hosta o ręczne wskazywanie karty;
- serwer zapisuje sytuację w logu technicznym;
- serwer wykonuje bezpieczne przetasowanie ponownie, gdy tylko pojawi się możliwość utworzenia neutralnej karty;
- gra nie pokazuje graczom szczegółów technicznych, które mogłyby ujawnić układ talii.

Zasada silnika:

```text
Po przetasowaniu nie wolno położyć karty funkcyjnej jako nowej neutralnej karty stołu.
Karty funkcyjne trafiają na spód stosu dobierania.
Serwer szuka neutralnej karty do skutku, o ile neutralna karta istnieje w dostępnym stosie.
```

## 14. Makao

### 14.1. Ręczne Makao

Makao powinno być ręczne.

Gracz musi kliknąć przycisk „Makao” po ruchu, który zostawia go z dokładnie jedną kartą, najpóźniej zanim minie krótkie okno po zakończeniu tego ruchu. Zgłoszone Makao musi istnieć przed późniejszą próbą zagrania ostatniej karty.

Przycisk „Makao” nie powinien być agresywnie wyeksponowany. Nie może być chamsko mały ani ukryty, ale powinien być dyskretny, żeby aplikacja nie prowadziła gracza za rękę i nie odbierała sensu mechanice złapania na braku Makao.

Rekomendacja UI:

- przycisk jest widoczny w stałym miejscu interfejsu;
- nie wyskakuje jako duży modal na środku ekranu;
- nie zasłania kart ani przycisku `Zagraj`;
- może być subtelnie podświetlony, ale bez nachalnego alarmu;
- gracz musi sam pamiętać, żeby go kliknąć.

Przepływ:

1. Gracz zagrywa kartę albo kilka kart i po ruchu zostaje mu jedna karta.
2. Aplikacja otwiera krótkie okno na zgłoszenie Makao.
3. Przycisk „Makao” jest dostępny w dyskretnym miejscu interfejsu.
4. Gracz może kliknąć „Makao” w tym oknie po ruchu.
5. Jeśli nie kliknie w wymaganym czasie, staje się podatny na złapanie przez innych graczy, a późniejsza próba zejścia do zera bez zgłoszonego Makao nie kończy gry.

### 14.2. Złapanie na braku Makao

Jeśli gracz nie powie Makao, każdy inny gracz może kliknąć przycisk:

> Złap na braku Makao

Okno czasowe na powiedzenie Makao wynosi zawsze 5 sekund.

To jest wartość stała, a nie ustawienie pokoju.

Okno czasowe działa tak:

- zaczyna się po zakończeniu ruchu gracza, który został z jedną kartą;
- trwa dokładnie 5 sekund;
- w tym czasie gracz może jeszcze kliknąć „Makao”;
- po upływie 5 sekund gracz może zostać złapany;
- jeśli nikt go nie złapie, brak Makao nadal blokuje późniejsze zwycięstwo: próba zagrania ostatniej karty bez zgłoszonego Makao nie kończy gry i daje karę.

Efekt złapania:

- zapominalski gracz dobiera karę;
- domyślna kara: +5 kart;
- wartość kary może być ustawieniem pokoju.

Przykład:

1. Gracz A zagrywa kartę i zostaje z jedną kartą.
2. Nie klika „Makao”.
3. System odlicza stałe okno 5 sekund.
4. Po 5 sekundach gracz A może zostać złapany.
5. Gracz B klika „Złap na braku Makao”.
6. Serwer sprawdza, czy A faktycznie nie zgłosił Makao w ciągu 5 sekund.
7. Jeśli zgłoszenia nie było, A dobiera +5 kart.

Zasada UI:

- przycisk „Makao” ma być dostępny, ale dyskretny;
- aplikacja nie powinna wyświetlać dużego komunikatu typu „Kliknij Makao teraz”;
- mechanika ma wymagać uwagi gracza, tak jak w realnej grze.

### 14.3. Kara za brak Makao

Opcje:

- brak kary;
- +1 karta;
- +2 karty;
- +5 kart;
- wartość własna.

Rekomendacja domyślna: +5 kart.

### 14.4. Automatyczne Makao

Można dodać jako opcję, ale nie jako domyślne zachowanie.

Opcje:

- ręczne Makao;
- automatyczne Makao;
- ręczne Makao z ostrzeżeniem.

Rekomendacja: ręczne Makao z możliwością złapania przez innych graczy.

### 14.5. Makao przy ruchach wielokartowych

Makao jest wymagane po ruchu, który zostawia gracza z dokładnie jedną kartą, i musi być zgłoszone przed późniejszą próbą wygrania przez zejście do zera kart.

Zasady:

- jeśli gracz po ruchu zostaje z jedną kartą, musi zgłosić Makao w 5-sekundowym oknie;
- jeśli gracz zagrywa wszystkie pozostałe karty bez wcześniejszego zgłoszonego Makao, nie kończy gry i dobiera karę;
- jeśli gracz zagrywa kilka kart naraz i po ruchu zostaje z jedną kartą, Makao jest wymagane;
- jeśli gracz nie powiedział Makao, inni gracze mogą go złapać dopiero po upływie 5 sekund;
- jeśli w ciągu tych 5 sekund gracz zdąży kliknąć Makao, kara nie działa.

Przykłady:

| Sytuacja | Czy Makao jest wymagane? |
|---|---|
| gracz ma 3 karty i zagrywa 2, zostaje z 1 | tak |
| gracz ma 4 karty i zagrywa 3, zostaje z 1 | tak |
| gracz ma 2 karty i zagrywa 2 bez wcześniejszego Makao | nie kończy gry, dobiera karę |
| gracz ma 1 kartę i zagrywa ostatnią po wcześniejszym Makao | może skończyć grę |
| gracz ma 1 kartę i zagrywa ostatnią bez wcześniejszego Makao | nie kończy gry, dobiera karę |

### 14.6. Koniec gry i kolejność miejsc

Gracz kończy grę natychmiast po legalnym zagraniu ostatniej karty.

Zasada nadrzędna:

```text
Rzucam ostatnią kartę i wygrywam, jeśli wcześniej spełniłem wymagania Makao.
```

Efekty kart zagranych jako ostatnie nie mogą cofnąć wygranej gracza ani zmusić go do dobrania kart po tym, jak skończył grę.

Zasady klasyfikacji:

- nie ma remisu przy zejściu z kart;
- liczy się faktyczna kolejność zakończenia gry;
- jeśli kilku graczy może skończyć w tej samej rundzie, miejsca ustala się według kolejności tur zgodnie z ruchem wskazówek zegara;
- gracz bez kart jest pomijany przy wyznaczaniu kolejnych celów kar, pauz i żądań;
- aktywny efekt trafia zawsze do pierwszego gracza, który nadal ma karty, zgodnie z kierunkiem działania efektu.

#### 14.6.1. Ostatnia karta jako król pik albo król kier

Jeśli gracz zagrywa ostatnią kartę jako króla pik albo króla kier, kończy grę natychmiast.

Efekt kary nadal może zostać utworzony, ale nie działa na gracza, który skończył grę. Kara trafia do pierwszego gracza, który nadal ma karty, zgodnie z kierunkiem ataku.

Przykład króla pik:

1. Kolejność graczy: A, B, C, D.
2. Gracz C zagrywa ostatnią kartę: król pik.
3. Gracz C kończy grę i zajmuje miejsce w klasyfikacji.
4. Król pik atakuje wstecz.
5. Jeśli B ma karty, B przyjmuje albo przebija karę.
6. Jeśli B nie ma kart, kara idzie dalej wstecz do A.
7. Jeśli A też nie ma kart, kara idzie do pierwszego gracza z kartami w tym kierunku.

#### 14.6.2. Ostatnia karta jako 2 albo 3

Jeśli gracz zagrywa ostatnią kartę jako 2 albo 3, kończy grę natychmiast.

Kara trafia do pierwszego gracza, który nadal ma karty, zgodnie z aktualną kolejnością gry.

#### 14.6.3. Ostatnia karta jako 4

Jeśli gracz zagrywa ostatnią kartę jako 4, kończy grę natychmiast, o ile spełnił wymagania Makao.

Pauza trafia do pierwszej osoby, która nadal ma karty, zgodnie z kolejką.

#### 14.6.4. Ostatnia karta jako as

Jeśli gracz zagrywa ostatnią kartę jako asa, kończy grę natychmiast.

Gracz może wybrać żądanie koloru albo `Bez żądania`, ale wybrany efekt nie obowiązuje już jego samego. Jeśli powstaje `suit_request`, trafia do pierwszego gracza, który nadal ma karty.

#### 14.6.5. Ostatnia karta jako jopek

Jeśli gracz zagrywa ostatnią kartę jako jopka, kończy grę natychmiast.

Gracz może wybrać żądanie wartości 5-10 albo `Bez żądania`, ale wybrany efekt nie obowiązuje już jego samego. Jeśli powstaje `rank_request`, trafia do pierwszego gracza, który nadal ma karty.

#### 14.6.6. Ostatnia karta jako dama

Jeśli gracz zagrywa ostatnią kartę jako damę, kończy grę natychmiast.

Dama nie wymaga dodatkowej deklaracji i nie tworzy nowego aktywnego efektu.

#### 14.6.7. Ostatnia karta jako joker

Joker jest traktowany jak każda inna karta, ale wymaga deklaracji.

Jeśli gracz zagrywa jokera jako ostatnią kartę:

1. deklaruje, jaką kartą albo jakim efektem jest joker;
2. serwer sprawdza, czy deklaracja tworzy legalny ruch;
3. jeśli ruch jest legalny, gracz kończy grę natychmiast;
4. ewentualny efekt deklaracji trafia do pierwszego gracza, który nadal ma karty;
5. efekt nie może wrócić do gracza, który skończył grę.

## 15. Ekran gry na telefonie

### 15.1. Układ

Domyślnie ekran pionowy.

Widoczne elementy:

- karty gracza na dole;
- przeciwnicy jako panele z liczbą kart;
- stos zagranych na środku;
- stos dobierania obok;
- aktualny efekt gry nad stołem;
- przycisk „Dobierz”;
- przycisk „Zagraj”;
- przycisk „Makao”, gdy potrzebny;
- przycisk „Sortuj”;
- menu pokoju.

### 15.2. Komunikaty gry i widoczność stanu stołu

Aplikacja musi stale pokazywać jasny stan:

- „Twoja tura”;
- „Dobierz 6 albo przebij”;
- „Żądanie: dama”;
- „Kolor: pik”;
- „Pauza”;
- „Wybrane 3 karty, kara +6”;
- „Brak limitu czasu”;
- „Gracz rozłączony”;
- „Czekamy na hosta”.

UI musi szczególnie wyraźnie wyświetlać:

- sumę kart do dobrania w aktualnej wojnie;
- obecne żądanie po walecie;
- aktywny kolor po asie;
- informację, czy trwa kara;
- czy dama może być teraz zagrana;
- licznik kart w dłoni każdego przeciwnika;
- status graczy: online, offline, pauza, gotowy.

Przykłady komunikatów:

- „Aktywna kara: +15. Dama nie może obronić.”
- „Żądanie: 10. Możesz zagrać 10 albo legalną kartę według zasad pokoju.”
- „Gracz ma 1 kartę i nie powiedział Makao. Możesz go złapać.”

### 15.3. Obsługa dużej liczby kart

Przy wielu taliach potrzebne są:

- przewijana ręka;
- sortowanie;
- grupowanie duplikatów;
- kompaktowy widok;
- powiększenie karty po przytrzymaniu;
- podświetlanie kart możliwych do zagrania.

### 15.4. Podpowiadanie legalnych ruchów

Aplikacja powinna podpowiadać graczowi, które karty może legalnie zagrać w aktualnej sytuacji.

Podpowiedzi muszą wynikać z pełnego stanu gry, a nie tylko z ostatniej karty na stole.

Silnik podpowiedzi bierze pod uwagę:

- kartę leżącą na stole;
- aktywną karę;
- aktywne żądanie koloru po asie;
- aktywne żądanie wartości po walecie;
- aktywną pauzę;
- wariant działania damy;
- włączone lub wyłączone jokery;
- możliwość zagrywania wielu kart naraz;
- karty posiadane przez gracza.

Zachowanie:

- jeśli nie ma aktywnego efektu, aplikacja podświetla karty pasujące kolorem, wartością, damy oraz jokery;
- jeśli trwa aktywna kara, aplikacja podświetla karty, które mogą legalnie odpowiedzieć na karę, ale nadal pokazuje przycisk dobrania/przyjęcia kary;
- podpowiedzi nie mogą wymuszać ruchu; gracz zawsze może przyjąć karę albo pauzę, jeśli taki efekt jest skierowany do niego;
- w domyślnym wariancie dama nie jest podpowiadana jako obrona przed karą;
- jeśli trwa żądanie po asie, aplikacja podświetla karty w żądanym kolorze oraz damę;
- jeśli trwa żądanie po walecie, aplikacja podświetla karty o żądanej wartości oraz damę;
- jeśli dama może przerwać żądanie, aplikacja powinna jasno pokazać, że po jej zagraniu żądanie zostanie zakończone.

Przykłady komunikatów:

- `Możesz zagrać kartę w kolorze pik albo damę.`;
- `Żądanie: 10. Możesz zagrać 10 albo damę.`;
- `Aktywna kara: +6. Dobierz 6 albo przebij kartą bitewną.`;
- `Dama nie chroni przed tą karą.`;
- `Po zagraniu damy żądanie zostanie zakończone.`

## 16. System pauzy, rozłączenia, zapis gry i powrót do sesji

Rozłączenie gracza nie może kasować gry ani blokować możliwości powrotu. Serwer musi utrzymywać stan rozgrywki i pozwalać graczowi wrócić do tej samej partii.

### 16.1. Pauza gracza - status „Zaraz wracam”

Gra nie powinna opierać się na automatycznym wyrzucaniu graczy za bezczynność. To gra ze znajomymi, więc potrzebny jest ręczny system pauzy.

Każdy gracz ma przycisk pauzy.

Po kliknięciu:

- rozgrywka zostaje zawieszona;
- wszyscy gracze widzą komunikat: „Gracz [Nick] wstrzymał grę - zaraz wraca”;
- stan gry pozostaje bez zmian;
- nikt nie może wykonać ruchu, dopóki pauza trwa, chyba że zasady pokoju pozwalają hostowi wymusić wznowienie.

### 16.2. Zdjęcie pauzy

Standardowo pauzę może zdjąć gracz, który ją założył.

Przepływ:

1. Gracz klika „Zaraz wracam”.
2. Gra zostaje spauzowana.
3. Ten sam gracz wraca i klika „Wznów”.
4. Gra automatycznie wraca do tego samego punktu.

### 16.3. Uprawnienia hosta przy pauzie

Host musi mieć możliwość zdjęcia cudzej pauzy, żeby pokój nie został permanentnie zablokowany.

Wymagane jest podwójne potwierdzenie.

Przykład komunikatu:

> Gracz [Nick] nadal jest oznaczony jako nieobecny. Czy na pewno chcesz wymusić wznowienie gry? Może to skutkować pominięciem jego tury.

Przyciski:

- Potwierdź;
- Anuluj.

Działanie hosta musi być zapisane w logach serwera.

### 16.4. Podstawowa zasada reconnectu

Gra jest prowadzona po stronie serwera, a nie na telefonie gracza.

To oznacza:

- telefon gracza jest tylko klientem;
- pełny stan gry jest przechowywany na serwerze;
- po utracie internetu gracz nie traci miejsca przy stole;
- po ponownym połączeniu aplikacja pobiera aktualny stan gry z serwera;
- gracz wraca do tej samej ręki, tej samej partii i tego samego pokoju.

### 16.5. Co zapisujemy

Serwer musi zapisywać pełny stan aktywnej rozgrywki:

- identyfikator pokoju;
- identyfikator partii;
- lista graczy;
- kolejność graczy;
- status każdego gracza: online, offline, gotowy, w grze;
- ręka każdego gracza;
- stos dobierania;
- stos kart zagranych;
- aktualna karta na stole;
- aktualny kolor po asie;
- aktualne żądanie po walecie;
- aktywna kara do dobrania;
- aktywne pauzy;
- czyja jest tura;
- wybrane ustawienia zasad;
- liczba talii;
- historia ruchów;
- czas ostatniej aktywności graczy;
- informacja, czy gra jest aktywna, spauzowana, zakończona albo czeka na gracza.

### 16.6. Powrót gracza do gry

Gracz powinien móc wrócić do gry na kilka sposobów:

- automatycznie po ponownym otwarciu aplikacji;
- przez ten sam link zaproszenia;
- przez kod pokoju;
- przez konto użytkownika, jeśli jest zalogowany;
- przez tymczasowy token sesji zapisany na urządzeniu.

Najlepszy przepływ:

1. Gracz traci połączenie.
2. Serwer oznacza go jako offline.
3. Pozostali gracze widzą komunikat: „Gracz rozłączony”.
4. Gra może zostać automatycznie spauzowana albo kontynuowana według ustawień pokoju.
5. Gracz uruchamia aplikację ponownie.
6. Aplikacja wykrywa aktywną sesję.
7. Aplikacja pyta: „Wrócić do trwającej gry?”.
8. Po potwierdzeniu klient pobiera aktualny stan z serwera.
9. Gracz wraca do tej samej partii.

### 16.7. Zachowanie gry po rozłączeniu

Host powinien wybrać zachowanie pokoju przed startem gry.

Opcje:

- pauzuj grę, gdy aktywny gracz się rozłączy;
- pauzuj grę, gdy dowolny gracz się rozłączy;
- pozwól grać dalej, ale pomijaj rozłączonego gracza tylko decyzją hosta;
- czekaj bez limitu;
- czekaj określony czas, potem daj hostowi decyzję.

Domyślna rekomendacja:

- jeśli rozłączy się gracz, którego jest tura, gra zostaje spauzowana;
- jeśli rozłączy się gracz poza swoją turą, gra może toczyć się dalej, ale system pokaże status offline;
- host może ręcznie spauzować grę w każdej chwili.

#### 16.7.1. Rozłączenie gracza, który musi rozwiązać aktywny efekt

Jeśli rozłączy się gracz, który musi rozwiązać `activeEffect`, gra zostaje automatycznie spauzowana.

Dotyczy to sytuacji, gdy gracz jest celem:

- aktywnej kary `draw_penalty`;
- żądania koloru `suit_request`;
- żądania wartości `rank_request`;
- pauzy `skip_turn`;
- deklaracji wymaganej przez jokera, asa albo jopka.

Host może wtedy:

- czekać na powrót gracza;
- wymusić wznowienie gry;
- wymusić przyjęcie efektu przez gracza offline;
- pominąć turę gracza, jeśli ustawienia pokoju na to pozwalają;
- zakończyć partię administracyjnie w sytuacji sporu albo blokady gry.

Wymuszenie przyjęcia efektu wymaga podwójnego potwierdzenia i zapisuje się w `admin_log`.

Przykład:

1. Gracz A rzuca 2 kier.
2. Celem kary jest gracz B.
3. Gracz B traci połączenie.
4. Gra zostaje spauzowana.
5. Host może poczekać albo po podwójnym potwierdzeniu wymusić dobranie kary przez B.
6. Działanie hosta trafia do publicznej historii i do `admin_log`.

### 16.8. Brak automatycznego ruchu za gracza

Aplikacja nie wykonuje ruchu za rozłączonego gracza.

Nie ma:

- automatycznego dobrania karty za gracza;
- automatycznego zagrania karty;
- przejęcia przez bota;
- losowego ruchu;
- wymuszonej decyzji serwera bez ustawienia hosta.

Jeśli trzeba rozstrzygnąć sytuację, robi to host albo wcześniej ustawiona reguła pokoju.

### 16.9. Zapis rozgrywki

Stan gry powinien być zapisywany cyklicznie i po każdym ruchu.

Minimalna zasada:

- po każdym ruchu serwer zapisuje pełny aktualny stan albo zdarzenie ruchu;
- po reconnectcie klient odbudowuje widok z aktualnego stanu;
- historia ruchów pozwala odtworzyć, co się wydarzyło.

Najbezpieczniejszy model:

- pełny snapshot stanu gry co kilka ruchów;
- event log każdego ruchu;
- możliwość odbudowania partii po awarii serwera;
- wersjonowanie stanu, żeby uniknąć konfliktów.

### 16.10. Trwałość aktywnej gry

Aktywna gra powinna mieć czas życia.

Propozycja:

- aktywna partia bez limitu, dopóki ktoś z graczy wraca;
- możliwość ręcznego zakończenia przez hosta;
- automatyczne wygaśnięcie po np. 24-72 godzinach pełnej nieaktywności;
- host może wznowić grę, jeśli pokój nadal istnieje.

W ustawieniach pokoju można dodać:

- „zapisuj grę do późniejszego wznowienia”;
- „usuń nieaktywną grę po 24h / 72h / 7 dniach”;
- „pozwól wrócić tylko tym samym graczom”.

### 16.11. Widok dla pozostałych graczy

Gdy ktoś się rozłączy, reszta graczy powinna widzieć jasny stan:

- „Gracz X offline”;
- „Czekamy na powrót gracza”;
- „Gra spauzowana przez rozłączenie”;
- „Host może wznowić lub pominąć turę”;
- „Ostatnio aktywny: 2 minuty temu”.

### 16.12. Bezpieczeństwo powrotu

Powrót do gry musi być bezpieczny, żeby inna osoba nie przejęła miejsca gracza.

Mechanizmy:

- token sesji zapisany lokalnie na urządzeniu;
- konto użytkownika jako mocniejsza metoda identyfikacji;
- link zaproszenia pozwala dołączyć do pokoju, ale nie powinien pozwalać przejąć czyjejś ręki;
- jeśli gracz wraca z innego urządzenia, może być wymagana autoryzacja albo zgoda hosta;
- serwer musi sprawdzić, czy użytkownik ma prawo wrócić na konkretne miejsce.

## 17. Backend

### 17.1. Model

Serwer jest autorytatywny i przechowuje stan gry.

Klient wysyła intencję, np.:

- chcę zagrać te karty;
- chcę dobrać;
- wybieram kolor;
- żądam wartości;
- mówię Makao;
- wracam do aktywnej gry.

Serwer:

- sprawdza legalność;
- aktualizuje stan;
- zapisuje stan po ruchu;
- przelicza efekty;
- zapisuje historię;
- obsługuje status online/offline graczy;
- pozwala odtworzyć rozgrywkę po reconnectcie;
- wysyła każdemu graczowi widok odpowiedni dla niego.

### 17.2. Komunikacja

- WebSocket do gry w czasie rzeczywistym;
- REST API do kont, pokojów, ustawień i historii;
- PostgreSQL na dane trwałe;
- Redis na aktywne pokoje i sesje;
- storage/CDN na grafiki.

### 17.3. Strategia: aplikacja webowa i Android

Docelowo pierwszym widocznym klientem ma być Android, ale technicznie warto rozważyć zbudowanie warstwy webowej jako bazowego klienta gry, a następnie przeniesienie jej na Androida.

Rekomendowany kierunek:

- silnik zasad i backend są niezależne od platformy;
- klient webowy służy jako szybki prototyp stołu, lobby, reconnectu i UI kart;
- Android może później używać tej samej logiki komunikacji z backendem;
- jeśli użyty zostanie framework webowy możliwy do opakowania jako aplikacja mobilna, łatwiej utrzymać jedną bazę UI;
- niezależnie od technologii klienta, serwer pozostaje autorytatywny.

Możliwe podejścia:

| Podejście | Zaleta | Ryzyko |
|---|---|---|
| Web first, potem Android wrapper / PWA / WebView | szybkie prototypowanie i testy zasad | słabsze odczucie natywności |
| React Native / Expo | jedna baza pod Androida i później iOS | trzeba uważać na wydajność UI kart |
| Natywny Android | najlepsze dopasowanie do platformy | wolniejsze testowanie zmian UI i zasad |

Dla tej gry najważniejsze jest, aby silnik zasad nie był zaszyty w UI Androida. UI może się zmienić, ale reguły Makao muszą pozostać identyczne na każdej platformie.

### 17.4. Wersjonowanie stanu gry

Każdy stan gry powinien mieć numer wersji.

Przykład:

```json
{
  "gameId": "game_123",
  "state_version": 142
}
```

Zasada:

- `state_version` startuje od 1;
- każda zaakceptowana akcja zwiększa wersję o 1;
- ruch gracza, dobranie kart, pauza, reconnect, zmiana statusu i przetasowanie mogą tworzyć nowe zdarzenie;
- klient i serwer mogą łatwo sprawdzić, czy są zsynchronizowani.

### 17.5. Delta updates przy reconnectcie

Gdy gracz wraca po utracie internetu, klient nie musi zawsze pobierać pełnego stanu gry.

Przepływ:

1. Klient pamięta ostatnią znaną wersję, np. `state_version = 130`.
2. Po reconnectcie wysyła do serwera: „Mam wersję 130”.
3. Serwer sprawdza aktualną wersję, np. 142.
4. Serwer wysyła zdarzenia od 131 do 142.
5. Klient odtwarza brakujące zdarzenia i wraca do aktualnego stołu.

Przykład delty:

```json
{
  "fromVersion": 130,
  "toVersion": 142,
  "events": [
    { "version": 131, "event": "player_drew_cards", "playerId": "p2", "count": 2 },
    { "version": 132, "event": "card_played", "playerId": "p3", "card": "deck1_5_spades" }
  ]
}
```

Korzyści:

- mniejsze zużycie internetu mobilnego;
- szybszy powrót do gry;
- łatwiejsze debugowanie;
- możliwość odtworzenia przebiegu partii.

Jeśli klient ma zbyt starą wersję albo brakuje eventów, serwer może wysłać pełny snapshot aktualnego stanu.

### 17.5. Snapshoty stanu gry

Oprócz logu zdarzeń serwer powinien okresowo tworzyć snapshot całej gry.

Propozycja:

- snapshot po starcie gry;
- snapshot co kilka/kilkanaście ruchów;
- snapshot po przetasowaniu;
- snapshot po reconnectcie, jeśli wykryto niespójność;
- snapshot po zakończeniu gry.

Snapshot pozwala szybciej odbudować stan bez odtwarzania całej partii od początku.

### 17.6. Unikalne ID każdej karty

Każda karta w grze musi mieć unikalny identyfikator wygenerowany na starcie partii.

Przykład dla gry na 3 talie:

- `deck1_hearts_queen`;
- `deck2_hearts_queen`;
- `deck3_hearts_queen`.

Lepszy wariant techniczny:

```json
{
  "cardInstanceId": "card_8f23a91c",
  "deckNumber": 2,
  "suit": "hearts",
  "rank": "queen"
}
```

Dzięki temu:

- klient wie dokładnie, która karta leży na stole;
- serwer nie pomyli dwóch takich samych kart z różnych talii;
- łatwiej debugować duplikaty;
- łatwiej wykryć niespójność po reconnectcie;
- historia ruchów jest jednoznaczna.

### 17.7. Aktywny efekt gry

Silnik musi rozróżniać kartę leżącą na stole od aktywnego efektu tej karty.

Nie wolno zakładać, że efekt nadal trwa tylko dlatego, że karta funkcyjna nadal leży na stosie zagranych.

Przykłady błędnych założeń:

- na stole leży 2, więc każdy kolejny gracz ma dobrać 2 karty;
- na stole leży as, więc każdy kolejny gracz musi grać wskazanym kolorem;
- na stole leży walet, więc każdy kolejny gracz musi grać żądaną wartością.

Poprawna zasada:

- karta leży na stole jako `topCard`;
- efekt karty istnieje osobno jako `activeEffect`;
- po rozliczeniu efektu `activeEffect` jest usuwany;
- sama karta pozostająca na stole nie uruchamia efektu ponownie.

Przykładowy stan w trakcie kary:

```json
{
  "topCard": {
    "cardInstanceId": "card_201",
    "rank": "2",
    "suit": "hearts"
  },
  "activeEffect": {
    "type": "draw_penalty",
    "amount": 2,
    "targetPlayerId": "player_b",
    "sourceCardIds": ["card_201"],
    "status": "active"
  }
}
```

Przykładowy stan po dobraniu kary:

```json
{
  "topCard": {
    "cardInstanceId": "card_201",
    "rank": "2",
    "suit": "hearts"
  },
  "activeEffect": null
}
```

W tym stanie kolejny gracz gra normalnie względem dwójki kier, ale nie dobiera już kary za poprzedni efekt.

### 17.8. Typy aktywnych efektów

Podstawowe typy `activeEffect`:

| Typ | Źródło | Znaczenie | Kiedy znika |
|---|---|---|---|
| `draw_penalty` | 2, 3, król kier, król pik, joker jako karta bitewna | Gracz może dobrać karty albo przebić karę | Po dobraniu kary albo po przebiciu i przeniesieniu efektu na kolejnego gracza |
| `suit_request` | as z żądaniem koloru, joker jako as z żądaniem koloru | Gracz może zagrać wskazany kolor, damę, innego asa albo dobrać kartę | Po zagraniu karty w żądanym kolorze, damy, zastąpieniu żądania albo dobraniu karty |
| `rank_request` | walet z żądaniem wartości, joker jako walet z żądaniem wartości | Gracz może zagrać żądaną wartość, damę, innego waleta albo dobrać kartę | Po zagraniu żądanej wartości, damy, zastąpieniu żądania albo dobraniu karty |
| `skip_turn` | 4, joker jako 4 | Wskazany gracz może odpowiedzieć czwórką albo przyjąć pauzę | Po przyjęciu/pominięciu wskazanego gracza albo po przebiciu czwórką |
| `joker_declaration` | joker | Joker działa jako zadeklarowana karta albo efekt | Po przekształceniu w konkretny efekt albo po rozliczeniu ruchu |

### 17.9. Zasada końca kary i żądania

Silnik musi jednoznacznie wiedzieć, kiedy kończy się kara albo żądanie.

Reguły kończenia efektów:

- kara dobrania kart kończy się, gdy wskazany gracz dobierze wymaganą liczbę kart;
- gracz może dobrać karę nawet wtedy, gdy ma legalną kartę do przebicia;
- kara nie działa na kolejnych graczy po jej rozliczeniu;
- żądanie koloru po asie kończy się, gdy gracz zagra kartę w żądanym kolorze, damę, innego asa z opcją `Bez żądania` albo dobierze kartę;
- żądanie wartości po walecie kończy się, gdy gracz zagra kartę o żądanej wartości, damę, innego waleta z opcją `Bez żądania` albo dobierze kartę;
- dama zagrana na żądanie usuwa żądanie i pozwala kolejnemu graczowi grać normalnie na damę;
- pauza po czwórce kończy się, gdy wskazany gracz przyjmie pauzę i zostanie pominięty;
- gracz może przyjąć pauzę nawet wtedy, gdy ma czwórkę do odpowiedzi;
- czwórki nie pauzują dwóch kolejnych graczy; pauza kumuluje się na graczu, który ma rozliczyć aktywny efekt;
- efekt jokera kończy się zgodnie z deklaracją, jaką otrzymał joker.

Przykład z karą:

1. Gracz A rzuca 2 kier.
2. Serwer ustawia `activeEffect.draw_penalty = +2` dla gracza B.
3. Gracz B dobiera 2 karty.
4. Serwer ustawia `activeEffect = null`.
5. Na stole nadal leży 2 kier.
6. Gracz C gra normalnie do 2 kier.

Przykład z żądaniem asa:

1. Gracz A rzuca asa i żąda koloru pik.
2. Serwer ustawia `activeEffect.suit_request = spades`.
3. Gracz B rzuca damę.
4. Serwer usuwa `activeEffect`.
5. Gracz C może zagrać dowolną kartę na damę.

### 17.10. Walidacja akcji gracza

Każda akcja gracza powinna być walidowana po stronie serwera.

Kolejność walidacji:

1. Czy gra jest w stanie pozwalającym na ruch?
2. Czy to tura tego gracza?
3. Czy gracz posiada wskazane karty?
4. Czy istnieje aktywny efekt?
5. Jeśli istnieje aktywny efekt, czy ruch rozwiązuje ten efekt albo legalnie go przedłuża?
6. Jeśli nie ma aktywnego efektu, czy pierwsza karta jest legalna względem `topCard`?
7. Czy wszystkie karty w ruchu wielokartowym mają tę samą wartość?
8. Czy wymagane deklaracje zostały podane, np. kolor po asie, `Bez żądania` po asie, wartość po walecie, `Bez żądania` po walecie, deklaracja jokera?
9. Czy ruch wymaga Makao?
10. Po zaakceptowaniu ruchu serwer aktualizuje stan, zwiększa `state_version` i wysyła nowy widok do graczy.

### 17.11. Model stanów gry

Proponowane stany gry:

| Stan | Znaczenie |
|---|---|
| `LOBBY` | Pokój istnieje, gracze dołączają |
| `READY_CHECK` | Gracze oznaczają gotowość |
| `IN_PROGRESS` | Partia trwa |
| `WAITING_FOR_DECLARATION` | Serwer czeka na wybór koloru, wartości albo deklarację jokera |
| `PAUSED_BY_PLAYER` | Gracz ręcznie zatrzymał grę |
| `PAUSED_BY_DISCONNECT` | Gra zatrzymana przez rozłączenie gracza |
| `WAITING_FOR_HOST_DECISION` | Potrzebna decyzja hosta |
| `FINISHED` | Partia zakończona |
| `EXPIRED` | Partia wygasła po długiej nieaktywności |

## 18. Silnik zasad

Silnik zasad powinien być oddzielony od UI.

Funkcje silnika:

- utworzenie talii/talii;
- tasowanie;
- rozdanie;
- sprawdzenie legalności ruchu;
- zagranie jednej lub wielu kart;
- naliczenie kar;
- obsługa damy;
- obsługa asa;
- obsługa waleta;
- obsługa Makao;
- dobranie kart;
- przetasowanie stosu zagranych;
- sprawdzenie końca gry;
- wygenerowanie widoku stanu dla konkretnego gracza.

Logika kart bazowych:

```text
2 -> attack_draw_next(+2)
3 -> attack_draw_next(+3)
4 -> skip_next_player()
A -> request_suit() albo no_request()
J -> request_rank() albo no_request()
K hearts -> attack_next(+5)
K spades -> attack_previous(+5) if players >= 3
K spades -> attack_next(+5) if players == 2
K clubs -> normal_card
K diamonds -> normal_card
Q -> queen_rule_variant()
Joker -> wildcard()
```

### 18.1. Główna zasada silnika

Legalność ruchu nie jest sprawdzana wyłącznie na podstawie ostatniej karty na stole.

Silnik zawsze sprawdza:

1. aktualny stan gry;
2. aktywny efekt, jeśli istnieje;
3. kartę wierzchnią `topCard`;
4. warianty zasad pokoju;
5. karty posiadane przez gracza;
6. deklaracje wymagane przez ruch.

Główna reguła:

```text
if activeEffect exists:
    move must resolve activeEffect or legally extend it
else:
    move must match topCard by suit, rank, queen rule, joker rule, or other allowed rule
```

### 18.2. Podpowiedzi a silnik zasad

Podpowiedzi w UI powinny korzystać z tej samej logiki co walidacja serwerowa.

Klient może lokalnie podświetlać karty dla płynności interfejsu, ale ostateczna decyzja zawsze należy do serwera.

Serwer może udostępniać klientowi listę legalnych akcji, np.:

```json
{
  "playerId": "player_b",
  "legalActions": [
    {
      "type": "play_cards",
      "cardIds": ["card_301"],
      "label": "Rzuć damę",
      "resultPreview": "Przerwiesz żądanie koloru"
    },
    {
      "type": "play_cards",
      "cardIds": ["card_155", "card_166"],
      "label": "Rzuć wszystkie 10",
      "resultPreview": "Spełnisz żądanie wartości"
    },
    {
      "type": "draw_cards",
      "count": 6,
      "label": "Dobierz 6 kart",
      "resultPreview": "Przyjmiesz karę i zakończysz aktywną wojnę karną"
    },
    {
      "type": "accept_skip",
      "skipCount": 1,
      "label": "Przyjmij pauzę",
      "resultPreview": "Stracisz turę i rozliczysz efekt czwórki"
    }
  ]
}
```

### 18.3. Grupowanie kart a silnik

Grupowanie kart jest tylko uproszczeniem widoku klienta.

Serwer nadal widzi każdą kartę jako osobny obiekt:

```json
{
  "visibleGroup": {
    "rank": "2",
    "suit": "hearts",
    "count": 3
  },
  "cards": [
    { "cardInstanceId": "card_101", "deckNumber": 1, "rank": "2", "suit": "hearts" },
    { "cardInstanceId": "card_202", "deckNumber": 2, "rank": "2", "suit": "hearts" },
    { "cardInstanceId": "card_303", "deckNumber": 3, "rank": "2", "suit": "hearts" }
  ]
}
```

Przycisk `Rzuć wszystkie` wybiera wiele konkretnych `cardInstanceId`, a nie abstrakcyjną grupę.

### 18.4. Scenariusze testowe silnika zasad

Silnik zasad musi mieć testy automatyczne dla przypadków granicznych. Poniższe scenariusze są obowiązkowe dla MVP.

#### 18.4.1. Kary i wojna karna

1. Gracz A rzuca 2, gracz B ma 3, ale wybiera dobranie kary. `activeEffect` znika po dobraniu.
2. Gracz A rzuca 2 kier, gracz B może przebić tylko kartą bitewną zgodną z wojną kier.
3. Gracz A rzuca króla kier, kara +5 trafia do następnego gracza.
4. Gracz A rzuca króla pik przy 4 graczach, kara +5 trafia do poprzedniego gracza.
5. Gracz A rzuca króla pik przy 2 graczach, kara +5 trafia do przeciwnika.
6. Król pik zostaje przebity królem kier i kierunek ataku zmienia się zgodnie z ostatnim królem.
7. Po dobraniu kary karta bitewna zostaje na stole, ale nie tworzy ponownie kary dla następnego gracza.

#### 18.4.2. Ostatnia karta i klasyfikacja

1. Gracz zagrywa ostatnią zwykłą kartę i natychmiast zajmuje miejsce w klasyfikacji.
2. Gracz zagrywa ostatnią kartę jako 2 albo 3; wygrywa, a kara trafia do pierwszego gracza z kartami.
3. Gracz zagrywa ostatnią kartę jako król pik; wygrywa, a kara idzie wstecz do pierwszego gracza z kartami.
4. Gracz zagrywa ostatnią kartę jako król kier; wygrywa, a kara idzie do pierwszego gracza z kartami zgodnie z kierunkiem do przodu.
5. Gracz zagrywa ostatnią kartę jako 4; wygrywa, a pauza trafia do pierwszego gracza z kartami.
6. Gracz zagrywa ostatnią kartę jako as z żądaniem koloru; wygrywa, a `suit_request` trafia do pierwszego gracza z kartami.
7. Gracz zagrywa ostatnią kartę jako jopek z żądaniem wartości; wygrywa, a `rank_request` trafia do pierwszego gracza z kartami.
8. Gracz zagrywa ostatnią kartę jako dama i wygrywa bez tworzenia nowego efektu.
9. Gracz zagrywa ostatnią kartę jako joker, deklaruje legalny efekt i wygrywa.
10. Dwóch graczy kończy w kolejnych turach tej samej rundy; nie ma remisu, miejsca wynikają z kolejności tur zgodnie z ruchem wskazówek zegara.

#### 18.4.3. Asy, jopki i żądania

1. As z wybranym kolorem tworzy `suit_request`.
2. As z opcją `Bez żądania` nie tworzy `suit_request`.
3. Jopek z wybraną wartością 5-10 tworzy `rank_request`.
4. Jopek z opcją `Bez żądania` nie tworzy `rank_request`.
5. Jopek nie może żądać 2, 3, 4, damy, asa, jopka, króla ani jokera.
6. Dama przerywa aktywne żądanie asa.
7. Dama przerywa aktywne żądanie jopka.
8. Dobranie karty zamiast odpowiedzi kończy aktywne żądanie.

#### 18.4.4. Dama

1. Dama może zostać zagrana na dowolną kartę, jeśli nie trwa aktywna kara.
2. Dowolna karta może zostać zagrana na damę, jeśli nie blokuje tego aktywny efekt.
3. Dama nie przerywa aktywnej kary w wariancie domyślnym.
4. Dama pik albo dama kier anuluje aktywną karę w wariancie warszawskim, jeśli ten wariant jest włączony.
5. Dama nie zmienia koloru i nie tworzy aktywnego żądania.

#### 18.4.5. Czwórki i pauzy

1. Jedna 4 tworzy `skip_turn` z `skipCount = 1`.
2. Dwie 4 tworzą `skip_turn` z `skipCount = 2`.
3. `skipCount = 2` oznacza utratę dwóch własnych tur wskazanego gracza.
4. Po każdej utraconej turze `skipCount` zmniejsza się o 1.
5. Po spadku `skipCount` do 0 `activeEffect` zostaje usunięty.
6. Gracz może przyjąć pauzę mimo posiadania czwórki.
7. Gracz może odpowiedzieć czwórką, jeśli chce i ma legalną kartę.

#### 18.4.6. Dobieranie kart

1. Gracz dobiera kartę i może ją natychmiast zagrać, jeśli jest legalna.
2. Gracz dobiera kartę i może zostawić ją w ręce, jeśli nie chce jej zagrać.
3. Gracz dobiera kartę, która nie pasuje; karta zostaje w ręce i tura przechodzi dalej.
4. Przy aktywnej karze dobranie oznacza przyjęcie kary i kart z tej kary nie zagrywa się od razu jako odpowiedzi na tę samą karę.

#### 18.4.7. Ruchy wielokartowe

1. Serwer akceptuje ruch 2 kier + 2 kier z drugiej talii.
2. Serwer odrzuca ruch 2 kier + 3 kier.
3. Serwer odrzuca ruch as kier + dama pik.
4. Serwer akceptuje kilka asów i wymaga jednego końcowego wyboru: kolor albo `Bez żądania`.
5. Serwer akceptuje kilka jopków i wymaga jednego końcowego wyboru: wartość 5-10 albo `Bez żądania`.
6. Ostatnia wybrana karta staje się `topCard`.

#### 18.4.8. Makao

1. Gracz zostaje z jedną kartą i powiedział Makao; nie można go złapać.
2. Gracz zostaje z jedną kartą i nie powiedział Makao; przez pierwsze 5 sekund może jeszcze zgłosić Makao.
3. Po 5 sekundach inny gracz może złapać go na braku Makao.
4. Gracz próbuje zagrać wszystkie pozostałe karty bez wcześniejszego Makao; nie kończy gry i dobiera karę.
5. Gracz zagrywa kilka kart i zostaje z jedną; Makao jest wymagane.

#### 18.4.9. Reconnect i host

1. Gracz traci połączenie poza swoją turą; gra może iść dalej zgodnie z ustawieniami pokoju.
2. Gracz traci połączenie, gdy jest celem `draw_penalty`; gra zostaje spauzowana.
3. Gracz traci połączenie, gdy jest celem `suit_request`; gra zostaje spauzowana.
4. Gracz traci połączenie, gdy jest celem `rank_request`; gra zostaje spauzowana.
5. Host wymusza przyjęcie efektu przez gracza offline; akcja wymaga podwójnego potwierdzenia i trafia do `admin_log`.
6. Host nie może podejrzeć kart gracza offline.
7. Host nie może zmienić zasad działania kart w aktywnej partii.

## 19. MVP

Pierwsza wersja powinna zawierać:

- Android jako główny docelowy klient pierwszej wersji;
- możliwość stworzenia webowego prototypu klienta przed przeniesieniem na Androida;
- pokoje prywatne;
- tworzenie pokoju przez hosta;
- zapraszanie linkiem i kodem;
- lista graczy w lobby;
- status „Gotowy” dla każdego gracza;
- start gry tylko przez hosta;
- gra 2-6 osób;
- 1-3 talie;
- automatyczna sugestia liczby talii na podstawie liczby gotowych graczy;
- ręczna zmiana liczby talii przez hosta;
- brak botów;
- brak losowego matchmakingu;
- zawsze 5 kart na start;
- wirtualny krupier po stronie serwera;
- wybór pierwszego gracza przez losowanie albo przez hosta;
- rotacja pierwszego gracza w kolejnych partiach zgodnie z ruchem wskazówek zegara;
- karta startowa zawsze niefunkcyjna;
- ukryte odkładanie funkcyjnych kart startowych na spód talii;
- opcjonalne jokery zastępujące każdą kartę;
- domyślnie brak limitu czasu;
- opcjonalny limit czasu;
- dama na wszystko, wszystko na damę;
- dama nie przebija aktywnej kary w wariancie domyślnym;
- 2 zawsze daje +2 karty;
- 3 zawsze daje +3 karty;
- 4 zawsze pauzuje;
- asy mogą żądać koloru albo zostać zagrane z opcją `Bez żądania`;
- jopki mogą żądać wartości 5-10 albo zostać zagrane z opcją `Bez żądania`;
- król kier zawsze daje +5 kart następnemu graczowi;
- król pik zawsze daje +5 kart poprzedniemu graczowi przy co najmniej 3 osobach;
- król pik przy 2 osobach działa jak król kier;
- król trefl i król karo są niewaleczne;
- zagrywanie wielu kart tej samej wartości;
- kumulowanie kar z 2, 3 i króli;
- sortowanie kart;
- śledzenie każdej karty po stronie serwera;
- przejrzyste logi serwerowe;
- możliwość usuwania logów po potwierdzeniu hasłem;
- przetasowanie stosu po wyczerpaniu kart;
- po przetasowaniu wybór neutralnej, niefunkcyjnej karty stołu;
- ręczne Makao;
- reconnect;
- zapis stanu gry po każdym ruchu;
- powrót gracza do tej samej partii po ponownym połączeniu;
- pauzowanie gry po rozłączeniu aktywnego gracza;
- ręczny system pauzy „Zaraz wracam”;
- możliwość wymuszenia wznowienia przez hosta z podwójnym potwierdzeniem;
- wersjonowanie stanu gry przez `state_version`;
- delta updates przy reconnectcie;
- unikalne ID każdej karty;
- podstawowe narzędzia hosta;
- kończenie gry natychmiast po zagraniu ostatniej karty;
- klasyfikacja miejsc bez remisów, według faktycznej kolejności tur;
- pomijanie graczy bez kart przy kierowaniu kar, pauz i żądań;
- możliwość natychmiastowego zagrania dobranej karty, jeśli jest legalna;
- testy automatyczne scenariuszy granicznych silnika zasad.

## 20. Funkcje po MVP

- iOS;
- konta użytkowników;
- lista znajomych;
- zapisane zestawy zasad;
- historia partii;
- eksport historii ruchów;
- więcej niż 6 graczy;
- skórki kart i stołów;
- obserwatorzy stołu;
- tryb kompaktowy ręki.

## 21. Decyzje doprecyzowane i rzeczy nadal otwarte

### 21.1. Decyzje doprecyzowane

- dama może zostać zagrana na żądanie asa lub waleta;
- dama zagrana na żądanie kończy to żądanie dla kolejnego gracza;
- dama w wariancie domyślnym nie chroni przed aktywną karą;
- dama nigdy nie zmienia koloru i nie tworzy aktywnego żądania;
- as może utworzyć `suit_request` albo zostać zagrany z opcją `Bez żądania`;
- walet może utworzyć `rank_request` tylko dla wartości 5-10 albo zostać zagrany z opcją `Bez żądania`;
- walet nie może żądać kart funkcyjnych, bitewnych, damy, asa, waleta, króla ani jokera;
- po asie albo walecie z opcją `Bez żądania` kolejny gracz gra normalnie według koloru tej karty albo może zagrać damę;
- joker zastępuje każdą kartę, ale po zagraniu musi otrzymać konkretną deklarację;
- joker może być ostatnią kartą, jeśli jego deklaracja tworzy legalny ruch;
- gracz kończy grę natychmiast po legalnym zagraniu ostatniej karty;
- ostatnia karta funkcyjna nie może zmusić gracza, który skończył grę, do dalszej reakcji albo dobrania kart;
- efekty z ostatniej karty trafiają do pierwszego gracza, który nadal ma karty;
- nie ma remisu przy kończeniu gry, liczy się kolejność tur zgodnie z ruchem wskazówek zegara;
- Makao jest wymagane po ruchu, który zostawia gracza z dokładnie jedną kartą, i musi być zgłoszone przed próbą wygrania;
- jeśli gracz zagrywa wszystkie pozostałe karty bez wcześniejszego Makao, nie kończy gry i dobiera karę;
- po zejściu do jednej karty okno na powiedzenie Makao wynosi 5 sekund;
- kara i żądanie nie wynikają stale z karty leżącej na stole, tylko z osobnego `activeEffect`;
- po rozliczeniu kary albo żądania `activeEffect` jest usuwany;
- gracz może przyjąć karę albo pauzę nawet wtedy, gdy ma legalną odpowiedź;
- dobraną kartę można natychmiast zagrać, jeśli jest legalna;
- przy aktywnej karze dobranie oznacza przyjęcie kary i dobranych kart nie zagrywa się od razu jako odpowiedzi na tę samą karę;
- czwórki kumulują pauzę na jednym wskazanym graczu;
- `skipCount` oznacza liczbę własnych tur, które wskazany gracz traci;
- jeden ruch wielokartowy może zawierać tylko jedną wartość kart;
- nie mieszamy różnych wartości w jednym ruchu, np. `2 + 3`, `2 + król`, `as + dama`;
- efekt ruchu wielokartowego jest liczony zbiorczo;
- ostatnia karta wybrana w ruchu wielokartowym staje się `topCard`;
- grupowanie duplikatów kart jest wymagane przy wielu taliach;
- przycisk `Rzuć wszystkie` wybiera legalne egzemplarze z grupy, ale ruch nadal wymaga zatwierdzenia;
- rozłączenie gracza, który musi rozwiązać aktywny efekt, pauzuje grę;
- host może wymusić przyjęcie efektu przez gracza offline tylko po podwójnym potwierdzeniu;
- host nie może podejrzeć kart innych graczy;
- host nie może zmieniać zasad działania kart w aktywnej partii;
- pierwszym klientem może być Android, ale dopuszczalne jest wcześniejsze stworzenie klienta webowego jako prototypu i bazy do przeniesienia.

### 21.2. Rzeczy nadal otwarte

- jak długo serwer przechowuje zakończone gry;
- jak długo przechowywać logi techniczne;
- czy pełne konto użytkownika jest wymagane, czy wystarczy nick i token sesji;
- czy aplikacja ma mieć tryb obserwatora;
- czy host może zmienić zasady między partiami w tym samym pokoju bez potwierdzenia graczy;
- jaki dokładnie stos technologiczny wybrać dla klienta: web first, React Native / Expo albo natywny Android;
- czy wariant z jokerami ma wejść do pierwszego MVP, czy dopiero po stabilnym prototypie bez jokerów.
