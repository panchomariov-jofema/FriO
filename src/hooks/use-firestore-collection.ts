'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, DocumentData, orderBy, doc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export function useFirestoreCollection<T extends DocumentData>(collectionName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore) return;

    const q = query(collection(firestore, collectionName));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: T[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as T);
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching collection ${collectionName}:`, error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [collectionName, firestore]);

  return { data, loading };
}
