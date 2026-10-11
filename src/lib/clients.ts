/**
 * src/lib/clients.ts
 * Centralización de detección y reglas de conversión para clientes especiales (Fall Creek, Vitafoods).
 */

export type ClientInput = 
  | string 
  | { 
      name?: string | null; 
      clientName?: string | null; 
      clientId?: string | null; 
      id?: string | null; 
      ownerName?: string | null; 
    } 
  | null 
  | undefined;

/**
 * Determina si una entidad, nombre o ID corresponde al cliente Fall Creek.
 */
export function isFallCreek(input: ClientInput): boolean {
  if (!input) return false;
  if (typeof input === 'string') {
    const upper = input.trim().toUpperCase();
    return upper === 'FALL CREEK' || upper === 'FALLCREEK' || upper === '76361536-7';
  }
  const name = (input.name || input.clientName || input.ownerName || '').trim().toUpperCase();
  const id = (input.clientId || input.id || '').trim().toUpperCase();
  return name === 'FALL CREEK' || name === 'FALLCREEK' || id === '76361536-7' || id === 'FALLCREEK' || id === 'FALL CREEK';
}

/**
 * Determina si una entidad, nombre o ID corresponde al cliente Vitafoods.
 */
export function isVitafood(input: ClientInput): boolean {
  if (!input) return false;
  if (typeof input === 'string') {
    const upper = input.trim().toUpperCase();
    return upper.includes('VITAFOOD');
  }
  const name = (input.name || input.clientName || input.ownerName || '').trim().toUpperCase();
  const id = (input.clientId || input.id || '').trim().toUpperCase();
  return name.includes('VITAFOOD') || id.includes('VITAFOOD');
}

/**
 * Calcula la equivalencia en bins según el cliente y la unidad de almacenamiento.
 * 
 * Reglas de negocio:
 * - Fall Creek: 1 pallet equivale a 3 bins.
 * - Pallet estándar (otros socios comerciales): 2 bins.
 * - Bins: 1 bin.
 */
export function binsPerUnit(client: ClientInput, unit?: string | null): number {
  const cleanUnit = (unit || '').trim().toLowerCase();
  if (cleanUnit === 'bins' || cleanUnit === 'bin') {
    return 1;
  }
  if (isFallCreek(client)) {
    return 3;
  }
  return 2;
}
