import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine } from "../GameEngine.js";
import {
  ACE_JACK_REQUEST_MODES,
  BATTLE_COUNTER_MODES,
  EFFECT_TYPES,
  JACK_REQUEST_MODES,
  JACK_REQUEST_RANK_NON_BATTLE_KING,
  MAKAO_CATCH_WINDOW_MS,
  MAKAO_DECLARE_GRACE_MS,
  QUEEN_REQUEST_MODES,
  QUEEN_VARIANTS
} from "../shared/constants.js";

function card(id, rank, suit = "hearts") {
  return { cardInstanceId: id, rank, suit, deckIndex: 0 };
}

function baseState() {
  return {
    topCard: card("top_7_hearts", "7", "hearts"),
    activeEffect: null,
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2", "p3"],
    hands: {
      p1: [card("p1_4_hearts", "4", "hearts"), card("p1_4_diamonds", "4", "diamonds"), card("p1_8_hearts", "8", "hearts")],
      p2: [card("p2_4_spades", "4", "spades"), card("p2_8_spades", "8", "spades")],
      p3: [card("p3_9_clubs", "9", "clubs")]
    },
    drawPile: [card("draw_5_hearts", "5", "hearts"), card("draw_6_hearts", "6", "hearts")],
    discardPile: [],
    direction: 1,
    skipTurns: {},
    gameOver: false,
    settings: { queenVariant: "defensive_non_functional" }
  };
}

function collectInitializedCards(state) {
  return [
    ...Object.values(state.hands).flat(),
    ...state.drawPile,
    state.topCard
  ].filter(Boolean);
}

test("single 4 lets the next player answer with another 4", () => {
  const state = baseState();

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_4_hearts"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SKIP_TURN);
  assert.equal(state.activeEffect.amount, 1);
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("single 4 automatically skips the next player if they cannot answer", () => {
  const state = baseState();
  state.hands.p2 = [card("p2_8_spades", "8", "spades")];
  state.hands.p3 = [card("p3_4_clubs", "4", "clubs")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_4_hearts"] });
  GameEngine.processAutomaticDraws(state);

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.p2, 0);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
  const addedEvent = state.turnEvents.find(event => event.type === "skip_added");
  assert.equal(addedEvent.playerId, "p2");
  assert.equal(addedEvent.pausedPlayerId, "p2");
  assert.equal(addedEvent.added, 1);
  assert.equal(addedEvent.remaining, 1);
  assert.equal(addedEvent.currentPlayerId, "p2");
  assert.equal(state.turnEvents.at(-1).type, "skip_finished");
  assert.equal(state.turnEvents.at(-1).playerId, "p2");
  assert.equal(state.turnEvents.at(-1).pausedPlayerId, "p2");
  assert.equal(state.turnEvents.at(-1).consumed, 1);
  assert.equal(state.turnEvents.at(-1).remaining, 0);
  assert.equal(state.turnEvents.at(-1).nextPlayerId, "p3");
  assert.equal(state.turnEvents.at(-1).currentPlayerId, "p3");
});

test("multiple 4s store only the skipped turns still waiting after the current skip", () => {
  const state = baseState();
  state.hands.p2 = [card("p2_8_spades", "8", "spades")];
  state.hands.p3 = [card("p3_4_clubs", "4", "clubs")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_4_hearts", "p1_4_diamonds"] });
  GameEngine.processAutomaticDraws(state);

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.p2, 1);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
  assert.equal(state.turnEvents.at(-1).type, "skip_used");
  assert.equal(state.turnEvents.at(-1).pausedPlayerId, "p2");
  assert.equal(state.turnEvents.at(-1).consumed, 1);
  assert.equal(state.turnEvents.at(-1).remaining, 1);
  assert.equal(state.turnEvents.at(-1).nextPlayerId, "p3");
  assert.equal(state.turnEvents.at(-1).currentPlayerId, "p3");
});

test("single multi-card move after four 4s consumes only one stored pause", () => {
  const state = {
    topCard: card("top_7_spades", "7", "spades"),
    activeEffect: null,
    currentPlayerIndex: 0,
    turnOrder: ["p1", "p2"],
    hands: {
      p1: [
        card("p1_4_hearts", "4", "hearts"),
        card("p1_4_diamonds", "4", "diamonds"),
        card("p1_4_clubs", "4", "clubs"),
        card("p1_4_spades", "4", "spades"),
        card("p1_8_clubs", "8", "clubs"),
        card("p1_8_hearts", "8", "hearts"),
        card("p1_8_diamonds", "8", "diamonds"),
        card("p1_9_spades", "9", "spades")
      ],
      p2: [card("p2_9_clubs", "9", "clubs"), card("p2_10_hearts", "10", "hearts")]
    },
    drawPile: [card("draw_5_spades", "5", "spades"), card("draw_6_spades", "6", "spades")],
    discardPile: [],
    direction: 1,
    skipTurns: {},
    gameOver: false,
    settings: { queenVariant: "defensive_non_functional" }
  };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_4_hearts", "p1_4_diamonds", "p1_4_clubs", "p1_4_spades"]
  });
  GameEngine.processAutomaticDraws(state);

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.p2, 3);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_8_clubs", "p1_8_hearts", "p1_8_diamonds"]
  });

  assert.equal(state.skipTurns.p2, 2);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  const skipEvents = state.turnEvents.filter(event => event.type === "skip_used" || event.type === "skip_finished");
  assert.equal(skipEvents.length, 1);
  assert.equal(skipEvents[0].pausedPlayerId, "p2");
  assert.equal(skipEvents[0].remaining, 2);
});

test("answering a 4 stacks the pause onto the next player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.hands.p1 = [card("p1_4_hearts", "4", "hearts"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_4_spades", "4", "spades"), card("p2_8_spades", "8", "spades")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_4_hearts"] });
  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_4_spades"] });
  GameEngine.processAutomaticDraws(state);

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.p1, 1);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
  assert.equal(state.turnEvents.at(-1).type, "skip_used");
  assert.equal(state.turnEvents.at(-1).playerId, "p1");
  assert.equal(state.turnEvents.at(-1).pausedPlayerId, "p1");
  assert.equal(state.turnEvents.at(-1).consumed, 1);
  assert.equal(state.turnEvents.at(-1).remaining, 1);
  assert.equal(state.turnEvents.at(-1).nextPlayerId, "p2");
  assert.equal(state.turnEvents.at(-1).currentPlayerId, "p2");
});

test("advanceTurn consumes stored pauses automatically", () => {
  const state = baseState();
  state.skipTurns.p2 = 1;

  GameEngine.advanceTurn(state);

  assert.equal(state.skipTurns.p2, 0);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
});

test("mixed battle and non-battle kings keep the penalty suit from the battle king", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.hands.p1 = [
    card("p1_king_hearts", "king", "hearts"),
    card("p1_king_clubs", "king", "clubs"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_king_hearts", "p1_king_clubs"]
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.topCard.cardInstanceId, "p1_king_clubs");
});

test("king clubs and king diamonds do not create a battle penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_hearts", "king", "hearts");
  state.hands.p1 = [
    card("p1_king_clubs", "king", "clubs"),
    card("p1_king_diamonds", "king", "diamonds"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_king_clubs", "p1_king_diamonds"]
  });

  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_king_diamonds");
  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("remaining stacked pause does not skip a player who must answer a new draw penalty", () => {
  const state = baseState();
  state.turnOrder = ["basia", "midzio"];
  state.currentPlayerIndex = 0;
  state.hands = {
    basia: [card("basia_king_hearts", "king", "hearts"), card("basia_8_hearts", "8", "hearts")],
    midzio: [card("midzio_9_clubs", "9", "clubs")]
  };
  state.skipTurns = { midzio: 1 };

  GameEngine.processPlayCards(state, "basia", {
    cardIds: ["basia_king_hearts"]
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.targetPlayerId, "midzio");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "midzio");
  assert.equal(state.skipTurns.midzio, 1);
});

test("battle king penalty can be answered by 2 or 3 in the battle suit", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands.p1 = [card("p1_king_spades", "king", "spades"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_3_spades", "3", "spades"), card("p2_9_clubs", "9", "clubs")];
  state.settings.kingPenaltyUnblockable = true; // legacy room setting should not make kings unblockable

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_spades"] });
  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_3_spades"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 8);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.topCard.cardInstanceId, "p2_3_spades");
});

test("active draw penalty accepts 3 on 3 in the battle suit and sums the penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_clubs", "3", "clubs");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "clubs",
    direction: "next",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_3_clubs", "3", "clubs"), card("p1_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_3_clubs"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 6);
  assert.equal(state.activeEffect.battleSuit, "clubs");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.topCard.cardInstanceId, "p1_3_clubs");
});

test("active draw penalty accepts 2 on 3 in the battle suit and sums to five", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_clubs", "3", "clubs");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "clubs",
    direction: "next",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_2_clubs", "2", "clubs"), card("p1_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_2_clubs"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "clubs");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.topCard.cardInstanceId, "p1_2_clubs");
});

test("active draw penalty accepts 3 on 3 outside the battle suit by default", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_spades", "3", "spades");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "spades",
    direction: "next",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_3_diamonds", "3", "diamonds"), card("p1_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_3_diamonds"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 6);
  assert.equal(state.activeEffect.battleSuit, "diamonds");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.topCard.cardInstanceId, "p1_3_diamonds");
});

test("king hearts battle can be answered by 2 hearts and keeps forward target", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands.p1 = [card("p1_king_hearts", "king", "hearts"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_2_hearts", "2", "hearts"), card("p2_9_clubs", "9", "clubs")];
  state.hands.p3 = [card("p3_9_spades", "9", "spades")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_hearts"] });
  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_2_hearts"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 7);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p3");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
});

test("active draw penalty accepts same-rank 2 or 3 outside the battle suit by default", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_2_spades", "2", "spades"), card("p1_9_clubs", "9", "clubs")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_2_spades"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 4);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.topCard.cardInstanceId, "p1_2_spades");
});

test("strict battle variant rejects same-rank 2 or 3 outside the battle suit", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.settings.battleCounterMode = BATTLE_COUNTER_MODES.SUIT_ONLY;
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_2_spades", "2", "spades"), card("p1_9_clubs", "9", "clubs")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_2_spades"] }),
    /current top card/
  );

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 2);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.topCard.cardInstanceId, "top_2_hearts");
});

test("strict battle variant rejects mixed-suit same-rank battle batches", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.settings.battleCounterMode = BATTLE_COUNTER_MODES.SUIT_ONLY;
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [
    card("p1_2_hearts", "2", "hearts"),
    card("p1_2_spades", "2", "spades"),
    card("p1_9_clubs", "9", "clubs")
  ];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_2_hearts", "p1_2_spades"] }),
    /active penalty rules/
  );
});

test("only the active draw-penalty target can counter the battle", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    direction: "next",
    targetPlayerId: "p1"
  };
  state.hands.p2 = [card("p2_3_hearts", "3", "hearts"), card("p2_9_clubs", "9", "clubs")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_3_hearts"] }),
    /another player/
  );
  assert.equal(state.activeEffect.amount, 2);
  assert.equal(state.topCard.cardInstanceId, "top_2_hearts");
});

test("only the active draw-penalty target can accept the battle", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    direction: "next",
    targetPlayerId: "p1"
  };
  state.drawPile = [card("draw_a", "5", "clubs"), card("draw_b", "6", "clubs")];
  const beforeHandCount = state.hands.p2.length;

  assert.throws(
    () => GameEngine.processAcceptPenalty(state, "p2"),
    /another player/
  );
  assert.equal(state.activeEffect.amount, 2);
  assert.equal(state.hands.p2.length, beforeHandCount);
});

test("active draw penalty accepts same-suit same-rank battle batches and sums the penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    direction: "next",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [
    card("p1_2_hearts_a", "2", "hearts"),
    card("p1_2_hearts_b", "2", "hearts"),
    card("p1_9_clubs", "9", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_2_hearts_a", "p1_2_hearts_b"]
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 6);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.topCard.cardInstanceId, "p1_2_hearts_b");
});

test("multiple battle kings of the same attack suit create one summed penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_hearts", "king", "hearts");
  state.hands.p1 = [
    card("p1_king_hearts_a", "king", "hearts"),
    card("p1_king_hearts_b", "king", "hearts"),
    card("p1_8_clubs", "8", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_king_hearts_a", "p1_king_hearts_b"]
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 10);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.topCard.cardInstanceId, "p1_king_hearts_b");
});

test("king spades targets previous player without reversing normal turn direction", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3", "p4"];
  state.currentPlayerIndex = 2;
  state.direction = 1;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands = {
    p1: [card("p1_9_clubs", "9", "clubs")],
    p2: [card("p2_3_spades", "3", "spades")],
    p3: [card("p3_king_spades", "king", "spades"), card("p3_8_hearts", "8", "hearts")],
    p4: [card("p4_9_hearts", "9", "hearts")]
  };

  GameEngine.processPlayCards(state, "p3", { cardIds: ["p3_king_spades"] });

  assert.equal(state.direction, 1);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.direction, "previous");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("king hearts can answer a king spades battle by rank in default counter mode", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3", "p4"];
  state.currentPlayerIndex = 2;
  state.direction = 1;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands = {
    p1: [card("p1_9_clubs", "9", "clubs")],
    p2: [card("p2_king_hearts", "king", "hearts"), card("p2_8_spades", "8", "spades")],
    p3: [card("p3_king_spades", "king", "spades"), card("p3_8_hearts", "8", "hearts")],
    p4: [card("p4_9_hearts", "9", "hearts")]
  };

  GameEngine.processPlayCards(state, "p3", { cardIds: ["p3_king_spades"] });
  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_king_hearts"] });

  assert.equal(state.activeEffect.amount, 10);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p3");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
});

test("king hearts can answer king spades plus king clubs batch by rank", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.direction = 1;
  state.topCard = card("top_7_spades", "7", "spades");
  state.hands.p1 = [
    card("p1_king_spades", "king", "spades"),
    card("p1_king_clubs", "king", "clubs"),
    card("p1_8_hearts", "8", "hearts")
  ];
  state.hands.p2 = [
    card("p2_king_hearts", "king", "hearts"),
    card("p2_8_spades", "8", "spades")
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_spades", "p1_king_clubs"] });

  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.topCard.cardInstanceId, "p1_king_clubs");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_king_hearts"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 10);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.topCard.cardInstanceId, "p2_king_hearts");
});

test("strict battle variant rejects opposite-suit king counter by rank", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_spades", "7", "spades");
  state.settings.battleCounterMode = BATTLE_COUNTER_MODES.SUIT_ONLY;
  state.hands.p1 = [
    card("p1_king_spades", "king", "spades"),
    card("p1_king_clubs", "king", "clubs")
  ];
  state.hands.p2 = [
    card("p2_king_hearts", "king", "hearts"),
    card("p2_8_spades", "8", "spades")
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_spades", "p1_king_clubs"] });

  assert.throws(
    () => GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_king_hearts"] }),
    /current top card/
  );
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("king spades targets the opponent in a two-player game", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands.p1 = [card("p1_king_spades", "king", "spades"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_3_spades", "3", "spades"), card("p2_9_clubs", "9", "clubs")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_spades"] });

  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("queen is neutral: it can be played on anything and anything can be played on it", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_queen_spades", "queen", "spades"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs"), card("p2_10_diamonds", "10", "diamonds")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_spades"] });
  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_queen_spades");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_9_clubs"] });
  assert.equal(state.topCard.cardInstanceId, "p2_9_clubs");
  assert.equal(state.activeEffect, null);
});

test("queen cancels an ace suit request and leaves the next player playing on queen", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_diamonds", "ace", "diamonds");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    requesterPlayerId: "p2",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_queen_clubs", "queen", "clubs"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_9_hearts", "9", "hearts"), card("p2_10_diamonds", "10", "diamonds")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_clubs"] });
  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_queen_clubs");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_9_hearts"] });
  assert.equal(state.topCard.cardInstanceId, "p2_9_hearts");
});

test("ace suit request allows an off-suit ace to change the requested suit", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [
    card("p1_ace_hearts", "ace", "hearts"),
    card("p1_8_clubs", "8", "clubs")
  ];
  state.hands.p2 = [card("p2_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_ace_hearts"],
    suitRequest: "clubs"
  });

  assert.equal(state.topCard.cardInstanceId, "p1_ace_hearts");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "clubs");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("ace suit request rejects top-suit cards outside the requested suit", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_8_spades", "8", "spades")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] }),
    /Selected cards cannot be played/
  );
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.topCard.cardInstanceId, "top_ace_hearts");
});

test("ace suit request advances after requested suit and clears when requester answers", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    requesterPlayerId: "p1",
    targetPlayerId: "p2"
  };
  state.hands.p1 = [card("p1_10_spades", "10", "spades")];
  state.hands.p2 = [card("p2_8_spades", "8", "spades"), card("p2_8_hearts", "8", "hearts")];
  state.hands.p3 = [card("p3_9_spades", "9", "spades")];

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_8_spades"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p3");
  assert.equal(state.topCard.cardInstanceId, "p2_8_spades");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");

  GameEngine.processPlayCards(state, "p3", { cardIds: ["p3_9_spades"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.topCard.cardInstanceId, "p3_9_spades");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_10_spades"] });

  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_10_spades");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("ace suit request remains active after a two-player draw pass returns to the requester", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [
    card("p1_ace_hearts", "ace", "hearts"),
    card("p1_ace_clubs", "ace", "clubs"),
    card("p1_10_hearts", "10", "hearts"),
    card("p1_9_hearts", "9", "hearts")
  ];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.drawPile = [card("draw_p2_8_spades", "8", "spades")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_ace_hearts", "p1_ace_clubs"],
    suitRequest: "hearts"
  });

  assert.equal(state.topCard.cardInstanceId, "p1_ace_clubs");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "hearts");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");

  GameEngine.processDrawCard(state, "p2");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "hearts");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.topCard.cardInstanceId, "p1_ace_clubs");

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_10_hearts"]
  });

  assert.equal(state.topCard.cardInstanceId, "p1_10_hearts");
  assert.equal(state.activeEffect, null);
});

test("queen cancels a jack rank request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_diamonds", "jack", "diamonds");
  state.activeEffect = {
    type: EFFECT_TYPES.RANK_REQUEST,
    requestedRank: "10",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_queen_diamonds", "queen", "diamonds"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_diamonds"] });

  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_queen_diamonds");
});

test("queen cannot cancel active ace or jack requests when the room variant blocks it", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_diamonds", "ace", "diamonds");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "p1"
  };
  state.settings.queenRequestMode = QUEEN_REQUEST_MODES.BLOCKED_BY_REQUEST;
  state.hands.p1 = [card("p1_queen_clubs", "queen", "clubs"), card("p1_8_spades", "8", "spades")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_clubs"] }),
    /current top card/
  );

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_spades"] });
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.requesterPlayerId, "p2");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("default queen cannot answer an active draw penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_queen_hearts", "queen", "hearts"), card("p1_8_hearts", "8", "hearts")];
  state.settings.queenVariant = QUEEN_VARIANTS.DEFENSIVE_NON_FUNCTIONAL;

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_hearts"] }),
    /current top card/
  );
});

test("warsaw queen hearts or spades cancels an active draw penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_hearts", "3", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_queen_hearts", "queen", "hearts"), card("p1_8_hearts", "8", "hearts")];
  state.settings.queenVariant = QUEEN_VARIANTS.WARSAW_PARDON;

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_hearts"] });

  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_queen_hearts");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("warsaw queen diamonds or clubs cannot cancel an active draw penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_spades", "3", "spades");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "spades",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_queen_diamonds", "queen", "diamonds"), card("p1_8_hearts", "8", "hearts")];
  state.settings.queenVariant = QUEEN_VARIANTS.WARSAW_PARDON;

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_diamonds"] }),
    /current top card/
  );
});

test("warsaw queen does not cancel an active 4 pause", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_4_clubs", "4", "clubs");
  state.activeEffect = {
    type: EFFECT_TYPES.SKIP_TURN,
    amount: 1,
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_queen_hearts", "queen", "hearts"), card("p1_8_hearts", "8", "hearts")];
  state.settings.queenVariant = QUEEN_VARIANTS.WARSAW_PARDON;

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_queen_hearts"] }),
    /current top card/
  );
});

test("player can declare Makao after playing down to one card", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_hearts", "9", "hearts")];
  const beforePlay = Date.now();

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });
  assert.equal(state.makao.p1.declared, false);
  assert.ok(state.makao.p1.declareUntil >= beforePlay + MAKAO_DECLARE_GRACE_MS);
  assert.equal(state.makao.p1.canBeCaughtAt, state.makao.p1.declareUntil);
  assert.equal(state.makao.p1.catchUntil, state.makao.p1.declareUntil + MAKAO_CATCH_WINDOW_MS);

  GameEngine.processDeclareMakao(state, "p1");

  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.makao.p1.declared, true);
});

test("player can arm Makao before playing the last two or more cards", () => {
  const state = baseState();
  state.topCard = card("top_8_clubs", "8", "clubs");
  state.hands.p1 = [
    card("p1_8_hearts", "8", "hearts"),
    card("p1_8_diamonds", "8", "diamonds")
  ];

  GameEngine.processDeclareMakao(state, "p1");

  assert.equal(state.makao.p1.armed, true);
  assert.equal(GameEngine.hasDeclaredMakao(state, "p1"), true);

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_8_hearts", "p1_8_diamonds"]
  });

  assert.equal(state.hands.p1.length, 0);
  assert.equal(state.finishedPlayers.at(-1).playerId, "p1");
  assert.equal(state.turnEvents.some(event => event.type === "makao_finish_penalty"), false);
});

test("player cannot arm Makao before their turn", () => {
  const state = baseState();
  state.currentPlayerIndex = 1;
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_diamonds", "9", "diamonds")];

  assert.throws(
    () => GameEngine.processDeclareMakao(state, "p1"),
    /only on your turn/
  );
});

test("player with one card and no Makao can be caught after declaration grace", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_hearts", "9", "hearts")];
  state.drawPile = [
    card("draw_a", "5", "clubs"),
    card("draw_b", "6", "clubs"),
    card("draw_c", "7", "clubs"),
    card("draw_d", "8", "clubs"),
    card("draw_e", "9", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });
  assert.equal(state.makao.p1.declared, false);

  state.makao.p1.canBeCaughtAt = Date.now() - 1;
  GameEngine.processCatchMakao(state, "p2", "p1");

  assert.equal(state.hands.p1.length, 6);
  assert.equal(state.makao.p1, undefined);
  assert.equal(state.turnEvents.at(-1).type, "makao_caught");
});

test("Makao cannot be caught during the declaration grace window", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  assert.throws(
    () => GameEngine.processCatchMakao(state, "p2", "p1"),
    /window is not open/
  );
});

test("player can declare missing Makao during the grace window", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.makao.p1.declared, false);
  GameEngine.processDeclareMakao(state, "p1");
  assert.equal(state.makao.p1.declared, true);
  assert.equal(state.turnEvents.at(-1).type, "makao_declared");
});

test("player cannot declare missing Makao after the grace window expires", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_hearts", "9", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  state.makao.p1.declareUntil = Date.now() - 1;
  state.makao.p1.canBeCaughtAt = Date.now() - 1;
  assert.throws(
    () => GameEngine.processDeclareMakao(state, "p1"),
    /window has expired/
  );
});

test("expired missing Makao catch window becomes safe when the turn returns", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts"), card("p1_9_hearts", "9", "hearts")];
  state.hands.p2 = [card("p2_8_spades", "8", "spades"), card("p2_7_clubs", "7", "clubs")];
  state.drawPile = [
    card("draw_a", "5", "clubs"),
    card("draw_b", "6", "clubs"),
    card("draw_c", "7", "clubs"),
    card("draw_d", "8", "clubs"),
    card("draw_e", "9", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });
  state.makao.p1.canBeCaughtAt = Date.now() - 1;
  state.makao.p1.catchUntil = Date.now() - 1;
  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_8_spades"] });

  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.makao.p1.declared, true);
  assert.equal(state.makao.p1.autoSafeAfterCatchWindow, true);
  assert.equal(state.turnEvents.at(-1).type, "makao_uncaught");
});

test("player with declared Makao can play the last card and finish", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  assert.equal(state.finishedPlayers.at(-1).playerId, "p1");
  assert.equal(state.turnOrder.includes("p1"), false);
});

test("removing a player who finished preserves the next current player", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.hands.p3 = [card("p3_10_clubs", "10", "clubs")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last battle card in a two-player game ends the game and clears active penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_hearts", "3", "hearts");
  state.hands.p1 = [card("p1_3_spades", "3", "spades")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_3_spades"] });

  assert.equal(state.gameOver, true);
  assert.equal(state.winnerId, "p1");
  assert.equal(state.activeEffect, null);
  assert.deepEqual(state.turnOrder, ["p2"]);
  assert.equal(state.turnEvents.at(-1).type, "game_over");
});

test("actions are rejected after game over", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  assert.throws(
    () => GameEngine.processDrawCard(state, "p2"),
    /already over/
  );
});

test("last-card 4 removes the winner and preserves the player after the skipped target", () => {
  const state = baseState();
  state.hands.p1 = [card("p1_4_hearts", "4", "hearts")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.hands.p3 = [card("p3_10_clubs", "10", "clubs")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_4_hearts"] });
  GameEngine.processAutomaticDraws(state);

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.skipTurns.p2, 0);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
});

test("multiple same-rank cards can be submitted in either selected order", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_5_diamonds", "5", "diamonds");
  state.hands.p1 = [
    card("p1_king_clubs", "king", "clubs"),
    card("p1_king_diamonds", "king", "diamonds"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_king_clubs", "p1_king_diamonds"]
  });

  assert.equal(state.topCard.cardInstanceId, "p1_king_clubs");
  assert.equal(state.hands.p1.length, 1);
});

test("after drawing a playable card, player may add same-rank cards from hand", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_9_clubs", "9", "clubs");
  state.hands.p1 = [
    card("p1_10_diamonds", "10", "diamonds"),
    card("p1_10_clubs_drawn", "10", "clubs"),
    card("p1_8_hearts", "8", "hearts")
  ];
  state.hasDrawnCardThisTurn = true;
  state.drawnCardInstanceId = "p1_10_clubs_drawn";

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_10_clubs_drawn", "p1_10_diamonds"]
  });

  assert.equal(state.topCard.cardInstanceId, "p1_10_diamonds");
  assert.deepEqual(state.hands.p1.map(c => c.cardInstanceId), ["p1_8_hearts"]);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
});

test("after drawing, same-rank hand cards still require the drawn card", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_9_clubs", "9", "clubs");
  state.hands.p1 = [
    card("p1_10_diamonds", "10", "diamonds"),
    card("p1_10_clubs_drawn", "10", "clubs"),
    card("p1_8_hearts", "8", "hearts")
  ];
  state.hasDrawnCardThisTurn = true;
  state.drawnCardInstanceId = "p1_10_clubs_drawn";

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_10_diamonds"] }),
    /just drawn/
  );
});

test("after drawing, the drawn card can be submitted after same-rank hand cards", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_9_clubs", "9", "clubs");
  state.hands.p1 = [
    card("p1_10_diamonds", "10", "diamonds"),
    card("p1_10_clubs_drawn", "10", "clubs"),
    card("p1_8_hearts", "8", "hearts")
  ];
  state.hasDrawnCardThisTurn = true;
  state.drawnCardInstanceId = "p1_10_clubs_drawn";

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_10_diamonds", "p1_10_clubs_drawn"] });

  assert.equal(state.topCard.cardInstanceId, "p1_10_diamonds");
  assert.deepEqual(state.hands.p1.map(c => c.cardInstanceId), ["p1_8_hearts"]);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
});

test("drawing is not a valid response to an active 4 pause", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_4_hearts", "4", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SKIP_TURN,
    amount: 1,
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_4_spades", "4", "spades"), card("p1_9_clubs", "9", "clubs")];

  assert.throws(
    () => GameEngine.processDrawCard(state, "p1"),
    /pause/
  );
});

test("only the active skip target can accept a 4 pause", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_4_hearts", "4", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SKIP_TURN,
    amount: 1,
    targetPlayerId: "p1"
  };

  assert.throws(
    () => GameEngine.processAcceptSkip(state, "p2"),
    /another player/
  );
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SKIP_TURN);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("player may accept an active 4 pause even when holding another 4", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_4_hearts", "4", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SKIP_TURN,
    amount: 1,
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_4_spades", "4", "spades"), card("p1_9_clubs", "9", "clubs")];

  GameEngine.processAcceptSkip(state, "p1");

  assert.equal(state.activeEffect, null);
  assert.equal(state.skipTurns.p1, undefined);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
  assert.equal(state.turnEvents.at(-1).type, "skip_accepted");
  assert.equal(state.turnEvents.at(-1).playerId, "p1");
  assert.equal(state.turnEvents.at(-1).pausedPlayerId, "p1");
  assert.equal(state.turnEvents.at(-1).consumed, 1);
  assert.equal(state.turnEvents.at(-1).remaining, 0);
  assert.equal(state.turnEvents.at(-1).nextPlayerId, "p2");
  assert.equal(state.turnEvents.at(-1).currentPlayerId, "p2");
});

test("drawing during an ace suit request lets a matching drawn card answer it", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "p1",
    requesterPlayerId: "p2",
    sourceCardId: "top_ace_hearts"
  };
  state.hands.p1 = [card("p1_9_clubs", "9", "clubs")];
  state.drawPile = [card("draw_matching_spades", "8", "spades")];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.drawnCardInstanceId, "draw_matching_spades");
  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["draw_matching_spades"] });

  assert.equal(state.topCard.cardInstanceId, "draw_matching_spades");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("drawn ace can replace an active suit request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "p1",
    requesterPlayerId: "p2",
    sourceCardId: "top_ace_hearts"
  };
  state.hands.p1 = [card("p1_9_clubs", "9", "clubs")];
  state.drawPile = [card("draw_ace_hearts", "ace", "hearts")];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.drawnCardInstanceId, "draw_ace_hearts");
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p1");

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["draw_ace_hearts"],
    suitRequest: "clubs"
  });

  assert.equal(state.topCard.cardInstanceId, "draw_ace_hearts");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "clubs");
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("ace suit request continues around the table after draw passes", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_ace_hearts", "ace", "hearts"), card("p1_9_clubs", "9", "clubs")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.hands.p3 = [card("p3_9_clubs", "9", "clubs")];
  state.drawPile = [
    card("draw_p3_6_diamonds", "6", "diamonds"),
    card("draw_p2_5_clubs", "5", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_ace_hearts"],
    suitRequest: "spades"
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");

  GameEngine.processDrawCard(state, "p2");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p3");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");
  assert.equal(state.hands.p2.length, 2);

  GameEngine.processDrawCard(state, "p3");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.hands.p3.length, 2);
});

test("only the active request target can pass it by drawing", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "spades",
    targetPlayerId: "p1",
    sourceCardId: "top_ace_hearts"
  };
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.drawPile = [card("draw_matching_spades", "8", "spades")];

  assert.throws(
    () => GameEngine.processDrawCard(state, "p2"),
    /another player/
  );
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.hands.p2.length, 1);
});

test("drawing during a jack rank request lets a matching drawn card answer it", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.RANK_REQUEST,
    requestedRank: "10",
    targetPlayerId: "p1",
    requesterPlayerId: "p2",
    sourceCardId: "top_jack_hearts"
  };
  state.hands.p1 = [card("p1_9_clubs", "9", "clubs")];
  state.drawPile = [card("draw_matching_10_spades", "10", "spades")];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "10");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.drawnCardInstanceId, "draw_matching_10_spades");
  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["draw_matching_10_spades"] });

  assert.equal(state.topCard.cardInstanceId, "draw_matching_10_spades");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "10");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("drawn jack can replace an active rank request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.RANK_REQUEST,
    requestedRank: "10",
    targetPlayerId: "p1",
    requesterPlayerId: "p2",
    sourceCardId: "top_jack_hearts"
  };
  state.hands.p1 = [card("p1_9_clubs", "9", "clubs")];
  state.drawPile = [card("draw_jack_clubs", "jack", "clubs")];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.drawnCardInstanceId, "draw_jack_clubs");
  assert.equal(state.activeEffect.requestedRank, "10");
  assert.equal(state.activeEffect.targetPlayerId, "p1");

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["draw_jack_clubs"],
    rankRequest: "5"
  });

  assert.equal(state.topCard.cardInstanceId, "draw_jack_clubs");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "5");
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("jack rank request continues around the table after draw passes", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_jack_hearts", "jack", "hearts"), card("p1_9_clubs", "9", "clubs")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.hands.p3 = [card("p3_9_clubs", "9", "clubs")];
  state.drawPile = [
    card("draw_p3_6_diamonds", "6", "diamonds"),
    card("draw_p2_5_clubs", "5", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_jack_hearts"],
    rankRequest: "10"
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");

  GameEngine.processDrawCard(state, "p2");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p3");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p3");

  GameEngine.processDrawCard(state, "p3");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
});

test("drawing from pile during draw penalty takes cards one by one and only the first can counter", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_hearts", "3", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_9_spades", "9", "spades")];
  state.drawPile = [
    card("draw_third", "6", "clubs"),
    card("draw_second_answer_too_late", "3", "hearts"),
    card("draw_first", "9", "diamonds")
  ];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.penaltyDrawnCount, 1);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.turnEvents.at(-1).type, "penalty_draw_progress");

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hands.p1.length, 3);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.penaltyDrawnCount, 2);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["draw_second_answer_too_late"] }),
    /Penalty is being accepted/
  );

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hands.p1.length, 4);
  assert.equal(state.activeEffect, null);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
  assert.equal(state.turnEvents.at(-1).type, "penalty_accepted");
  assert.equal(state.turnEvents.at(-1).drawnCount, 3);
});

test("drawing from pile during draw penalty lets a matching drawn card counter", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_9_spades", "9", "spades")];
  state.drawPile = [
    card("draw_later_a", "5", "clubs"),
    card("draw_first_answer", "3", "hearts")
  ];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.drawnCardInstanceId, "draw_first_answer");
  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 2);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.turnEvents.at(-1).type, "penalty_draw_counter");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["draw_first_answer"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("drawing again after a playable first penalty card declines the counter window", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_9_spades", "9", "spades")];
  state.drawPile = [
    card("draw_third", "5", "clubs"),
    card("draw_second", "6", "clubs"),
    card("draw_first_answer", "3", "hearts")
  ];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.drawnCardInstanceId, "draw_first_answer");
  assert.equal(state.activeEffect.penaltyDrawnCount, 1);

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.penaltyDrawnCount, 2);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["draw_first_answer"] }),
    /Penalty is being accepted/
  );

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.activeEffect, null);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("drawing from pile during +3 lets a drawn 3 of another suit counter by rank", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_spades", "3", "spades");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "spades",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_9_clubs", "9", "clubs")];
  state.drawPile = [
    card("draw_remaining_a", "5", "clubs"),
    card("draw_remaining_b", "6", "clubs"),
    card("draw_first_answer", "3", "diamonds")
  ];

  GameEngine.processDrawCard(state, "p1");

  assert.equal(state.hands.p1.length, 2);
  assert.equal(state.drawnCardInstanceId, "draw_first_answer");
  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 3);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.turnEvents.at(-1).type, "penalty_draw_counter");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["draw_first_answer"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 6);
  assert.equal(state.activeEffect.battleSuit, "diamonds");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("accepting penalty after drawing a counter only draws the remaining cards", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_9_spades", "9", "spades")];
  state.drawPile = [
    card("draw_remaining", "5", "clubs"),
    card("draw_first_answer", "3", "hearts")
  ];

  GameEngine.processDrawCard(state, "p1");
  GameEngine.processAcceptPenalty(state, "p1");

  assert.equal(state.hands.p1.length, 3);
  assert.equal(state.activeEffect, null);
  assert.equal(state.hasDrawnCardThisTurn, false);
  assert.equal(state.drawnCardInstanceId, null);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
  assert.equal(state.turnEvents.at(-1).type, "penalty_accepted");
  assert.equal(state.turnEvents.at(-1).amount, 2);
});

test("player can declare Makao after a multi-card play down to one card", () => {
  const state = baseState();
  state.hands.p1 = [
    card("p1_8_hearts", "8", "hearts"),
    card("p1_8_diamonds", "8", "diamonds"),
    card("p1_9_clubs", "9", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts", "p1_8_diamonds"] });
  assert.equal(state.makao.p1.declared, false);

  GameEngine.processDeclareMakao(state, "p1");

  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.makao.p1.declared, true);
});

test("player who tries to finish without Makao does not win and draws penalty cards", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [
    { cardInstanceId: "p1_joker", rank: "joker", deckIndex: 0 },
    card("p1_8_clubs", "8", "clubs")
  ];

  const payload = {
    cardIds: ["p1_joker", "p1_8_clubs"],
    jokerDeclarations: {
      p1_joker: { rank: "8", suit: "hearts" }
    }
  };

  state.drawPile = [
    card("draw_a", "5", "clubs"),
    card("draw_b", "6", "clubs"),
    card("draw_c", "7", "clubs"),
    card("draw_d", "8", "clubs"),
    card("draw_e", "9", "clubs")
  ];

  GameEngine.processPlayCards(state, "p1", payload);

  assert.equal(state.gameOver, false);
  assert.equal(state.finishedPlayers?.length || 0, 0);
  assert.equal(state.hands.p1.length, 5);
  assert.equal(state.turnOrder.includes("p1"), true);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
  assert.equal(state.turnEvents.at(-1).type, "makao_finish_penalty");
  assert.equal(state.turnEvents.at(-1).amount, 5);
});

test("player without Makao cannot finish with functional last cards", () => {
  const scenarios = [
    {
      id: "four",
      top: card("top_4_clubs", "4", "clubs"),
      handCard: card("p1_last_4_spades", "4", "spades"),
      payload: { cardIds: ["p1_last_4_spades"] }
    },
    {
      id: "ace_request",
      top: card("top_ace_clubs", "ace", "clubs"),
      handCard: card("p1_last_ace_hearts", "ace", "hearts"),
      payload: { cardIds: ["p1_last_ace_hearts"], suitRequest: "spades" }
    },
    {
      id: "jack_request",
      top: card("top_jack_clubs", "jack", "clubs"),
      handCard: card("p1_last_jack_hearts", "jack", "hearts"),
      payload: { cardIds: ["p1_last_jack_hearts"], rankRequest: "10" }
    },
    {
      id: "battle_2",
      top: card("top_7_hearts_for_2", "7", "hearts"),
      handCard: card("p1_last_2_hearts", "2", "hearts"),
      payload: { cardIds: ["p1_last_2_hearts"] }
    },
    {
      id: "battle_3",
      top: card("top_7_hearts_for_3", "7", "hearts"),
      handCard: card("p1_last_3_hearts", "3", "hearts"),
      payload: { cardIds: ["p1_last_3_hearts"] }
    },
    {
      id: "king_hearts",
      top: card("top_king_clubs", "king", "clubs"),
      handCard: card("p1_last_king_hearts", "king", "hearts"),
      payload: { cardIds: ["p1_last_king_hearts"] }
    },
    {
      id: "queen",
      top: card("top_queen_clubs", "queen", "clubs"),
      handCard: card("p1_last_queen_hearts", "queen", "hearts"),
      payload: { cardIds: ["p1_last_queen_hearts"] }
    },
    {
      id: "joker_as_4",
      top: card("top_7_hearts_for_joker", "7", "hearts"),
      handCard: { cardInstanceId: "p1_last_joker", rank: "joker", deckIndex: 0 },
      payload: {
        cardIds: ["p1_last_joker"],
        jokerDeclarations: {
          p1_last_joker: { rank: "4", suit: "hearts" }
        }
      }
    }
  ];

  for (const scenario of scenarios) {
    const state = baseState();
    state.turnOrder = ["p1", "p2", "p3"];
    state.currentPlayerIndex = 0;
    state.topCard = scenario.top;
    state.hands.p1 = [scenario.handCard];
    state.hands.p2 = [card(`${scenario.id}_p2_8_clubs`, "8", "clubs")];
    state.hands.p3 = [card(`${scenario.id}_p3_9_diamonds`, "9", "diamonds")];
    state.drawPile = [
      card(`${scenario.id}_draw_1`, "5", "clubs"),
      card(`${scenario.id}_draw_2`, "6", "clubs"),
      card(`${scenario.id}_draw_3`, "7", "clubs"),
      card(`${scenario.id}_draw_4`, "8", "clubs"),
      card(`${scenario.id}_draw_5`, "9", "clubs")
    ];
    state.makao = {};

    GameEngine.processPlayCards(state, "p1", scenario.payload);

    assert.equal(state.gameOver, false, scenario.id);
    assert.equal(state.finishedPlayers?.length || 0, 0, scenario.id);
    assert.equal(state.hands.p1.length, 5, scenario.id);
    assert.equal(state.turnOrder.includes("p1"), true, scenario.id);
    assert.equal(state.turnOrder[state.currentPlayerIndex], "p2", scenario.id);
    assert.equal(state.topCard.cardInstanceId, scenario.handCard.cardInstanceId, scenario.id);
    assert.equal(state.turnEvents.at(-1).type, "makao_finish_penalty", scenario.id);
    assert.equal(state.turnEvents.at(-1).playerId, "p1", scenario.id);
    assert.equal(state.turnEvents.at(-1).amount, 5, scenario.id);
  }
});

test("player can declare Makao after drawing a playable card that can be combined down to one", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_10_clubs", "10", "clubs");
  state.hands.p1 = [
    card("p1_10_diamonds", "10", "diamonds"),
    card("p1_9_hearts", "9", "hearts"),
    card("drawn_10_clubs", "10", "clubs")
  ];
  state.hasDrawnCardThisTurn = true;
  state.drawnCardInstanceId = "drawn_10_clubs";

  GameEngine.processPlayCards(state, "p1", { cardIds: ["drawn_10_clubs", "p1_10_diamonds"] });
  assert.equal(state.makao.p1.declared, false);

  GameEngine.processDeclareMakao(state, "p1");

  assert.equal(state.hands.p1.length, 1);
  assert.equal(state.makao.p1.declared, true);
});

test("automatic draw advances a normal turn when player has no legal card and draw misses", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_clubs", "7", "clubs");
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_7_hearts", "7", "hearts")];
  state.drawPile = [card("draw_miss", "9", "diamonds")];

  GameEngine.processAutomaticDraws(state);

  assert.deepEqual(state.hands.p1.map(c => c.cardInstanceId), ["p1_8_hearts", "draw_miss"]);
  assert.equal(state.hasDrawnCardThisTurn, undefined);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
  assert.equal(state.turnEvents.at(-1).type, "auto_draw_pass");
});

test("automatic draw stops on current player when drawn card can be played", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_clubs", "7", "clubs");
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.drawPile = [card("draw_hit", "9", "clubs")];

  GameEngine.processAutomaticDraws(state);

  assert.equal(state.drawnCardInstanceId, "draw_hit");
  assert.equal(state.hasDrawnCardThisTurn, true);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
  assert.equal(state.turnEvents.at(-1).type, "auto_draw_playable");
});

test("automatic draw does not run during active effects", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_clubs", "ace", "clubs");
  state.activeEffect = {
    type: EFFECT_TYPES.SUIT_REQUEST,
    requestedSuit: "clubs",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.drawPile = [card("draw_hit", "9", "clubs")];

  GameEngine.processAutomaticDraws(state);

  assert.deepEqual(state.hands.p1.map(c => c.cardInstanceId), ["p1_8_hearts"]);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
});

test("real player action clears stale turn events", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.turnEvents = [
    { id: "old", type: "skip_finished", playerId: "p1", nextPlayerId: "p2", remaining: 0 }
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_8_hearts"] });

  assert.equal(state.turnEvents.some(event => event.id === "old"), false);
});

test("real player action replaces stale events with fresh generated events", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_4_hearts", "4", "hearts"), card("p1_8_hearts", "8", "hearts")];
  state.hands.p2 = [card("p2_9_clubs", "9", "clubs")];
  state.turnEvents = [
    { id: "old", type: "auto_draw_pass", playerId: "p2", nextPlayerId: "p1" }
  ];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_4_hearts"] });
  GameEngine.processAutomaticDraws(state);

  assert.equal(state.turnEvents.some(event => event.id === "old"), false);
  assert.equal(state.turnEvents.at(-1).type, "skip_finished");
});

test("initial first player is randomized instead of always host", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const state = GameEngine.initializeGame(
      [{ id: "host" }, { id: "guest" }, { id: "third" }],
      { deckCount: 1, useJokers: false }
    );

    assert.equal(state.turnOrder[state.currentPlayerIndex], "third");
  } finally {
    Math.random = originalRandom;
  }
});

test("three-deck eight-player game deals unique card instances and preserves deck identity", () => {
  const players = Array.from({ length: 8 }, (_, index) => ({ id: `p${index + 1}` }));
  const state = GameEngine.initializeGame(players, {
    deckCount: 3,
    useJokers: false,
    queenVariant: "defensive_non_functional"
  });
  const allCards = collectInitializedCards(state);
  const ids = allCards.map(card => card.cardInstanceId);
  const deckCounts = allCards.reduce((counts, item) => {
    counts[item.deckIndex] = (counts[item.deckIndex] || 0) + 1;
    return counts;
  }, {});

  assert.equal(state.turnOrder.length, 8);
  assert.equal(Object.keys(state.hands).length, 8);
  assert.equal(Object.values(state.hands).every(hand => hand.length === 5), true);
  assert.equal(state.drawPile.length, 115);
  assert.equal(allCards.length, 156);
  assert.equal(new Set(ids).size, 156);
  assert.deepEqual(deckCounts, { 0: 52, 1: 52, 2: 52 });
  assert.equal(GameEngine.isNonFunctional(state.topCard), true);
  assert.deepEqual(state.moveHistory[0].details, {
    playerCount: 8,
    deckCount: 3,
    useJokers: false,
    firstPlayerId: state.turnOrder[state.currentPlayerIndex],
    gameNumber: 1
  });
});

test("initial first player can be selected explicitly", () => {
  const state = GameEngine.initializeGame(
    [{ id: "host" }, { id: "guest" }, { id: "third" }],
    {
      deckCount: 1,
      useJokers: false,
      firstPlayerId: "guest"
    }
  );

  assert.equal(state.turnOrder[state.currentPlayerIndex], "guest");
  assert.equal(state.moveHistory[0].currentPlayerId, "guest");
  assert.equal(state.moveHistory[0].details.firstPlayerId, "guest");
});

test("functional start cards are moved to the bottom privately", () => {
  const originalCreateDeck = GameEngine.createDeck;
  const originalShuffle = GameEngine.shuffle;
  const customDeck = [
    card("start_7_clubs", "7", "clubs"),
    card("start_2_hearts", "2", "hearts"),
    card("deal_1", "5", "hearts"),
    card("deal_2", "6", "hearts"),
    card("deal_3", "7", "hearts"),
    card("deal_4", "8", "hearts"),
    card("deal_5", "9", "hearts"),
    card("deal_6", "10", "hearts"),
    card("deal_7", "king", "clubs"),
    card("deal_8", "5", "diamonds"),
    card("deal_9", "6", "diamonds"),
    card("deal_10", "7", "diamonds")
  ];

  GameEngine.createDeck = () => [...customDeck];
  GameEngine.shuffle = array => array;
  try {
    const state = GameEngine.initializeGame(
      [{ id: "p1" }, { id: "p2" }],
      { deckCount: 1, useJokers: false }
    );

    assert.equal(state.topCard.cardInstanceId, "start_7_clubs");
    assert.deepEqual(state.privateDealLog.skippedFunctionalStartCards, [
      { rank: "2", suit: "hearts" }
    ]);
    assert.equal(state.drawPile[0].cardInstanceId, "start_2_hearts");
  } finally {
    GameEngine.createDeck = originalCreateDeck;
    GameEngine.shuffle = originalShuffle;
  }
});

test("three decks with jokers use unique deck-scoped joker ids", () => {
  const cards = [0, 1, 2].flatMap(deckIndex => GameEngine.createDeck(true, deckIndex));
  const ids = cards.map(item => item.cardInstanceId);
  const jokerIds = ids.filter(id => id.includes("joker"));

  assert.equal(cards.length, 162);
  assert.equal(new Set(ids).size, 162);
  assert.deepEqual(jokerIds.sort(), [
    "d0_joker_1",
    "d0_joker_2",
    "d1_joker_1",
    "d1_joker_2",
    "d2_joker_1",
    "d2_joker_2"
  ]);
});

test("joker must be declared before it is played", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_joker"] }),
    /Joker must be declared/
  );
});

test("declared joker behaves like the chosen battle card", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_spades", "king", "spades");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 5,
    battleSuit: "spades",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "3", suit: "spades" }
    }
  });

  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "3", suit: "spades" });
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 8);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("declared joker can pause like a 4", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "4", suit: "hearts" }
    }
  });

  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "4", suit: "hearts" });
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SKIP_TURN);
  assert.equal(state.activeEffect.amount, 1);
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("declared joker can act as an ace and create a suit request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "ace", suit: "hearts" }
    },
    suitRequest: "clubs"
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "clubs");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("declared joker can act as a jack and create a rank request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "jack", suit: "hearts" }
    },
    rankRequest: "10"
  });

  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "jack", suit: "hearts" });
  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "10");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("joker can be added to a same-rank multi-card play using its declared value", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_9_clubs", "9", "clubs");
  state.hands.p1 = [
    card("p1_10_clubs", "10", "clubs"),
    card("p1_joker", "joker"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_10_clubs", "p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "10", suit: "hearts" }
    }
  });

  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "10", suit: "hearts" });
  assert.deepEqual(state.hands.p1.map(c => c.cardInstanceId), ["p1_8_hearts"]);
});

test("joker declared as another rank cannot be mixed into a same-rank play", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_9_clubs", "9", "clubs");
  state.hands.p1 = [
    card("p1_10_clubs", "10", "clubs"),
    card("p1_joker", "joker")
  ];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", {
      cardIds: ["p1_10_clubs", "p1_joker"],
      jokerDeclarations: {
        p1_joker: { rank: "queen", suit: "hearts" }
      }
    }),
    /same rank/
  );
});

test("joker can start a same-rank multi-card play when declared as a legal first card", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [
    card("p1_joker", "joker"),
    card("p1_10_clubs", "10", "clubs"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_joker", "p1_10_clubs"],
    jokerDeclarations: {
      p1_joker: { rank: "10", suit: "hearts" }
    }
  });

  assert.equal(state.topCard.cardInstanceId, "p1_10_clubs");
  assert.deepEqual(state.discardPile.at(-1).jokerDeclaration, { rank: "10", suit: "hearts" });
});

test("joker declared as a battle card stacks a matching active penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_3_spades", "3", "spades");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 3,
    battleSuit: "spades",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [
    card("p1_3_spades", "3", "spades"),
    card("p1_joker", "joker"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_3_spades", "p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "3", suit: "spades" }
    }
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 9);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("joker declared as a different battle rank must match the active penalty suit", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", {
      cardIds: ["p1_joker"],
      jokerDeclarations: {
        p1_joker: { rank: "3", suit: "spades" }
      }
    }),
    /current top card/
  );
});

test("joker declared as warsaw queen hearts cancels an active draw penalty", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_2_hearts", "2", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 2,
    battleSuit: "hearts",
    targetPlayerId: "p1"
  };
  state.settings.queenVariant = QUEEN_VARIANTS.WARSAW_PARDON;
  state.hands.p1 = [card("p1_joker", "joker"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_joker"],
    jokerDeclarations: {
      p1_joker: { rank: "queen", suit: "hearts" }
    }
  });

  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "queen", suit: "hearts" });
});

test("ace rejects an invalid suit request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.hands.p1 = [card("p1_ace_hearts", "ace", "hearts"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", {
      cardIds: ["p1_ace_hearts"],
      suitRequest: "stars"
    }),
    /Invalid suit request/
  );
});

test("jack rejects requests outside ranks 5 through 10", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.hands.p1 = [card("p1_jack_hearts", "jack", "hearts"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", {
      cardIds: ["p1_jack_hearts"],
      rankRequest: "queen"
    }),
    /Invalid rank request/
  );
});

test("jack can request non-battle kings by default", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.hands.p1 = [
    card("p1_jack_hearts", "jack", "hearts"),
    card("p1_king_diamonds", "king", "diamonds"),
    card("p1_8_hearts", "8", "hearts")
  ];
  state.hands.p2 = [card("p2_king_clubs", "king", "clubs"), card("p2_king_hearts", "king", "hearts")];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_jack_hearts"],
    rankRequest: JACK_REQUEST_RANK_NON_BATTLE_KING
  });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, JACK_REQUEST_RANK_NON_BATTLE_KING);

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_king_clubs"] });
  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, JACK_REQUEST_RANK_NON_BATTLE_KING);
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.topCard.cardInstanceId, "p2_king_clubs");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_diamonds"] });
  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_king_diamonds");
});

test("jack rank request advances after requested rank and clears when requester answers", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.activeEffect = {
    type: EFFECT_TYPES.RANK_REQUEST,
    requestedRank: "5",
    sourceCardId: "top_jack_hearts",
    requesterPlayerId: "p1",
    targetPlayerId: "p2"
  };
  state.hands.p1 = [card("p1_5_hearts", "5", "hearts")];
  state.hands.p2 = [card("p2_5_clubs", "5", "clubs"), card("p2_8_hearts", "8", "hearts")];
  state.hands.p3 = [card("p3_5_diamonds", "5", "diamonds")];

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_5_clubs"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "5");
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p3");
  assert.equal(state.topCard.cardInstanceId, "p2_5_clubs");
  assert.deepEqual(state.hands.p2.map(c => c.cardInstanceId), ["p2_8_hearts"]);

  GameEngine.processPlayCards(state, "p3", { cardIds: ["p3_5_diamonds"] });

  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "5");
  assert.equal(state.activeEffect.requesterPlayerId, "p1");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.topCard.cardInstanceId, "p3_5_diamonds");

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_5_hearts"] });

  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_5_hearts");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("jack no-kings room variant rejects non-battle king request", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.settings.jackRequestMode = JACK_REQUEST_MODES.VALUES_5_TO_10;
  state.hands.p1 = [card("p1_jack_hearts", "jack", "hearts"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(state, "p1", {
      cardIds: ["p1_jack_hearts"],
      rankRequest: JACK_REQUEST_RANK_NON_BATTLE_KING
    }),
    /Invalid rank request/
  );
});

test("required ace and jack request mode rejects explicit no-request play", () => {
  const aceState = baseState();
  aceState.turnOrder = ["p1", "p2"];
  aceState.currentPlayerIndex = 0;
  aceState.topCard = card("top_ace_hearts", "ace", "hearts");
  aceState.settings.aceJackRequestMode = ACE_JACK_REQUEST_MODES.REQUIRED;
  aceState.hands.p1 = [card("p1_ace_hearts", "ace", "hearts"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(aceState, "p1", {
      cardIds: ["p1_ace_hearts"],
      suitRequest: "none"
    }),
    /requires a request/
  );

  const jackState = baseState();
  jackState.turnOrder = ["p1", "p2"];
  jackState.currentPlayerIndex = 0;
  jackState.topCard = card("top_jack_hearts", "jack", "hearts");
  jackState.settings.aceJackRequestMode = ACE_JACK_REQUEST_MODES.REQUIRED;
  jackState.hands.p1 = [card("p1_jack_hearts", "jack", "hearts"), card("p1_8_hearts", "8", "hearts")];

  assert.throws(
    () => GameEngine.processPlayCards(jackState, "p1", {
      cardIds: ["p1_jack_hearts"],
      rankRequest: "none"
    }),
    /requires a request/
  );
});

test("last ace can finish the player and pass a suit request to the next remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.hands.p1 = [card("p1_ace_hearts", "ace", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_ace_hearts"],
    suitRequest: "spades"
  });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last ace with no request finishes and leaves the next player on the ace", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_hearts", "ace", "hearts");
  state.hands.p1 = [card("p1_ace_hearts", "ace", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_ace_hearts"],
    suitRequest: "none"
  });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_ace_hearts");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last jack can finish the player and pass a rank request to the next remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.hands.p1 = [card("p1_jack_hearts", "jack", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_jack_hearts"],
    rankRequest: "10"
  });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "10");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last jack with no request finishes and leaves the next player on the jack", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_hearts", "jack", "hearts");
  state.hands.p1 = [card("p1_jack_hearts", "jack", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_jack_hearts"],
    rankRequest: "none"
  });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect, null);
  assert.equal(state.topCard.cardInstanceId, "p1_jack_hearts");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last battle 2 can finish the player and pass the penalty to the next remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_2_hearts", "2", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_2_hearts"] });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 2);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last battle 3 can finish the player and pass the penalty to the next remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_3_hearts", "3", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_3_hearts"] });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 3);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last king hearts in a 3-player game finishes and targets the next remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands.p1 = [card("p1_king_hearts", "king", "hearts")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_king_hearts"] });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "hearts");
  assert.equal(state.activeEffect.direction, "next");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last king spades in a 3-player game finishes and targets the previous remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 1;
  state.topCard = card("top_king_clubs", "king", "clubs");
  state.hands.p1 = [card("p1_8_clubs", "8", "clubs")];
  state.hands.p2 = [card("p2_king_spades", "king", "spades")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p2: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p2", { cardIds: ["p2_king_spades"] });

  assert.deepEqual(state.turnOrder, ["p1", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.activeEffect.type, EFFECT_TYPES.DRAW_PENALTY);
  assert.equal(state.activeEffect.amount, 5);
  assert.equal(state.activeEffect.battleSuit, "spades");
  assert.equal(state.activeEffect.direction, "previous");
  assert.equal(state.activeEffect.targetPlayerId, "p1");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p1");
});

test("last joker declared as a 4 can finish and pass a skip effect to the next remaining player", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_last_joker", "joker")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_last_joker"],
    jokerDeclarations: {
      p1_last_joker: { rank: "4", suit: "hearts" }
    }
  });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.topCard.rank, "joker");
  assert.deepEqual(state.topCard.jokerDeclaration, { rank: "4", suit: "hearts" });
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SKIP_TURN);
  assert.equal(state.activeEffect.amount, 1);
  assert.equal(state.activeEffect.targetPlayerId, "p2");
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("last queen finishes without creating an active effect", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2", "p3"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_7_hearts", "7", "hearts");
  state.hands.p1 = [card("p1_last_queen_spades", "queen", "spades")];
  state.hands.p2 = [card("p2_8_clubs", "8", "clubs")];
  state.hands.p3 = [card("p3_9_diamonds", "9", "diamonds")];
  state.makao = { p1: { declared: true, declaredAt: Date.now() } };

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_last_queen_spades"]
  });

  assert.deepEqual(state.turnOrder, ["p2", "p3"]);
  assert.equal(state.gameOver, false);
  assert.equal(state.topCard.cardInstanceId, "p1_last_queen_spades");
  assert.equal(state.activeEffect, null);
  assert.equal(state.finishedPlayers.some(player => player.playerId === "p1"), true);
  assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
});

test("multiple aces create one final suit request and leave the last ace on top", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_ace_clubs", "ace", "clubs");
  state.hands.p1 = [
    card("p1_ace_clubs", "ace", "clubs"),
    card("p1_ace_spades", "ace", "spades"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_ace_clubs", "p1_ace_spades"],
    suitRequest: "diamonds"
  });

  assert.equal(state.topCard.cardInstanceId, "p1_ace_spades");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.SUIT_REQUEST);
  assert.equal(state.activeEffect.requestedSuit, "diamonds");
  assert.equal(state.activeEffect.sourceCardId, "p1_ace_spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("multiple jacks create one final rank request and leave the last jack on top", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = card("top_jack_clubs", "jack", "clubs");
  state.hands.p1 = [
    card("p1_jack_clubs", "jack", "clubs"),
    card("p1_jack_spades", "jack", "spades"),
    card("p1_8_hearts", "8", "hearts")
  ];

  GameEngine.processPlayCards(state, "p1", {
    cardIds: ["p1_jack_clubs", "p1_jack_spades"],
    rankRequest: "10"
  });

  assert.equal(state.topCard.cardInstanceId, "p1_jack_spades");
  assert.equal(state.activeEffect.type, EFFECT_TYPES.RANK_REQUEST);
  assert.equal(state.activeEffect.requestedRank, "10");
  assert.equal(state.activeEffect.sourceCardId, "p1_jack_spades");
  assert.equal(state.activeEffect.targetPlayerId, "p2");
});

test("declared joker on the table is matched by its declared rank or suit", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.topCard = {
    ...card("top_joker", "joker"),
    jokerDeclaration: { rank: "7", suit: "clubs" }
  };
  state.hands.p1 = [card("p1_9_clubs", "9", "clubs"), card("p1_8_hearts", "8", "hearts")];

  GameEngine.processPlayCards(state, "p1", { cardIds: ["p1_9_clubs"] });

  assert.equal(state.topCard.cardInstanceId, "p1_9_clubs");
});

test("declared joker resets to a normal joker when discard pile is reshuffled into draw pile", () => {
  const state = baseState();
  state.turnOrder = ["p1", "p2"];
  state.currentPlayerIndex = 0;
  state.hands.p1 = [];
  state.drawPile = [];
  state.discardPile = [{
    ...card("discard_joker", "joker"),
    jokerDeclaration: { rank: "2", suit: "hearts" }
  }];

  GameEngine.drawCards(state, "p1", 1);

  assert.deepEqual(state.hands.p1, [card("discard_joker", "joker")]);
});

test("draw penalty continues through an empty draw pile and then selects a neutral table card", () => {
  const state = baseState();
  const originalShuffle = GameEngine.shuffle;
  GameEngine.shuffle = array => array;

  try {
    state.turnOrder = ["p1", "p2"];
    state.currentPlayerIndex = 0;
    state.topCard = card("old_top_9_hearts", "9", "hearts");
    state.activeEffect = {
      type: EFFECT_TYPES.DRAW_PENALTY,
      amount: 2,
      battleSuit: "hearts",
      targetPlayerId: "p1"
    };
    state.hands.p1 = [];
    state.drawPile = [card("draw_last_5_spades", "5", "spades")];
    state.discardPile = [
      card("neutral_7_clubs", "7", "clubs"),
      card("functional_4_spades", "4", "spades"),
      card("draw_missing_6_diamonds", "6", "diamonds")
    ];

    GameEngine.processAcceptPenalty(state, "p1");

    assert.deepEqual(state.hands.p1.map(c => c.cardInstanceId), [
      "draw_last_5_spades",
      "draw_missing_6_diamonds"
    ]);
    assert.equal(state.topCard.cardInstanceId, "neutral_7_clubs");
    assert.deepEqual(state.drawPile.map(c => c.cardInstanceId), ["functional_4_spades"]);
    assert.deepEqual(state.discardPile.map(c => c.cardInstanceId), ["old_top_9_hearts"]);
    assert.equal(state.activeEffect, null);
    assert.equal(state.turnOrder[state.currentPlayerIndex], "p2");
    assert.ok(state.turnEvents.some(event => event.type === "draw_pile_refilled"));
    assert.ok(state.auditLog.some(entry => entry.type === "draw_pile_refilled"));
    assert.ok(state.auditLog.some(entry => entry.type === "neutral_table_card_selected"));
    assert.deepEqual(
      state.auditLog.find(entry => entry.type === "neutral_table_card_selected").details.skippedFunctionalCards,
      [GameEngine.privateCard(card("functional_4_spades", "4", "spades"))]
    );
  } finally {
    GameEngine.shuffle = originalShuffle;
  }
});

test("refill without any neutral card preserves the current table card and logs the edge case", () => {
  const state = baseState();
  const originalShuffle = GameEngine.shuffle;
  GameEngine.shuffle = array => array;

  try {
    state.topCard = card("old_top_9_hearts", "9", "hearts");
    state.hands.p1 = [];
    state.drawPile = [];
    state.discardPile = [
      card("functional_4_spades", "4", "spades"),
      card("functional_2_hearts", "2", "hearts")
    ];

    const drawn = GameEngine.drawCards(state, "p1", 1);

    assert.deepEqual(drawn.map(c => c.cardInstanceId), ["functional_2_hearts"]);
    assert.equal(state.topCard.cardInstanceId, "old_top_9_hearts");
    assert.deepEqual(state.drawPile.map(c => c.cardInstanceId), ["functional_4_spades"]);
    assert.equal(state.discardPile.length, 0);
    assert.ok(state.auditLog.some(entry => entry.type === "neutral_table_card_unavailable"));
  } finally {
    GameEngine.shuffle = originalShuffle;
  }
});

test("recordHistory increments state version and stores public move summary", () => {
  const state = baseState();
  state.stateVersion = 1;
  state.moveHistory = [];
  state.activeEffect = {
    type: EFFECT_TYPES.DRAW_PENALTY,
    amount: 5,
    battleSuit: "spades",
    targetPlayerId: "p2"
  };

  GameEngine.recordHistory(state, "play_cards", {
    playerId: "p1",
    details: { cardCount: 1 }
  });

  assert.equal(state.stateVersion, 2);
  assert.equal(state.moveHistory.length, 1);
  assert.equal(state.moveHistory[0].version, 2);
  assert.equal(state.moveHistory[0].type, "play_cards");
  assert.equal(state.moveHistory[0].playerId, "p1");
  assert.deepEqual(state.moveHistory[0].activeEffect, {
    type: EFFECT_TYPES.DRAW_PENALTY,
    targetPlayerId: "p2",
    amount: 5,
    battleSuit: "spades"
  });
  assert.equal(state.auditLog.at(-1).category, "game_event_log");
  assert.equal(state.auditLog.at(-1).type, "play_cards");
  assert.equal(state.auditLog.at(-1).handCounts.p1, 3);
  assert.equal(state.stateSnapshots.at(-1).auditEntryId, state.auditLog.at(-1).id);
  assert.deepEqual(state.stateSnapshots.at(-1).zones.hands.p1, [
    "p1_4_hearts",
    "p1_4_diamonds",
    "p1_8_hearts"
  ]);
});
