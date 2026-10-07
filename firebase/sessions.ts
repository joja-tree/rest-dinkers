import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { Session } from "@/lib/domain";
import { firebaseDb } from "./client";

const userRef = (uid: string) => doc(firebaseDb(), "users", uid);
const sessionRef = (uid: string, id: string) => doc(firebaseDb(), "users", uid, "sessions", id);

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

export async function archiveSession(uid: string, session: Session) {
  await Promise.all([
    setDoc(sessionRef(uid, session.id), { session, status: "completed", updatedAt: serverTimestamp() }, { merge: true }),
    setDoc(userRef(uid), { activeSessionId: null, updatedAt: serverTimestamp() }, { merge: true }),
  ]);
}
