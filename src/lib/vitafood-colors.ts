import vitafoodCatalogJson from './vitafood-catalog.json';

const vitafoodCatalog: Record<string, number> = vitafoodCatalogJson as Record<string, number>;

// Mapa inverso: índice de catálogo -> código numérico de material (ej. 0 -> "15000004")
const catalogIndexToCode = new Map<number, string>();
for (const [key, idx] of Object.entries(vitafoodCatalog)) {
  if (/^\d+$/.test(key.trim())) {
    catalogIndexToCode.set(idx, key.trim());
  }
}

/**
 * Extrae o resuelve el código numérico de material Vitafood (ej. "15003271")
 * a partir de productCode y/o productName.
 */
export function resolveVitafoodMaterialCode(
  productCode?: string | null,
  productName?: string | null,
  dynamicNameToCodeMap?: Map<string, string>
): string {
  const cleanCode = (productCode || '').trim().toUpperCase().replace(/^MATERIAL\s+/i, '').trim();
  if (/^\d+$/.test(cleanCode)) {
    return cleanCode;
  }

  const cleanName = (productName || '').trim().toUpperCase();
  const nameWithoutPrefix = cleanName.replace(/^MATERIAL\s+/i, '').trim();
  if (/^\d+$/.test(nameWithoutPrefix)) {
    return nameWithoutPrefix;
  }

  if (dynamicNameToCodeMap) {
    if (cleanName && dynamicNameToCodeMap.has(cleanName)) {
      return dynamicNameToCodeMap.get(cleanName)!;
    }
    if (cleanCode && dynamicNameToCodeMap.has(cleanCode)) {
      return dynamicNameToCodeMap.get(cleanCode)!;
    }
  }

  if (cleanCode && typeof vitafoodCatalog[cleanCode] === 'number') {
    const mapped = catalogIndexToCode.get(vitafoodCatalog[cleanCode]);
    if (mapped) return mapped;
  }

  if (cleanName && typeof vitafoodCatalog[cleanName] === 'number') {
    const mapped = catalogIndexToCode.get(vitafoodCatalog[cleanName]);
    if (mapped) return mapped;
  }

  const digitsInCode = cleanCode.match(/\b(\d{6,10})\b/);
  if (digitsInCode) return digitsInCode[1];

  const digitsInName = cleanName.match(/\b(\d{6,10})\b/);
  if (digitsInName) return digitsInName[1];

  return cleanCode || cleanName || 'S/C';
}

/**
 * Formatea de manera uniforme la etiqueta visual como "MATERIAL <código>"
 */
export function formatVitafoodMaterialLabel(
  productCode?: string | null,
  productName?: string | null,
  dynamicNameToCodeMap?: Map<string, string>
): string {
  const code = resolveVitafoodMaterialCode(productCode, productName, dynamicNameToCodeMap);
  if (code.toUpperCase().startsWith('MATERIAL ')) {
    return code.toUpperCase();
  }
  return `MATERIAL ${code}`;
}

/**
 * Hash function for strings not found in catalog
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/**
 * Explicit color overrides requested by client or for key products
 */
const EXPLICIT_PRODUCT_OVERRIDES: Record<string, string> = {
  // 'ENV CAJA EXHIBIDORA CHERRIES 40 LB V1' explicitly requested as blue
  '15003309': 'hsl(217, 91%, 52%)',
  'ENV CAJA EXHIBIDORA CHERRIES 40 LB V1': 'hsl(217, 91%, 52%)',
};

/**
 * Returns a unique, persistent and deterministic HSL color for a Vitafood product
 * based on productCode or productName.
 */
export function getVitafoodProductColor(identifier: string): string {
  if (!identifier) return 'hsl(210, 20%, 50%)';

  const clean = identifier.trim().toUpperCase();

  // Check explicit overrides first
  if (EXPLICIT_PRODUCT_OVERRIDES[clean]) {
    return EXPLICIT_PRODUCT_OVERRIDES[clean];
  }
  for (const [key, color] of Object.entries(EXPLICIT_PRODUCT_OVERRIDES)) {
    if (clean.includes(key)) {
      return color;
    }
  }

  // Check catalog index
  let idx: number;
  if (typeof vitafoodCatalog[clean] === 'number') {
    idx = vitafoodCatalog[clean];
  } else {
    // Fallback: hash-based index outside catalog range
    idx = 1000 + (djb2Hash(clean) % 4000);
  }

  // Golden ratio angle distribution ensures zero hue repetition
  const hue = Math.round((idx * 137.507764) % 360);
  const sat = 78 + (idx % 3) * 8; // 78%, 86%, 94% (vibrant)
  const light = 44 + (Math.floor(idx / 3) % 4) * 4; // 44%, 48%, 52%, 56% (balanced)

  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Converts an HSL string 'hsl(h, s%, l%)' to HSLA with the given alpha transparency
 */
export function hslToHsla(hsl: string, alpha: number): string {
  if (hsl.startsWith('hsla')) {
    return hsl.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
  }
  if (hsl.startsWith('hsl')) {
    return hsl.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
  }
  return hsl;
}
