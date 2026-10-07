import type { Match, ScoreSnapshot } from "./domain";

export const DEFAULT_POINTS_TO_WIN = 11;

function snapshot(match: Match): ScoreSnapshot {
  return {
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    servingTeam: match.servingTeam,
    server: match.server,
    winner: match.winner,
    pointScorers: [...match.pointScorers],
    serveCounts: { ...match.serveCounts },
    faultCounts: { ...match.faultCounts },
    endedAt: match.endedAt,
  };
}

function winner(scoreA: number, scoreB: number, pointsToWin: number): "A" | "B" | undefined {
  if (scoreA >= pointsToWin) return "A";
  if (scoreB >= pointsToWin) return "B";
}

export function point(match: Match, pointsToWin = DEFAULT_POINTS_TO_WIN): Match {
  if (match.winner) return match;
  const history = [...match.history, snapshot(match)];
  const scoreA = match.scoreA + (match.servingTeam === "A" ? 1 : 0);
  const scoreB = match.scoreB + (match.servingTeam === "B" ? 1 : 0);
  const servingTeam = match.servingTeam === "A" ? match.teamA : match.teamB;
  const pointScorers = [...match.pointScorers, servingTeam[match.server - 1]];
  const matchWinner = winner(scoreA, scoreB, pointsToWin);
  return { ...match, scoreA, scoreB, pointScorers, winner: matchWinner, endedAt: matchWinner ? Date.now() : null, history };
}

export function out(match: Match): Match {
  if (match.winner) return match;
  const history = [...match.history, snapshot(match)];
  const servingTeam = match.servingTeam === "A" ? match.teamA : match.teamB;
  const faultingPlayer = servingTeam[match.server - 1];
  const faultCounts = { ...match.faultCounts, [faultingPlayer]: (match.faultCounts[faultingPlayer] ?? 0) + 1 };
  if (match.server === 1) {
    const nextPlayer = servingTeam[1];
    const serveCounts = { ...match.serveCounts, [nextPlayer]: (match.serveCounts[nextPlayer] ?? 0) + 1 };
    return { ...match, server: 2, faultCounts, serveCounts, history };
  }
  const nextServingTeam = match.servingTeam === "A" ? "B" : "A";
  const nextTeam = nextServingTeam === "A" ? match.teamA : match.teamB;
  const serveCounts = { ...match.serveCounts, [nextTeam[0]]: (match.serveCounts[nextTeam[0]] ?? 0) + 1 };
  return { ...match, servingTeam: nextServingTeam, server: 1, faultCounts, serveCounts, history };
}

export function undo(match: Match): Match {
  const previous = match.history.at(-1);
  if (!previous) return match;
  return {
    ...match,
    scoreA: previous.scoreA,
    scoreB: previous.scoreB,
    servingTeam: previous.servingTeam,
    server: previous.server,
    winner: previous.winner,
    endedAt: previous.endedAt ?? null,
    pointScorers: previous.pointScorers ?? [],
    serveCounts: previous.serveCounts ?? {},
    faultCounts: previous.faultCounts ?? {},
    history: match.history.slice(0, -1),
  };
}
