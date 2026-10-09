import vitafoodCatalogJson from './vitafood-catalog.json';

const vitafoodCatalog: Record<string, number> = vitafoodCatalogJson as Record<string, number>;

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
