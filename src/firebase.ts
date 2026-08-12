import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDF7q-N7pVVhGCG3lLqObufs_VHBgmMHxo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "billing-1a3fd.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://billing-1a3fd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "billing-1a3fd",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "331452424886",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:331452424886:web:9f6e1ddd6ebc4787ff3c17"
};

let app;
let db: any = null;
let firestoreDb: any = null;

try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

export { db, firestoreDb };
