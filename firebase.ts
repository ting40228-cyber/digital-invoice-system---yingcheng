import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAYRIP91UA8blUilUZnbM261O7HLyRM3bo",
  authDomain: "copycityd-4b4cd.firebaseapp.com",
  projectId: "copycityd-4b4cd",
  storageBucket: "copycityd-4b4cd.firebasestorage.app",
  messagingSenderId: "235872321970",
  appId: "1:235872321970:web:db40619efce0b11908a4ab"
};

// 初始化 Firebase App
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// 初始化 Firestore
export const db: Firestore = getFirestore(app);

// 初始化 Auth
export const auth: Auth = getAuth(app);

export default app;
