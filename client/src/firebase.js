import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// ⚠️ REPLACE these values with your actual Firebase project config from the Firebase Console!
// Go to: Firebase Console -> Project Settings -> General -> Your Apps -> Web App -> Firebase SDK configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4TxzGkP6UMUm5U-9KpecZ5UPgRKcJW9I",
  authDomain: "send-101.firebaseapp.com",
  projectId: "send-101",
  storageBucket: "send-101.firebasestorage.app",
  messagingSenderId: "744589658272",
  appId: "1:744589658272:web:84519436235c13315221c5",
  measurementId: "G-82VGX008C9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firestore database
export const db = getFirestore(app);
