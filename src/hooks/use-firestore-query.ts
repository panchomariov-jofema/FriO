'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, query, QueryConstraint, DocumentData } from 'firebase/firestore';
import { useFirestore } from '@/firebase';

export function useFirestoreQuery<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const firestore = useFirestore();

  // Serializar tipos y valores para controlar dependencias estables
  const constraintsKey = JSON.stringify(
    constraints.map(c => {
      // Intentar extraer una representación determinista del constraint
      return (c as any)._queryConstraintType || (c as any).type || 'constraint';
    })
  );

  const constraintsRef = useRef<QueryConstraint[]>(constraints);
  constraintsRef.current = constraints;

  useEffect(() => {
    if (!firestore) return;

    let unsubscribe = () => {};

    try {
      const collRef = collection(firestore, collectionName);
      const activeConstraints = constraintsRef.current || [];
      const q = activeConstraints.length > 0
        ? query(collRef, ...activeConstraints)
        : query(collRef);

      unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const items: T[] = [];
          querySnapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() } as unknown as T);
          });
          setData(items);
          setLoading(false);
        },
        (error) => {
          console.error(`Error querying collection ${collectionName}:`, error);
          setLoading(false);
        }
      );
    } catch (err) {
      console.error(`Error setting up query for ${collectionName}:`, err);
      setLoading(false);
    }

    return () => unsubscribe();
  }, [collectionName, firestore, constraintsKey]);

  return { data, loading };
}
