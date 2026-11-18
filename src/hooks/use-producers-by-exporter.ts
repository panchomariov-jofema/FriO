'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import type { Producer } from '@/lib/types';
import { FNO_EXPORTER_ID, normalizeEntityKey } from '@/lib/bins-rental-utils';

const EXPORTER_TENANT_NAMES = new Set(['SUBSOLE', 'MEYER', 'BLOSSOM']);

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
      const fallbackExporterProducers: Producer[] = [];

      querySnapshot.forEach((doc) => {
        const producer = { id: doc.id, ...doc.data() } as Producer;
        if (producer.status === 'inactivo') return;
        
        // Check if the producer belongs to the selected exporter
        const belongsToExporter = Array.isArray(producer.exporterId)
            ? producer.exporterId.includes(exporterId)
            : producer.exporterId === exporterId;

        if (belongsToExporter) {
            items.push(producer);
        } else if (exporterId === FNO_EXPORTER_ID) {
            const normName = normalizeEntityKey(producer.shortName || producer.name);
            if (EXPORTER_TENANT_NAMES.has(normName)) {
                fallbackExporterProducers.push(producer);
            }
        }
      });

      if (exporterId === FNO_EXPORTER_ID && fallbackExporterProducers.length > 0) {
        const existingNames = new Set(items.map(p => normalizeEntityKey(p.shortName || p.name)));
        fallbackExporterProducers.forEach(fp => {
          const normName = normalizeEntityKey(fp.shortName || fp.name);
          if (!existingNames.has(normName)) {
            items.push(fp);
            existingNames.add(normName);
          }
        });
      }

      items.sort((a, b) => {
        const nameA = a.shortName || a.name || '';
        const nameB = b.shortName || b.name || '';
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
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
