'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { BinMaterial } from '@/lib/types';

export function useBinMaterialsByExporter(exporterId: string | null) {
  const [materials, setMaterials] = useState<BinMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const firestore = useFirestore();

  useEffect(() => {
    if (!firestore || !exporterId) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const materialsRef = collection(firestore, 'binMaterials');
    const q = query(materialsRef, where('exporterId', '==', exporterId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: BinMaterial[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as BinMaterial);
      });
      // Sort materials by product code
      items.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      setMaterials(items);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching bin materials for exporter ${exporterId}:`, error);
      setMaterials([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [exporterId, firestore]);

  return { materials, loading };
}
    