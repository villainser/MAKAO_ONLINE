export const SUITS = ["hearts", "diamonds", "clubs", "spades"];

export const RANKS = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "jack", "queen", "king", "ace", "joker"
];

export const JACK_REQUEST_RANK_NON_BATTLE_KING = "non_battle_king";
export const JACK_REQUEST_RANKS_BASIC = ["5", "6", "7", "8", "9", "10"];
export const JACK_REQUEST_RANKS_WITH_NON_BATTLE_KINGS = [
  ...JACK_REQUEST_RANKS_BASIC,
  JACK_REQUEST_RANK_NON_BATTLE_KING
];
export const JACK_REQUEST_RANKS = JACK_REQUEST_RANKS_WITH_NON_BATTLE_KINGS;

export const EFFECT_TYPES = {
  DRAW_PENALTY: "draw_penalty",
  SKIP_TURN: "skip_turn",
  SUIT_REQUEST: "suit_request",
  RANK_REQUEST: "rank_request"
};

export const BATTLE_CARDS = ["2", "3"];
// Kings are battle cards conditionally based on suit, handled in logic.

export const QUEEN_VARIANTS = {
  DEFENSIVE_NON_FUNCTIONAL: "defensive_non_functional", // Domyślna, nie chroni przed karami 2,3,K
  WARSAW_PARDON: "warsaw_pardon" // Warszawska, dama pik/kier chroni
};

export const BATTLE_COUNTER_MODES = {
  SUIT_ONLY: "suit_only",
  SUIT_OR_RANK: "suit_or_rank"
};

export const QUEEN_REQUEST_MODES = {
  CANCELS_REQUEST: "cancels_request",
  BLOCKED_BY_REQUEST: "blocked_by_request"
};

export const JACK_REQUEST_MODES = {
  WITH_NON_BATTLE_KINGS: "with_non_battle_kings",
  VALUES_5_TO_10: "values_5_to_10"
};

export const ACE_JACK_REQUEST_MODES = {
  OPTIONAL: "optional",
  REQUIRED: "required"
};

export const DISCONNECT_POLICIES = {
  HOST_DECIDES: "host_decides",
  AUTO_REMOVE_AFTER_LIMIT: "auto_remove_after_limit"
};

export const FIRST_PLAYER_MODES = {
  RANDOM_EACH_GAME: "random_each_game",
  HOST_SELECTED_THEN_ROTATE: "host_selected_then_rotate"
};

export const ROOM_LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  MIN_DECKS: 1,
  MAX_DECKS: 3,
  MAX_ROOM_NAME_LENGTH: 32,
  MIN_CUSTOM_TURN_LIMIT_SECONDS: 10,
  MAX_CUSTOM_TURN_LIMIT_SECONDS: 300,
  DEFAULT_TURN_LIMIT_SECONDS: 0,
  DEFAULT_PAUSE_TIMEOUT_SECONDS: 300
};

export const TURN_TIME_LIMIT_OPTIONS = [30, 60, 120, 300];

export const MAKAO_DECLARE_GRACE_MS = 2000;
export const MAKAO_CATCH_WINDOW_MS = 5000;

export const EVENTS = {
  // Room
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
  RECONNECT_SESSION: "reconnect_session",
  ROOM_STATE_UPDATE: "room_state_update",
  PLAYER_JOINED: "player_joined",
  PLAYER_LEFT: "player_left",
  TOGGLE_READY: "toggle_ready",
  UPDATE_SETTINGS: "update_settings",
  REMOVE_PLAYER: "remove_player",
  TRANSFER_HOST: "transfer_host",
  RETURN_TO_LOBBY: "return_to_lobby",
  
  // Game
  START_GAME: "start_game",
  GAME_STATE_UPDATE: "game_state_update",
  PLAY_CARDS: "play_cards", // Zamiast play_card, bo można zagrać kilka
  DRAW_CARD: "draw_card",
  ACCEPT_PENALTY: "accept_penalty",
  PASS_TURN: "pass_turn",
  ACCEPT_SKIP: "accept_skip",
  DECLARE_MAKAO: "declare_makao",
  CATCH_MAKAO: "catch_makao",
  PAUSE_GAME: "pause_game",
  RESUME_GAME: "resume_game",
  HOST_END_GAME: "host_end_game",
  HOST_SKIP_OFFLINE_TURN: "host_skip_offline_turn",
  HOST_FORCE_ACCEPT_EFFECT: "host_force_accept_effect",
  DEBUG_SEED_GAME_STATE: "debug_seed_game_state",
  
  // Errors/Notifications
  ERROR: "error",
  NOTIFICATION: "notification"
};
