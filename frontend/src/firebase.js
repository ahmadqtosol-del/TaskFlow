import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDb14-NGoHcSFpWzjV-Q2sN4lKR5oj3g7Q",
  authDomain: "task-manager-b2156.firebaseapp.com",
  projectId: "task-manager-b2156",
  storageBucket: "task-manager-b2156.firebasestorage.app",
  messagingSenderId: "613087377755",
  appId: "1:613087377755:web:fcf892dce86292f49a027e",
  measurementId: "G-M3WJ6KNJ6W",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication
const auth = getAuth(app);

// Keep user logged in
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Persistence Error:", err);
});

// ---------------- Helper Functions ----------------

export const loginUser = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const registerUser = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);

export const logoutUser = () => signOut(auth);

export const resetPassword = async (email) => {
  await sendPasswordResetEmail(auth, email);
};

export const updateUserProfile = async (displayName, photoURL = null) => {
  if (!auth.currentUser) throw new Error("No user logged in");
  await updateProfile(auth.currentUser, {
    displayName,
    photoURL,
  });
};

export const updateUserEmail = async (email) => {
  if (!auth.currentUser) throw new Error("No user logged in");
  await updateEmail(auth.currentUser, email);
};

export const updateUserPassword = async (password) => {
  if (!auth.currentUser) throw new Error("No user logged in");
  await updatePassword(auth.currentUser, password);
};

export const reauthenticateUser = async (email, password) => {
  if (!auth.currentUser) throw new Error("No user logged in");
  const credential = EmailAuthProvider.credential(email, password);
  await reauthenticateWithCredential(auth.currentUser, credential);
};

export const getCurrentUser = () => auth.currentUser;

export const isUserLoggedIn = () => !!auth.currentUser;

export const getIdToken = async () => {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
};

export const getIdTokenResult = async () => {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdTokenResult();
};

// ========== EXPORT FOR MAIN APP ==========
export { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};