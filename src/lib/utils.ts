import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Chamber, DTEGuiaDespacho } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper for natural sorting (e.g., A1, A2, ... A10)
export const naturalSort = (a: string, b: string) => {
  const re = /(\d+)/;
  const aNum = parseInt(a.split(re)[1] || '0', 10);
  const bNum = parseInt(b.split(re)[1] || '0', 10);
  const aLetter = a.split(re)[0];
  const bLetter = b.split(re)[0];

  if (aLetter < bLetter) return -1;
  if (aLetter > bLetter) return 1;

  return aNum - bNum;
};

// Generates coordinates for chamber display, handling sequential, snake (FIFO), and aisle-access layouts.
export const getModeloSofCoordinates = (chamberConfig: Chamber): string[] => {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rowsAsc = [...chamberConfig.rows].sort((a, b) => a - b);
    const rowsDesc = [...rowsAsc].reverse();

    columns.forEach((col, idx) => {
        // Even index columns (A=0, C=2...) go Fondo -> Puerta (rowsDesc)
        // Odd index columns (B=1, D=3...) go Puerta -> Fondo (rowsAsc)
        const rowsToIterate = (idx % 2 === 0) ? rowsDesc : rowsAsc;
        rowsToIterate.forEach(row => {
            const coord = `${col}${row}`;
            if (!chamberConfig.blocked?.includes(coord)) {
                coords.push(coord);
            }
        });
    });

    return coords;
};

export const getFifoVerticalCoordinates = (chamberConfig: Chamber): string[] => {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rowsDesc = [...chamberConfig.rows].sort((a, b) => b - a);

    columns.forEach(col => {
        rowsDesc.forEach(row => {
            const coord = `${col}${row}`;
            if (!chamberConfig.blocked?.includes(coord)) {
                coords.push(coord);
            }
        });
    });

    return coords;
};

export const getSortedCoordinates = (chamberConfig: Chamber, strategy: 'secuencial' | 'fifo' | 'aisle-access' | 'horizontal-secuencial' | 'inverted-secuencial' | 'pareado' | 'serpentina-vertical' | 'modelo-sof' | 'fifo-vertical'): string[] => {
  if (strategy === 'fifo-vertical') {
    return getFifoVerticalCoordinates(chamberConfig);
  }

  if (strategy === 'modelo-sof') {
    return getModeloSofCoordinates(chamberConfig);
  }

  if (strategy === 'serpentina-vertical') {
    return getSerpentinaVerticalCoordinates(chamberConfig);
  }

  if (strategy === 'pareado') {
    return getPairedCoordinates(chamberConfig);
  }

  if (strategy === 'aisle-access') {
    return getAisleAccessCoordinates(chamberConfig, 'secuencial');
  }

  if (strategy === 'horizontal-secuencial') {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rows = chamberConfig.rows;
    rows.forEach(row => {
      columns.forEach(col => {
        const coord = `${col}${row}`;
        if (!chamberConfig.blocked?.includes(coord)) {
          coords.push(coord);
        }
      });
    });
    return coords;
  }

  const coords: string[] = [];
  const columns = chamberConfig.columns.map(c => c.name);
  const rows = chamberConfig.rows;

  columns.forEach((col, colIndex) => {
    let rowsToIterate: number[];

    // When in FIFO mode, odd columns (A, C, etc.) go down, even columns (B, D, etc.) go up.
    if (strategy === 'fifo') {
      const isEvenColumn = colIndex % 2 === 1; // A=0, B=1, C=2...
      rowsToIterate = isEvenColumn ? [...rows].reverse() : rows;
    } else if (strategy === 'inverted-secuencial') {
      // Start from the back (e.g., A12 -> A1)
      rowsToIterate = [...rows].reverse();
    } else {
      // In sequential mode, all columns go down (e.g., A1 -> A12).
      rowsToIterate = rows;
    }

    rowsToIterate.forEach(row => {
      const coord = `${col}${row}`;
      if (!chamberConfig.blocked?.includes(coord)) {
        coords.push(coord);
      }
    });
  });

  return coords;
};

/**
 * Aisle-access layout for Fall Creek (SAG sampling friendly).
 * Fills by Row: A-E, skip gap, H-L.
 */
export const getAisleAccessCoordinates = (chamberConfig: Chamber, strategy: 'secuencial' | 'fifo' | 'inverted-secuencial'): string[] => {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rows = [...chamberConfig.rows];

    // In FIFO or Inverted, we start from the back row
    const rowsToIterate = (strategy === 'fifo' || strategy === 'inverted-secuencial') ? rows.reverse() : rows;

    rowsToIterate.forEach(row => {
        // Group 1: Columns A to E
        columns.forEach(col => {
            if (['A', 'B', 'C', 'D', 'E'].includes(col)) {
                const coord = `${col}${row}`;
                if (!chamberConfig.blocked?.includes(coord)) {
                    coords.push(coord);
                }
            }
        });

        // Group 2: Columns H to L (skipping F, G) or H to O for large chambers
        columns.forEach(col => {
            // We skip F, G as they are the central "aisle"
            if (!['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(col)) {
                const coord = `${col}${row}`;
                if (!chamberConfig.blocked?.includes(coord)) {
                    coords.push(coord);
                }
            }
        });
    });

    return coords;
};

// Paired / Z-pattern layout for Fall Creek (Legacy/Specific)
export const getPairedCoordinates = (chamberConfig: Chamber): string[] => {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rows = chamberConfig.rows;

    // Process columns in pairs (A,B), (C,D), etc.
    for (let i = 0; i < columns.length; i += 2) {
        const col1Name = columns[i];
        const col2Name = i + 1 < columns.length ? columns[i + 1] : null;

        rows.forEach(row => {
            // Add from first column in the pair
            const coord1 = `${col1Name}${row}`;
            if (!chamberConfig.blocked?.includes(coord1)) {
                coords.push(coord1);
            }
            
            // If there's a second column in the pair, add from it
            if (col2Name) {
                const coord2 = `${col2Name}${row}`;
                if (!chamberConfig.blocked?.includes(coord2)) {
                    coords.push(coord2);
                }
            }
        });
    }
    return coords;
};

/**
 * Serpentina Vertical layout with central aisles.
 * Norte (Left block): A (door->back), B (back->door), C (door->back)...
 * Sur (Right block, from outside in): L (door->back), K (back->door), J (door->back)...
 */
export const getSerpentinaVerticalCoordinates = (chamberConfig: Chamber): string[] => {
    const coords: string[] = [];
    const columns = chamberConfig.columns.map(c => c.name);
    const rowsAsc = [...chamberConfig.rows].sort((a, b) => a - b);
    const rowsDesc = [...rowsAsc].reverse(); // door to back

    let norteCols: string[] = [];
    let surCols: string[] = [];

    const hasStandardCols = columns.some(c => ['A', 'B', 'C', 'D', 'E'].includes(c)) && columns.some(c => ['H', 'I', 'J', 'K', 'L'].includes(c));

    if (hasStandardCols) {
        norteCols = columns.filter(c => ['A', 'B', 'C', 'D', 'E'].includes(c));
        surCols = columns.filter(c => ['H', 'I', 'J', 'K', 'L'].includes(c)).reverse();
    } else {
        const mid = Math.floor(columns.length / 2);
        const aisleCount = columns.length % 2 === 0 ? 2 : 1;
        const leftEnd = mid - Math.floor(aisleCount / 2);
        norteCols = columns.slice(0, leftEnd);
        surCols = columns.slice(leftEnd + aisleCount).reverse();
    }

    const processBlock = (cols: string[]) => {
        cols.forEach((col, idx) => {
            const rowsToIterate = idx % 2 === 0 ? rowsDesc : rowsAsc;
            rowsToIterate.forEach(row => {
                const coord = `${col}${row}`;
                if (!chamberConfig.blocked?.includes(coord)) {
                    coords.push(coord);
                }
            });
        });
    };

    processBlock(norteCols);
    processBlock(surCols);

    return coords;
};

export function generateDteXml(doc: DTEGuiaDespacho): string {
  const escapeXml = (unsafe: any) => {
    const str = String(unsafe ?? '');
    return str.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
  };

  const formatRut = (rut: string | undefined): string => {
    if (!rut) return '';
    return rut.replace(/\./g, ''); // Remove all dots
  };

  const itemsXml = doc.detalle.map((item) => `
    <Detalle>
      <NroLinDet>${item.NroLinDet}</NroLinDet>
      <NmbItem>${escapeXml(item.NmbItem)}</NmbItem>
      <QtyItem>${item.QtyItem}</QtyItem>
      <UnmdItem>${escapeXml(item.UnmdItem)}</UnmdItem>
      <PrcItem>${item.PrcItem || 0}</PrcItem>
      <MontoItem>${item.MontoItem}</MontoItem>
    </Detalle>`).join('');

  const referenciasXml = (doc.referencias || []).map(ref => `
    <Referencia>
       <NroLinRef>${ref.NroLinRef}</NroLinRef>
       <TpoDocRef>${escapeXml(ref.TpoDocRef)}</TpoDocRef>
       <FolioRef>${ref.FolioRef}</FolioRef>
       <FchRef>${escapeXml(ref.FchRef)}</FchRef>
    </Referencia>`).join('');

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v1.0.xsd" version="1.0">
  <SetDTE ID="SetDoc">
    <Caratula version="1.0">
      <RutEmisor>${escapeXml(formatRut(doc.emisor.RUTEmisor))}</RutEmisor>
      <RutEnvia>${escapeXml(formatRut(doc.emisor.RUTEmisor))}</RutEnvia>
      <RutReceptor>${escapeXml(formatRut(doc.receptor.RUTRecep))}</RutReceptor>
      <FchResol>2024-01-01</FchResol>
      <NroResol>0</NroResol>
      <TmstFirmaEnv>${new Date().toISOString()}</TmstFirmaEnv>
      <SubTotDTE>
        <TpoDTE>${doc.idDoc.tipoDTE}</TpoDTE>
        <NroDTE>1</NroDTE>
      </SubTotDTE>
    </Caratula>
    <DTE version="1.0">
      <Documento ID="F${doc.idDoc.folio}T${doc.idDoc.tipoDTE}">
        <Encabezado>
          <IdDoc>
            <TipoDTE>${doc.idDoc.tipoDTE}</TipoDTE>
            <Folio>${doc.idDoc.folio}</Folio>
            <FchEmis>${escapeXml(doc.idDoc.fchEmis)}</FchEmis>
            <TipoDespacho>1</TipoDespacho>
            <IndTraslado>1</IndTraslado>
          </IdDoc>
          <Emisor>
            <RUTEmisor>${escapeXml(formatRut(doc.emisor.RUTEmisor))}</RUTEmisor>
            <RznSoc>${escapeXml(doc.emisor.RznSocEmisor)}</RznSoc>
            <GiroEmis>${escapeXml(doc.emisor.GiroEmis)}</GiroEmis>
            ${doc.emisor.Acteco ? `<Acteco>${doc.emisor.Acteco}</Acteco>` : ''}
            <DirOrigen>${escapeXml(doc.emisor.DirOrigen)}</DirOrigen>
            <CmnaOrigen>${escapeXml(doc.emisor.CmnaOrigen)}</CmnaOrigen>
          </Emisor>
          <Receptor>
            <RUTRecep>${escapeXml(formatRut(doc.receptor.RUTRecep))}</RUTRecep>
            <RznSocRecep>${escapeXml(doc.receptor.RznSocRecep)}</RznSocRecep>
            <GiroRecep>${escapeXml(doc.receptor.GiroRecep)}</GiroRecep>
            <DirRecep>${escapeXml(doc.receptor.DirRecep)}</DirRecep>
            <CmnaRecep>${escapeXml(doc.receptor.CmnaRecep)}</CmnaRecep>
            <CiudadRecep>${escapeXml(doc.receptor.CiudadRecep)}</CiudadRecep>
          </Receptor>
          ${doc.transporte ? `<Transporte>
            <Patente>${escapeXml(doc.transporte.Patente)}</Patente>
            <DirDest>${escapeXml(doc.transporte.DirDest)}</DirDest>
            <CmnaDest>${escapeXml(doc.transporte.CmnaDest)}</CmnaDest>
            <CiudadDest>${escapeXml(doc.transporte.CiudadDest)}</CiudadDest>
          </Transporte>` : ''}
          <Totales>
            <MntNeto>${doc.totales.MntNeto}</MntNeto>
            <MntExe>${doc.totales.MntExe || 0}</MntExe>
            <IVA>${doc.totales.IVA || 0}</IVA>
            <MntTotal>${doc.totales.MntTotal}</MntTotal>
          </Totales>
        </Encabezado>
        ${itemsXml}
        ${referenciasXml}
      </Documento>
    </DTE>
  </SetDTE>
</EnvioDTE>
`;
}

export function safeToDate(val: any): Date {
  if (!val) return new Date(NaN);
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate();
    } catch {
      // fallback
    }
  }
  if (val instanceof Date) {
    return val;
  }
  if (typeof val.toMillis === 'function') {
    try {
      return new Date(val.toMillis());
    } catch {
      // fallback
    }
  }
  if (typeof val === 'object') {
    const seconds = val.seconds !== undefined ? val.seconds : val._seconds;
    if (seconds !== undefined) {
      return new Date(seconds * 1000 + Math.floor((val.nanoseconds || val._nanoseconds || 0) / 1000000));
    }
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(NaN);
}

export function safeToMillis(val: any): number {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') {
    try {
      return val.toMillis();
    } catch {
      // fallback
    }
  }
  if (typeof val.getTime === 'function') {
    return val.getTime();
  }
  if (typeof val === 'object') {
    const seconds = val.seconds !== undefined ? val.seconds : val._seconds;
    if (seconds !== undefined) {
      return seconds * 1000 + Math.floor((val.nanoseconds || val._nanoseconds || 0) / 1000000);
    }
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const num = Number(val);
    if (!isNaN(num)) return num;
    const parsed = Date.parse(val as string);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export function safeStringCompare(a: any, b: any, options?: Intl.CollatorOptions): number {
  const strA = typeof a === 'string' ? a : (a !== null && a !== undefined ? String(a) : '');
  const strB = typeof b === 'string' ? b : (b !== null && b !== undefined ? String(b) : '');
  return strA.localeCompare(strB, undefined, options);
}

import { format as dateFnsFormat } from 'date-fns';

export function safeFormatDate(dateVal: any, formatStr: string, fallback: string = '-'): string {
  const date = safeToDate(dateVal);
  if (!date || isNaN(date.getTime())) {
    return fallback;
  }
  try {
    return dateFnsFormat(date, formatStr);
  } catch (err) {
    console.error("Error formatting date:", err, dateVal);
    return fallback;
  }
}

export function safeFormatQuantity(val: any, decimals: number = 2): string {
  const num = Number(val);
  if (isNaN(num) || num === 0) return "0";
  return Number.isInteger(num) ? num.toString() : parseFloat(num.toFixed(decimals)).toString();
}

export function formatLocaleDate(val: any, options?: Intl.DateTimeFormatOptions, fallback: string = 'Sin fecha'): string {
  const date = safeToDate(val);
  if (!date || isNaN(date.getTime())) return fallback;
  return date.toLocaleString('es-CL', options);
}

export function formatLocaleDateString(val: any, options?: Intl.DateTimeFormatOptions, fallback: string = 'Sin fecha'): string {
  const date = safeToDate(val);
  if (!date || isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('es-CL', options);
}

