'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Producer } from '@/lib/types';

export function useProducersByExporter(exporterId: string | null) {
  const [data, setData] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(false);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore || !exporterId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const producersRef = collection(firestore, 'producers');
    const q = query(producersRef, where('exporterId', '==', exporterId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: Producer[] = [];
      querySnapshot.forEach((doc) => {
        const producer = { id: doc.id, ...doc.data() } as Producer;
        // Only include active producers or those without a status property yet
        if (producer.status !== 'inactivo') {
            items.push(producer);
        }
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching producers for exporter ${exporterId}:`, error);
      // Aquí podrías emitir un error global o mostrar un toast si lo prefieres
      setData([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [exporterId, firestore]);

  return { data, loading };
}
