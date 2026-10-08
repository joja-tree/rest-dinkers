import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import type { Session } from "@/lib/domain";
import { firebaseDb } from "./client";

const userRef = (uid: string) => doc(firebaseDb(), "users", uid);
const sessionRef = (uid: string, id: string) => doc(firebaseDb(), "users", uid, "sessions", id);

export type SessionHistoryItem = { session: Session; savedAt: number; documentId?: string };

export async function loadSessionHistory(uid: string): Promise<SessionHistoryItem[]> {
  const saved = await getDocs(collection(firebaseDb(), "users", uid, "sessions"));
  return saved.docs
    .filter((item) => item.data().status === "completed" && item.data().session)
    .map((item) => { const data = item.data(); return { session: data.session as Session, savedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0, documentId: item.id }; })
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadActiveSession(uid: string): Promise<Session | null> {
  const user = await getDoc(userRef(uid));
  const activeSessionId = user.data()?.activeSessionId;
  if (typeof activeSessionId !== "string") return null;
  const saved = await getDoc(sessionRef(uid, activeSessionId));
  return (saved.data()?.session as Session | undefined) ?? null;
}

export async function saveActiveSession(uid: string, session: Session) {
  await Promise.all([
    setDoc(sessionRef(uid, session.id), { session, status: "active", updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(userRef(uid), { activeSessionId: session.id, updatedAt: serverTimestamp() }, { merge: true }),
  ]);
}

export async function archiveSession(uid: string, session: Session, archiveId = `${session.id}-completed-${Date.now()}`) {
  await Promise.all([
    setDoc(sessionRef(uid, archiveId), { session, status: "completed", updatedAt: serverTimestamp() }),
    setDoc(userRef(uid), { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true }),
  ]);
  return archiveId;
}

export async function deleteSession(uid: string, documentId: string) {
  await deleteDoc(sessionRef(uid, documentId));
}
