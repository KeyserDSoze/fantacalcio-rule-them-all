// Firebase config e inizializzazione
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: atob(atob("UVVsNllWTjVRbGh2VEVjM1pISlNhSFZHWkVoa2J6ZzBOa010ZEY4MFh6TXlOR1owY1V4Rg==")),
  authDomain: "fantacalcio-d69ab.firebaseapp.com",
  projectId: "fantacalcio-d69ab",
  storageBucket: "fantacalcio-d69ab.firebasestorage.app",
  messagingSenderId: "670848991219",
  appId: "1:670848991219:web:ed3fadfca26a9da7829c86",
  measurementId: "G-P3P451SNZW"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
