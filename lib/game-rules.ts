import type { GameFormat, GameRules } from "./domain";

export const RULE_PRESETS: Record<GameFormat, GameRules> = {
  "rest-dinkers-doubles": {
    id: "rest-dinkers-doubles",
    name: "Rest Dinkers Rules",
    description: "Custom doubles · First to 11 · No win-by-two",
    teamSize: 2,
    winningScore: 11,
    winBy: 1,
    serversPerSide: 2,
    openingServer: 1,
  },
  "standard-doubles": {
    id: "standard-doubles",
    name: "Standard Doubles",
    description: "Side-out scoring · First to 11 · Win by 2",
    teamSize: 2,
    winningScore: 11,
    winBy: 2,
    serversPerSide: 2,
    openingServer: 2,
  },
  "standard-singles": {
    id: "standard-singles",
    name: "Standard Singles",
    description: "One player per side · First to 11 · Win by 2",
    teamSize: 1,
    winningScore: 11,
    winBy: 2,
    serversPerSide: 1,
    openingServer: 1,
  },
};

export const DEFAULT_RULES = RULE_PRESETS["rest-dinkers-doubles"];

export function rulesFor(format: GameFormat): GameRules {
  return RULE_PRESETS[format];
}
