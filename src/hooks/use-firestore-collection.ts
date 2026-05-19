'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export function useFirestoreCollection<T extends DocumentData>(collectionName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) return;

    // Use a simple collection query. Ordering can be added if specifically needed
    // for a feature, but a basic listener is more stable.
    const q = query(collection(firestore, collectionName));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: T[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as unknown as T);
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching collection ${collectionName}:`, error);
      setLoading(false);
    });

    // Cleanup function to unsubscribe from the listener when the component unmounts
    // or dependencies change.
    return () => unsubscribe();
  }, [collectionName, firestore]);

  return { data, loading };
}
