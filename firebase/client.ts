import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId,
  authDomain: projectId ? `${projectId}.firebaseapp.com` : undefined,
  storageBucket: projectId ? `${projectId}.appspot.com` : undefined,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && projectId && firebaseConfig.appId);

function app() {
  if (!firebaseConfigured) throw new Error("Firebase is not configured.");
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const firebaseAuth = () => getAuth(app());
export const firebaseDb = () => getFirestore(app());
