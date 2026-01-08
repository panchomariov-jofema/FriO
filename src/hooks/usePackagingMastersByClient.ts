'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { PackagingMaster } from '@/lib/types';

export function usePackagingMastersByClient(clientId: string | null) {
  const [data, setData] = useState<PackagingMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore || !clientId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const mastersRef = collection(firestore, 'packagingMaster');
    const q = query(mastersRef, where('clientId', '==', clientId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: PackagingMaster[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as PackagingMaster);
      });
      setData(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching packaging masters for client ${clientId}:`, error);
      setData([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId, firestore]);

  return { data, loading };
}
