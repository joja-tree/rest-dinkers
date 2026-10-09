export type Player = {
  id: string;
  name: string;
  games: number;
  rests: number;
  consecutiveGames: number;
  consecutiveRests: number;
  points: number;
  timePlayedSeconds: number;
};

export type GameFormat = "rest-dinkers-doubles" | "standard-doubles" | "standard-singles";

export type GameRules = {
  id: GameFormat;
  name: string;
  description: string;
  teamSize: 1 | 2;
  winningScore: number;
  winBy: 1 | 2;
  serversPerSide: 1 | 2;
  openingServer: 1 | 2;
};

export type Team = [string] | [string, string];

export type Match = {
  id: string;
  court: number;
  teamA: Team;
  teamB: Team;
  scoreA: number;
  scoreB: number;
  servingTeam: "A" | "B";
  server: 1 | 2;
  winner?: "A" | "B";
  history: ScoreSnapshot[];
  pointScorers: string[];
  serveCounts: Record<string, number>;
  faultCounts: Record<string, number>;
  setupComplete: boolean;
  startedAt: number | null;
  endedAt: number | null;
  rules: GameRules;
  shareId?: string;
};

export type ScoreSnapshot = Pick<Match, "scoreA" | "scoreB" | "servingTeam" | "server" | "winner" | "pointScorers" | "serveCounts" | "faultCounts" | "endedAt">;

export type Round = {
  number: number;
  matches: Match[];
  resting: string[];
};

export type Session = {
  id: string;
  name: string;
  courts: number;
  players: Player[];
  current: Round;
  next: Round;
  completedRounds: Round[];
  partnerCounts: Record<string, number>;
  opponentCounts: Record<string, number>;
  rules: GameRules;
};

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");
