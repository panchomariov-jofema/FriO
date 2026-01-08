'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Packing } from '@/lib/types';

export function usePackingsByExporter(exporterId: string | null) {
  const [data, setData] = useState<Packing[]>([]);
  const [loading, setLoading] = useState(false);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore || !exporterId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const packingsRef = collection(firestore, 'packings');
    const q = query(packingsRef, where('exporterId', '==', exporterId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: Packing[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Packing);
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching packings for exporter ${exporterId}:`, error);
      setData([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [exporterId, firestore]);

  return { data, loading };
}
