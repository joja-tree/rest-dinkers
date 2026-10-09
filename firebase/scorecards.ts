import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { Match, Session } from "@/lib/domain";
import { firebaseDb } from "./client";

export type SharedScorecard = {
  id: string;
  ownerId: string;
  sessionId: string;
  sessionName: string;
  round: number;
  court: number;
  teamANames: string[];
  teamBNames: string[];
  match: Match;
  status: "open" | "accepted";
  acceptedSubmissionId?: string;
};

export type ScorecardSubmission = {
  id: string;
  submitterName: string;
  match: Match;
  submittedAt: number;
};

const scorecardRef = (ownerId: string, shareId: string) => doc(firebaseDb(), "users", ownerId, "scorecards", shareId);
const submissionsRef = (ownerId: string, shareId: string) => collection(firebaseDb(), "users", ownerId, "scorecards", shareId, "submissions");
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function createSharedScorecard(ownerId: string, session: Session, match: Match) {
  const shareId = crypto.randomUUID();
  const playerName = (id: string) => session.players.find((player) => player.id === id)?.name ?? "Player";
  const scorecard: SharedScorecard = {
    id: shareId,
    ownerId,
    sessionId: session.id,
    sessionName: session.name,
    round: session.current.number,
    court: match.court,
    teamANames: match.teamA.map(playerName),
    teamBNames: match.teamB.map(playerName),
    match: clean({ ...match, history: [], scoreA: 0, scoreB: 0, winner: undefined, startedAt: null, endedAt: null, setupComplete: false, pointScorers: [], faultCounts: {}, serveCounts: { [match.teamA[match.rules.openingServer - 1] ?? match.teamA[0]]: 1 } }),
    status: "open",
  };
  await setDoc(scorecardRef(ownerId, shareId), { ...clean(scorecard), createdAt: serverTimestamp() });
  return scorecard;
}

export async function loadSharedScorecard(ownerId: string, shareId: string): Promise<SharedScorecard | null> {
  const saved = await getDoc(scorecardRef(ownerId, shareId));
  return saved.exists() ? saved.data() as SharedScorecard : null;
}

export function subscribeSubmissions(ownerId: string, shareId: string, onChange: (items: ScorecardSubmission[]) => void) {
  return onSnapshot(submissionsRef(ownerId, shareId), (snapshot) => onChange(snapshot.docs.map((item) => {
    const data = item.data();
    return { id: item.id, submitterName: data.submitterName, match: data.match as Match, submittedAt: data.submittedAt?.toMillis?.() ?? Date.now() };
  }).sort((a, b) => b.submittedAt - a.submittedAt)));
}

export async function submitScorecard(ownerId: string, shareId: string, submitterName: string, match: Match) {
  await addDoc(submissionsRef(ownerId, shareId), { submitterName: submitterName.trim(), match: clean(match), submittedAt: serverTimestamp() });
}

export async function acceptScorecardSubmission(ownerId: string, shareId: string, submissionId: string) {
  await updateDoc(scorecardRef(ownerId, shareId), { status: "accepted", acceptedSubmissionId: submissionId, acceptedAt: serverTimestamp() });
}
