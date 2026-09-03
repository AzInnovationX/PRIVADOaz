import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "contraaz.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "contraaz",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "contraaz.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "189421046439",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:189421046439:web:8cc25524e0dc3768f4a982",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-3C4ETYPWRR"
};

const isBrowser = typeof window !== "undefined";

// Inicializar la App de Firebase únicamente con configuración presente
const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

export const auth = isBrowser ? getAuth(app) : ({} as ReturnType<typeof getAuth>);
export const db = isBrowser ? getFirestore(app) : ({} as ReturnType<typeof getFirestore>);

// Analytics opcional y libre de datos sensibles
export const initAnalytics = async () => {
  if (isBrowser && firebaseConfig.apiKey) {
    const supported = await isSupported();
    if (supported) {
      return getAnalytics(app);
    }
  }
  return null;
};

export default app;
