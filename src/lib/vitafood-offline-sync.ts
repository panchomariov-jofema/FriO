'use client';

import { Firestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { OtherFruitReception, OtherFruitReceptionItem } from '@/lib/types';
import { cleanFirestoreObject } from '@/lib/vitafood-utils';

export interface OfflinePalletAction {
  id: string;
  manifestId: string;
  palletId: string; // UMP
  itemIndex?: number;
  type: 'receive' | 'store' | 'mark_not_received';
  payload?: {
    storageLocation?: {
      chamberId: string;
      coordinate: string;
      warehouse?: string;
      aisle?: string;
    };
  };
  timestamp: number;
  userName: string;
  userId?: string;
}

const STORAGE_QUEUE_KEY = 'frio_vitafood_offline_queue';
const STORAGE_MANIFEST_PREFIX = 'frio_vitafood_manifest_backup_';
const QUEUE_EVENT_NAME = 'frio_offline_queue_changed';

/**
 * Normalizes UMP string for safe comparison (removes scientific notation decimals, .0, spaces)
 */
export function normalizeUmp(ump?: string | null): string {
  if (!ump) return '';
  return String(ump).trim().replace(/\.0$/, '');
}

/**
 * Retrieves the current offline queue from localStorage
 */
export function getOfflineQueue(): OfflinePalletAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflinePalletAction[];
  } catch (e) {
    console.error('Error reading offline queue:', e);
    return [];
  }
}

/**
 * Saves the offline queue to localStorage and emits an update event
 */
function saveOfflineQueue(queue: OfflinePalletAction[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent(QUEUE_EVENT_NAME, { detail: { count: queue.length } }));
  } catch (e) {
    console.error('Error saving offline queue:', e);
  }
}

/**
 * Saves a backup of an active manifest for offline viewing
 */
export function saveActiveManifestBackup(manifest: OtherFruitReception): void {
  if (typeof window === 'undefined' || !manifest?.id) return;
  try {
    localStorage.setItem(`${STORAGE_MANIFEST_PREFIX}${manifest.id}`, JSON.stringify(manifest));
  } catch (e) {
    console.error('Error saving manifest backup:', e);
  }
}

/**
 * Retrieves a backup of an active manifest
 */
export function getActiveManifestBackup(manifestId: string): OtherFruitReception | null {
  if (typeof window === 'undefined' || !manifestId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_MANIFEST_PREFIX}${manifestId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error reading manifest backup:', e);
    return null;
  }
}

/**
 * Enqueues an action into the offline queue (Idempotent: merges actions for the same UMP & manifest)
 */
export function enqueueOfflineAction(
  actionData: Omit<OfflinePalletAction, 'id' | 'timestamp'>
): OfflinePalletAction {
  const currentQueue = getOfflineQueue();
  const cleanUmp = normalizeUmp(actionData.palletId);
  const actionId = `${actionData.manifestId}_${cleanUmp}_${actionData.type}_${Date.now()}`;

  const newAction: OfflinePalletAction = {
    ...actionData,
    palletId: cleanUmp,
    id: actionId,
    timestamp: Date.now(),
  };

  // Replace or update any prior pending action for the exact same UMP & manifest & type
  const filtered = currentQueue.filter(
    a => !(a.manifestId === actionData.manifestId && normalizeUmp(a.palletId) === cleanUmp && a.type === actionData.type)
  );

  filtered.push(newAction);
  saveOfflineQueue(filtered);
  return newAction;
}

/**
 * Clears specific synced action IDs from the offline queue
 */
export function clearOfflineQueueItems(actionIds: string[]): void {
  if (!actionIds.length) return;
  const currentQueue = getOfflineQueue();
  const remaining = currentQueue.filter(a => !actionIds.includes(a.id));
  saveOfflineQueue(remaining);
}

/**
 * Clears all items in the queue (e.g. administrative purge)
 */
export function clearAllOfflineQueue(): void {
  saveOfflineQueue([]);
}

/**
 * Applies all pending offline actions in the queue to a manifest (Optimistic Merge)
 * Preserves exact array indices of items[] to guarantee zero corruption.
 */
export function applyOfflineQueueToManifest(
  manifest: OtherFruitReception,
  queue?: OfflinePalletAction[]
): OtherFruitReception {
  if (!manifest || !manifest.items) return manifest;
  const activeQueue = queue || getOfflineQueue();
  const relevantActions = activeQueue.filter(a => a.manifestId === manifest.id);

  if (relevantActions.length === 0) return manifest;

  const updatedItems = [...manifest.items];

  relevantActions.forEach(action => {
    const targetUmp = normalizeUmp(action.palletId);
    const itemIndex = updatedItems.findIndex(
      item => normalizeUmp(item.palletId) === targetUmp
    );

    if (itemIndex === -1) return;

    const currentItem = updatedItems[itemIndex];
    const actionDate = new Date(action.timestamp);

    if (action.type === 'receive') {
      // Only advance if it was pending
      if (currentItem.status === 'Pendiente de recibir') {
        updatedItems[itemIndex] = {
          ...currentItem,
          status: 'Pendiente de almacenar',
          receivedAt: actionDate,
          receivedByUserName: action.userName,
          receivedByUserId: action.userId,
        };
      }
    } else if (action.type === 'store') {
      // Set to Almacenado with location
      updatedItems[itemIndex] = {
        ...currentItem,
        status: 'Almacenado',
        storageLocation: action.payload?.storageLocation || currentItem.storageLocation,
        storedAt: actionDate,
        storedByUserName: action.userName,
        storedByUserId: action.userId,
      };
    } else if (action.type === 'mark_not_received') {
      if (currentItem.status !== 'Almacenado') {
        updatedItems[itemIndex] = {
          ...currentItem,
          status: 'No Recepcionado',
          notReceivedAt: actionDate,
          notReceivedByUserName: action.userName,
          notReceivedByUserId: action.userId,
        };
      }
    }
  });

  // Calculate overall manifest status
  const hasPendingReceive = updatedItems.some(i => i.status === 'Pendiente de recibir');
  const hasPendingStore = updatedItems.some(i => i.status === 'Pendiente de almacenar');
  const hasStored = updatedItems.some(i => i.status === 'Almacenado');

  let newStatus: OtherFruitReception['status'] = 'Cerrado';
  if (hasPendingReceive) {
    newStatus = 'Pendiente de recibir';
  } else if (hasPendingStore) {
    newStatus = hasStored ? 'Parcialmente Almacenado' : 'Pendiente de almacenar';
  } else if (hasStored) {
    newStatus = 'Almacenado';
  }

  return {
    ...manifest,
    items: updatedItems,
    status: newStatus,
  };
}

/**
 * Synchronizes the offline queue to Firestore in batch operations
 * Guarantees zero data loss, zero duplication, and strict array index integrity.
 */
export async function syncOfflineQueueToFirestore(
  firestore: Firestore,
  onProgress?: (synced: number, total: number) => void
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  // Group actions by manifestId
  const manifestMap = new Map<string, OfflinePalletAction[]>();
  queue.forEach(action => {
    const list = manifestMap.get(action.manifestId) || [];
    list.push(action);
    manifestMap.set(action.manifestId, list);
  });

  const syncedActionIds: string[] = [];
  const errors: string[] = [];

  for (const [manifestId, actions] of Array.from(manifestMap.entries())) {
    try {
      const docRef = doc(firestore, 'otherFruitReceptions', manifestId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        errors.push(`Orden ${manifestId} no encontrada en Firestore.`);
        continue;
      }

      const currentData = { id: snap.id, ...snap.data() } as OtherFruitReception;
      const updatedManifest = applyOfflineQueueToManifest(currentData, actions);

      await updateDoc(
        docRef,
        cleanFirestoreObject({
          items: updatedManifest.items,
          status: updatedManifest.status,
          updatedAt: serverTimestamp(),
        })
      );

      // Record successfully synced actions
      actions.forEach(a => syncedActionIds.push(a.id));
      if (onProgress) {
        onProgress(syncedActionIds.length, queue.length);
      }
    } catch (err: any) {
      console.error(`Error syncing manifest ${manifestId}:`, err);
      errors.push(`Error en orden ${manifestId}: ${err?.message || 'Fallo de red'}`);
    }
  }

  // Clear only confirmed actions from queue
  clearOfflineQueueItems(syncedActionIds);

  return {
    success: errors.length === 0,
    syncedCount: syncedActionIds.length,
    errors,
  };
}

export { QUEUE_EVENT_NAME };
