import type { Match, Player, Round, Session, Team } from "./domain";
import { pairKey } from "./domain";

type DoublesTeam = [string, string];

const WEIGHTS = {
  games: 1000,
  consecutiveGame: 190,
  consecutiveRest: 260,
  rests: -25,
  partnerRepeat: 45,
  opponentRepeat: 12,
} as const;

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const result: T[][] = [];
  for (let index = 0; index <= items.length - size; index += 1) {
    for (const tail of combinations(items.slice(index + 1), size - 1)) result.push([items[index], ...tail]);
  }
  return result;
}

function seededTie(ids: string[], round: number): number {
  const value = `${round}:${[...ids].sort().join(":")}`;
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash / 0xffffffff;
}

function chooseParticipants(players: Player[], count: number, roundNumber: number): Player[] {
  let best: { players: Player[]; score: number } | undefined;
  for (const group of combinations(players, count)) {
    const score = group.reduce((total, player) => total
      + player.games * WEIGHTS.games
      + player.consecutiveGames * WEIGHTS.consecutiveGame
      + player.rests * WEIGHTS.rests, 0)
      + players.filter((player) => !group.includes(player)).reduce((total, player) => total
        + player.consecutiveRests * WEIGHTS.consecutiveRest, 0)
      + seededTie(group.map((player) => player.id), roundNumber);
    if (!best || score < best.score) best = { players: group, score };
  }
  return best?.players ?? players.slice(0, count);
}

function partitionIntoTeams(ids: string[], session: Pick<Session, "partnerCounts" | "opponentCounts" | "rules">): Team[] {
  if (session.rules.teamSize === 1) return ids.map((id) => [id]);
  const remaining = [...ids];
  const teams: Team[] = [];
  while (remaining.length >= 4) {
    const group = remaining.splice(0, 4);
    const candidates: [DoublesTeam, DoublesTeam][] = [
      [[group[0], group[1]], [group[2], group[3]]],
      [[group[0], group[2]], [group[1], group[3]]],
      [[group[0], group[3]], [group[1], group[2]]],
    ];
    candidates.sort((left, right) => teamPenalty(left, session) - teamPenalty(right, session));
    teams.push(...candidates[0]);
  }
  return teams;
}

function teamPenalty([a, b]: [DoublesTeam, DoublesTeam], session: Pick<Session, "partnerCounts" | "opponentCounts">): number {
  const partner = (session.partnerCounts[pairKey(a[0], a[1])] ?? 0) + (session.partnerCounts[pairKey(b[0], b[1])] ?? 0);
  const opponentPairs = a.flatMap((left) => b.map((right) => pairKey(left, right)));
  const opponent = opponentPairs.reduce((sum, key) => sum + (session.opponentCounts[key] ?? 0), 0);
  return partner * WEIGHTS.partnerRepeat + opponent * WEIGHTS.opponentRepeat;
}

export function generateRound(session: Pick<Session, "id" | "courts" | "players" | "partnerCounts" | "opponentCounts" | "rules">, roundNumber: number): Round {
  const playersPerMatch = session.rules.teamSize * 2;
  const matchCount = Math.min(session.courts, Math.floor(session.players.length / playersPerMatch));
  const participants = chooseParticipants(session.players, matchCount * playersPerMatch, roundNumber);
  const teams = partitionIntoTeams(participants.map((player) => player.id), session);
  const matches: Match[] = [];
  for (let court = 0; court < matchCount; court += 1) {
    matches.push({
      id: `${session.id}-r${roundNumber}-c${court + 1}`,
      court: court + 1,
      teamA: teams[court * 2],
      teamB: teams[court * 2 + 1],
      scoreA: 0,
      scoreB: 0,
      servingTeam: "A",
      server: session.rules.openingServer,
      history: [],
      pointScorers: [],
      serveCounts: { [teams[court * 2][session.rules.openingServer - 1] ?? teams[court * 2][0]]: 1 },
      faultCounts: {},
      setupComplete: false,
      startedAt: null,
      endedAt: null,
      rules: session.rules,
    });
  }
  const selected = new Set(participants.map((player) => player.id));
  return { number: roundNumber, matches, resting: session.players.filter((player) => !selected.has(player.id)).map((player) => player.id) };
}

export function applyCompletedRound(session: Session): Session {
  const playing = new Set(session.current.matches.flatMap((match) => [...match.teamA, ...match.teamB]));
  const partnerCounts = { ...session.partnerCounts };
  const opponentCounts = { ...session.opponentCounts };
  for (const match of session.current.matches) {
    if (match.teamA.length === 2) partnerCounts[pairKey(match.teamA[0], match.teamA[1])] = (partnerCounts[pairKey(match.teamA[0], match.teamA[1])] ?? 0) + 1;
    if (match.teamB.length === 2) partnerCounts[pairKey(match.teamB[0], match.teamB[1])] = (partnerCounts[pairKey(match.teamB[0], match.teamB[1])] ?? 0) + 1;
    for (const a of match.teamA) for (const b of match.teamB) opponentCounts[pairKey(a, b)] = (opponentCounts[pairKey(a, b)] ?? 0) + 1;
  }
  const scored = session.current.matches.flatMap((match) => match.pointScorers).reduce<Record<string, number>>((totals, id) => {
    totals[id] = (totals[id] ?? 0) + 1;
    return totals;
  }, {});
  const playedSeconds = session.current.matches.reduce<Record<string, number>>((totals, match) => {
    const elapsed = match.startedAt && match.endedAt ? Math.max(0, Math.floor((match.endedAt - match.startedAt) / 1000)) : 0;
    for (const id of [...match.teamA, ...match.teamB]) totals[id] = (totals[id] ?? 0) + elapsed;
    return totals;
  }, {});
  const players = session.players.map((player) => playing.has(player.id)
    ? { ...player, games: player.games + 1, consecutiveGames: player.consecutiveGames + 1, consecutiveRests: 0, points: player.points + (scored[player.id] ?? 0), timePlayedSeconds: player.timePlayedSeconds + (playedSeconds[player.id] ?? 0) }
    : { ...player, rests: player.rests + 1, consecutiveGames: 0, consecutiveRests: player.consecutiveRests + 1 });
  const promoted = { ...session, players, partnerCounts, opponentCounts, completedRounds: [...session.completedRounds, session.current], current: session.next };
  return { ...promoted, next: generateRound(promoted, session.next.number + 1) };
}
