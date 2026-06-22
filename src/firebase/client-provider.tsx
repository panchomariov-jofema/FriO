
'use client';

import React, { useMemo, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';
import { Toaster } from '@/components/ui/toaster';
import { PwaRegistration } from '@/components/pwa-registration';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const firebaseServices = useMemo(() => {
    // Initialize Firebase on the client side, once per component mount.
    const sdks = initializeFirebase();

    if (typeof window !== 'undefined') {
      import('firebase/firestore').then(({ enableMultiTabIndexedDbPersistence }) => {
        enableMultiTabIndexedDbPersistence(sdks.firestore).catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn("Firestore offline persistence failed: multiple tabs open.");
          } else if (err.code === 'unimplemented') {
            console.warn("Firestore offline persistence not supported by browser.");
          } else {
            console.error("Error enabling Firestore offline persistence:", err);
          }
        });
      }).catch((err) => {
        console.error("Failed to load firestore SDK for offline persistence:", err);
      });
    }

    return sdks;
  }, []); // Empty dependency array ensures this runs only once on mount

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {children}
      <Toaster />
      <PwaRegistration />
    </FirebaseProvider>
  );
}
