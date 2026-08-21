import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  OAuthProvider,
  signOut, 
  onAuthStateChanged,
  updateProfile,
  type User as FirebaseUser 
} from "firebase/auth";
import { auth, db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export interface FirebaseUserProfile {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  role: string;
  activated: boolean;
  createdAt?: any;
}

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

/**
 * Sign in with Firebase Email and Password
 */
export async function loginWithFirebase(email: string, pass: string): Promise<FirebaseUserProfile> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
  const user = cred.user;
  
  try {
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as FirebaseUserProfile & { license_key?: string };
      return {
        ...data,
        activated: Boolean(data.activated && data.license_key),
      };
    }
  } catch (err) {
    console.warn("Firestore user lookup skipped:", err);
  }
  
  const profile: FirebaseUserProfile = {
    uid: user.uid,
    email: user.email || email,
    fullName: user.displayName || email.split("@")[0],
    businessName: "Classic World",
    role: "owner",
    activated: false,
    createdAt: new Date().toISOString(),
  };
  
  try {
    await setDoc(doc(db, "users", user.uid), profile, { merge: true });
  } catch (_) {}
  
  return profile;
}

/**
 * Sign up with Firebase Email and Password
 */
export async function signupWithFirebase(email: string, pass: string, fullName: string, businessName = "Classic World"): Promise<FirebaseUserProfile> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = cred.user;
  
  if (fullName) {
    await updateProfile(user, { displayName: fullName }).catch(() => {});
  }
  
  const newProfile: FirebaseUserProfile = {
    uid: user.uid,
    email: user.email || email,
    fullName: fullName || email.split("@")[0],
    businessName: businessName || "Classic World",
    role: "owner",
    activated: false,
    createdAt: new Date().toISOString(),
  };
  
  try {
    await setDoc(doc(db, "users", user.uid), newProfile, { merge: true });
  } catch (_) {}
  
  return newProfile;
}

/**
 * Sign in with Google Popup
 */
export async function loginWithFirebaseGoogle(): Promise<FirebaseUserProfile> {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  
  try {
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as FirebaseUserProfile & { license_key?: string };
      return {
        ...data,
        activated: Boolean(data.activated && data.license_key),
      };
    }
  } catch (err) {
    console.warn("Firestore user check warning:", err);
  }
  
  const newProfile: FirebaseUserProfile = {
    uid: user.uid,
    email: user.email || "",
    fullName: user.displayName || "Classic World User",
    businessName: "Classic World",
    role: "owner",
    activated: false, // User needs to enter license key to activate
    createdAt: new Date().toISOString(),
  };
  
  try {
    await setDoc(doc(db, "users", user.uid), newProfile, { merge: true });
  } catch (_) {}
  
  return newProfile;
}

/**
 * Sign in with Apple ID Popup
 */
export async function loginWithFirebaseApple(): Promise<FirebaseUserProfile> {
  const cred = await signInWithPopup(auth, appleProvider);
  const user = cred.user;
  
  try {
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as FirebaseUserProfile & { license_key?: string };
      return {
        ...data,
        activated: Boolean(data.activated && data.license_key),
      };
    }
  } catch (err) {
    console.warn("Firestore Apple user check warning:", err);
  }
  
  const newProfile: FirebaseUserProfile = {
    uid: user.uid,
    email: user.email || "",
    fullName: user.displayName || "Apple User",
    businessName: "Classic World",
    role: "owner",
    activated: false, // User needs to enter license key to activate
    createdAt: new Date().toISOString(),
  };
  
  try {
    await setDoc(doc(db, "users", user.uid), newProfile, { merge: true });
  } catch (_) {}
  
  return newProfile;
}

/**
 * Sign out from Firebase
 */
export async function logoutFromFirebase(): Promise<void> {
  await signOut(auth).catch(() => {});
}

/**
 * Observe Firebase Auth State
 */
export function onFirebaseUserChanged(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}
