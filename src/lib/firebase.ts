import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, type Firestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAZ0uwpS0CRqv-xRA9ZgDglY4KNAHIpyHc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "classicworld-pos.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "classicworld-pos",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "classicworld-pos.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "173117682786",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:173117682786:web:dd32dad2ca345a1e36cd3b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-56JLQY2N4Y"
};

// Initialize Firebase client instance
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

function initFirestoreDb(): Firestore {
  try {
    if (typeof window !== "undefined") {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    }
  } catch (_) {
    // If already initialized or not supported, fallback to getFirestore
  }
  return getFirestore(app);
}

export const db = initFirestoreDb();
export const storage = getStorage(app);

// Safe Analytics initialization for browser environment
export const initAnalytics = async () => {
  if (typeof window !== "undefined" && await isSupported()) {
    return getAnalytics(app);
  }
  return null;
};

