'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { BinMaterial } from '@/lib/types';
import { FNO_EXPORTER_ID, isBinMaterialItem } from '@/lib/bins-rental-utils';

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
    const q = exporterId === 'EXP004'
      ? query(materialsRef, where('code', '==', '10017'))
      : query(materialsRef, where('exporterId', '==', exporterId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: BinMaterial[] = [];
      querySnapshot.forEach((doc) => {
        const mat = { id: doc.id, ...doc.data() } as BinMaterial;
        if (mat.status === 'inactivo') return;
        items.push(mat);
      });
      // Sort: Bins first (own bins, then FÑO rental bins), followed by Totes, Laminas and other materials by code
      items.sort((a, b) => {
        const aIsBin = isBinMaterialItem(a);
        const bIsBin = isBinMaterialItem(b);
        if (aIsBin !== bIsBin) return aIsBin ? -1 : 1;
        if (aIsBin && bIsBin) {
          const aIsOwn = a.exporterId === exporterId;
          const bIsOwn = b.exporterId === exporterId;
          if (aIsOwn !== bIsOwn) return aIsOwn ? -1 : 1;
        }
        return a.code.localeCompare(b.code, undefined, { numeric: true });
      });
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
    