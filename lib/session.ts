import type { GameFormat, Player, Session } from "./domain";
import { generateRound } from "./fair-play";
import { rulesFor } from "./game-rules";

export function createSession(name: string, names: string[], courts: number, format: GameFormat = "rest-dinkers-doubles"): Session {
  const id = crypto.randomUUID();
  const players: Player[] = names.map((playerName, index) => ({
    id: `${id}-p${index + 1}`,
    name: playerName.trim(),
    games: 0,
    rests: 0,
    consecutiveGames: 0,
    consecutiveRests: 0,
    points: 0,
    timePlayedSeconds: 0,
  }));
  const rules = rulesFor(format);
  const base = { id, name: name.trim() || "Open Play", courts, players, partnerCounts: {}, opponentCounts: {}, rules };
  const current = generateRound(base, 1);
  const projectedPlayers = players.map((player) => current.resting.includes(player.id)
    ? { ...player, rests: 1, consecutiveRests: 1 }
    : { ...player, games: 1, consecutiveGames: 1 });
  const next = generateRound({ ...base, players: projectedPlayers }, 2);
  return { ...base, current, next, completedRounds: [] };
}
