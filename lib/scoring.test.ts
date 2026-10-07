import { describe, expect, it } from "vitest";
import type { Match } from "./domain";
import { out, point, undo } from "./scoring";

const match: Match = {
  id: "match",
  court: 1,
  teamA: ["alex", "bea"],
  teamB: ["cal", "dani"],
  scoreA: 0,
  scoreB: 0,
  servingTeam: "A",
  server: 1,
  history: [],
  pointScorers: [],
  serveCounts: { alex: 1 },
  faultCounts: {},
  setupComplete: true,
  startedAt: 1000,
  endedAt: null,
};

describe("double-serve scoring", () => {
  it("credits a score to the serving player and undo restores all state", () => {
    const scored = point(match);
    expect(scored.scoreA).toBe(1);
    expect(scored.pointScorers).toEqual(["alex"]);
    expect(undo(scored)).toEqual(match);
  });

  it("moves from server one to server two, then switches teams", () => {
    const secondServer = out(match);
    expect(secondServer.server).toBe(2);
    expect(secondServer.servingTeam).toBe("A");
    expect(secondServer.faultCounts.alex).toBe(1);
    expect(secondServer.serveCounts.bea).toBe(1);
    const sideOut = out(secondServer);
    expect(sideOut.server).toBe(1);
    expect(sideOut.servingTeam).toBe("B");
    expect(sideOut.faultCounts.bea).toBe(1);
    expect(sideOut.serveCounts.cal).toBe(1);
  });

  it("ends immediately when the serving team reaches 11", () => {
    const atTen = { ...match, scoreA: 10, scoreB: 10 };
    const finished = point(atTen);
    expect(finished.scoreA).toBe(11);
    expect(finished.winner).toBe("A");
    expect(finished.endedAt).not.toBeNull();
  });

  it("clears the winner after persisted state is reloaded and undone", () => {
    const finished = point({ ...match, scoreA: 10, scoreB: 10 });
    const reloaded = JSON.parse(JSON.stringify(finished)) as Match;
    const restored = undo(reloaded);
    expect(restored.scoreA).toBe(10);
    expect(restored.winner).toBeUndefined();
    expect(restored.endedAt).toBeNull();
  });
});
