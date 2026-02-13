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

// Generates coordinates for chamber display, handling sequential and snake (FIFO) layouts.
export const getSortedCoordinates = (chamberConfig: Chamber, strategy: 'secuencial' | 'fifo'): string[] => {
  const coords: string[] = [];
  const columns = chamberConfig.columns.map(c => c.name);
  const rows = chamberConfig.rows;

  if (strategy === 'fifo') {
    // Vertical Snake pattern for FIFO storage logic
    columns.forEach((col, colIndex) => {
      const isEvenColumn = colIndex % 2 !== 0; // colIndex 0 (A) is odd, 1 (B) is even.
      const rowsToIterate = isEvenColumn ? [...rows].reverse() : rows;
      
      rowsToIterate.forEach(row => {
        const coord = `${col}${row}`;
        if (!chamberConfig.blocked?.includes(coord)) {
          coords.push(coord);
        }
      });
    });
  } else {
    // Default sequential layout for storage logic: A1-A12, B1-B12, etc.
    columns.forEach(col => {
      rows.forEach(row => {
        const coord = `${col}${row}`;
        if (!chamberConfig.blocked?.includes(coord)) {
          coords.push(coord);
        }
      });
    });
  }

  return coords;
};

// Paired / Z-pattern layout for Fall Creek
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
