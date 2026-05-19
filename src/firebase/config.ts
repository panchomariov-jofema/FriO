import { initializeApp } from "firebase/app";

export const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "frigomanagerm1-96752421-f2f17",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:873975957236:web:34df8b97d4a5263ad380a1",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "frigomanagerm1-96752421-f2f17.firebaseapp.com",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "873975957236"
};

export const app = initializeApp(firebaseConfig);
