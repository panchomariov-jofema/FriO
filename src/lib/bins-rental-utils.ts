import type { BinMaterial, BinMaterialMovement, Exporter, Producer } from './types';

export const FNO_EXPORTER_ID = 'EXP005';
export const FNO_BIN_CODES = ['10016', '10017', '10018', '10019'];

/**
 * Normaliza un nombre para comparaciones flexibles (ej. "SUB SOLE", "SUB_SOLE" -> "SUBSOLE").
 */
export function normalizeEntityKey(value?: string | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function cleanRutKey(value?: string | null): string {
  if (!value) return '';
  return value.trim().toUpperCase().replace(/[^0-9K]/g, '');
}

/**
 * Determina si un material corresponde a un Bin (propio del exportador o arrendado de FÑO).
 */
export function isBinMaterialItem(item: {
  binMaterialCode?: string;
  binMaterialName?: string;
  type?: string;
}): boolean {
  if (item.type && item.type.toUpperCase().includes('BIN')) return true;
  if (item.binMaterialCode && FNO_BIN_CODES.includes(item.binMaterialCode)) return true;
  if (item.binMaterialCode && ['10001', '10007', '10011', '10015'].includes(item.binMaterialCode)) {
    return true;
  }
  if (item.binMaterialName && item.binMaterialName.toUpperCase().includes('BIN')) return true;
  return false;
}

/**
 * Dado un movimiento de FÑO (EXP005), determina si el receptor/arrendatario (producerId)
 * corresponde a un Exportador activo (ej. SUBSOLE -> EXP001, MEYER -> EXP002, BLOSSOM -> EXP003).
 * Si corresponde, retorna el `exporterId` de ese exportador para reflejar los bins en su inventario.
 */
export function resolveLeasedTargetExporterId(
  mov: Pick<BinMaterialMovement, 'exporterId' | 'producerId' | 'observation' | 'noAffectStock'>,
  exporters: Exporter[],
  producers?: Producer[]
): string | null {
  if (!mov || mov.exporterId !== FNO_EXPORTER_ID) return null;
  if (mov.observation === 'Despacho Directo') return null;
  if (mov.noAffectStock || (mov as any).isFruitDispatch) return null;

  const obsLower = (mov.observation || '').toLowerCase();
  if (obsLower.includes('transformaci') || obsLower.includes('traspaso interno')) return null;

  const rawProdId = (mov.producerId || '').trim();
  if (!rawProdId) return null;

  const targetExporters = (exporters || []).filter(
    (e) => e.exporterId && e.exporterId !== FNO_EXPORTER_ID && e.exporterId !== 'EXP004'
  );
  if (targetExporters.length === 0) return null;

  const byExporterId = targetExporters.find((e) => e.exporterId === rawProdId);
  if (byExporterId) return byExporterId.exporterId;

  const rutKey = cleanRutKey(rawProdId);
  const KNOWN_RUT_TO_EXPORTER_NAME: Record<string, string> = {
    '96615800K': 'SUBSOLE',
    '111111': 'SUBSOLE',
    '966888105': 'MEYER',
    '222222': 'MEYER',
    '77733624K': 'BLOSSOM',
    '333333': 'BLOSSOM',
  };

  const mappedName = KNOWN_RUT_TO_EXPORTER_NAME[rutKey];
  if (mappedName) {
    const matchedExp = targetExporters.find(
      (e) => normalizeEntityKey(e.name) === normalizeEntityKey(mappedName)
    );
    if (matchedExp) return matchedExp.exporterId;
  }

  if (producers && producers.length > 0) {
    const matchedProducer = producers.find(
      (p) =>
        p.id === rawProdId ||
        p.producerId === rawProdId ||
        (rutKey && (cleanRutKey(p.rut) === rutKey || cleanRutKey(p.producerId) === rutKey))
    );

    if (matchedProducer) {
      const prodKeys = new Set(
        [
          normalizeEntityKey(matchedProducer.name),
          normalizeEntityKey(matchedProducer.shortName),
        ].filter(Boolean)
      );

      const matchedExp = targetExporters.find((e) => prodKeys.has(normalizeEntityKey(e.name)));
      if (matchedExp) return matchedExp.exporterId;
    }
  }

  const rawNorm = normalizeEntityKey(rawProdId);
  if (rawNorm) {
    const matchedExp = targetExporters.find((e) => normalizeEntityKey(e.name) === rawNorm);
    if (matchedExp) return matchedExp.exporterId;
  }

  return null;
}

/**
 * Determina si en un movimiento de un exportador (distinto de FÑO), el "productor" seleccionado
 * es el mismo exportador (ej. SUBSOLE -> SUBSOLE al ingresar bins vacíos devueltos desde Packing).
 */
export function isExporterSelfMovement(
  mov: Pick<BinMaterialMovement, 'exporterId' | 'producerId' | 'packingId'>,
  exporters: Exporter[],
  producers: Producer[]
): boolean {
  if (!mov || mov.exporterId === FNO_EXPORTER_ID) return false;
  if (mov.packingId) return true;

  const exp = (exporters || []).find((e) => e.exporterId === mov.exporterId);
  if (!exp) return false;

  const expKey = normalizeEntityKey(exp.name);
  if (!expKey) return false;

  const rawProdId = (mov.producerId || '').trim();
  if (normalizeEntityKey(rawProdId) === expKey) return true;

  const rutKey = cleanRutKey(rawProdId);
  const matchedProducer = (producers || []).find(
    (p) =>
      p.id === rawProdId ||
      p.producerId === rawProdId ||
      (rutKey && (cleanRutKey(p.rut) === rutKey || cleanRutKey(p.producerId) === rutKey))
  );

  if (matchedProducer) {
    if (
      normalizeEntityKey(matchedProducer.name) === expKey ||
      normalizeEntityKey(matchedProducer.shortName) === expKey
    ) {
      return true;
    }
  }

  return false;
}
