import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore,
  Firestore,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAZ0uwpS0CRqv-xRA9ZgDglY4KNAHIpyHc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "classicworld-pos.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "classicworld-pos",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "classicworld-pos.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "173117682786",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:173117682786:web:dd32dad2ca345a1e36cd3b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-56JLQY2N4Y",
};

// Initialize Firebase safely for SSR & Client
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with persistent IndexedDB multi-tab cache in browser for instant zero-lag offline accounting,
// falling back to memory cache in SSR or restricted environments.
let dbInstance: Firestore;
try {
  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } else {
    dbInstance = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  }
} catch (_) {
  dbInstance = getFirestore(app);
}
export const db = dbInstance;

export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Analytics client-side only
export let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}
