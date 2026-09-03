import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyA-bOyv1E-6jyJtrmvCUnei34dyFzdJsuQ";

const firebaseConfig = {
  apiKey: API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "contraaz.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "contraaz",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "contraaz.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "189421046439",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:189421046439:web:8cc25524e0dc3768f4a982",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-3C4ETYPWRR"
};

const isBrowser = typeof window !== "undefined";

const app = isBrowser
  ? (!getApps().length ? initializeApp(firebaseConfig) : getApp())
  : null;

export const auth = (isBrowser && app ? getAuth(app) : {}) as ReturnType<typeof getAuth>;
export const db = (isBrowser && app ? getFirestore(app) : {}) as ReturnType<typeof getFirestore>;

// Analytics opcional y libre de datos sensibles
export const initAnalytics = async () => {
  if (isBrowser && app && API_KEY) {
    const supported = await isSupported();
    if (supported) {
      return getAnalytics(app);
    }
  }
  return null;
};

export default app;
