'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, DocumentData } from 'firebase/firestore';
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
    // Fetch all and filter in memory to support both single string and array exporterId
    const q = query(producersRef);
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: Producer[] = [];
      querySnapshot.forEach((doc) => {
        const producer = { id: doc.id, ...doc.data() } as Producer;
        
        // Check if the producer belongs to the selected exporter
        const belongsToExporter = Array.isArray(producer.exporterId)
            ? producer.exporterId.includes(exporterId)
            : producer.exporterId === exporterId;

        // Only include if associated with exporter and is active
        if (belongsToExporter && producer.status !== 'inactivo') {
            items.push(producer);
        }
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching producers for exporter ${exporterId}:`, error);
      setData([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [exporterId, firestore]);

  return { data, loading };
}
