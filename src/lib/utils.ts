import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Chamber } from './types';

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

// Sequential or "Snake" (FIFO) layout.
export const getSortedCoordinates = (chamberConfig: Chamber, strategy?: 'secuencial' | 'fifo'): string[] => {
  if (strategy === 'fifo') {
    const coords: string[] = [];
    chamberConfig.columns.forEach((col, colIndex) => {
      const isOddColumn = colIndex % 2 !== 0;
      
      const unblockedRows = chamberConfig.rows.filter(row => !chamberConfig.blocked?.includes(`${col.name}${row}`));
      
      const rowsToIterate = isOddColumn ? [...unblockedRows].reverse() : unblockedRows;

      rowsToIterate.forEach(row => {
        coords.push(`${col.name}${row}`);
      });
    });
    return coords;
  }
  
  // Default to sequential column-by-column sort
  return chamberConfig.columns
    .flatMap(col => chamberConfig.rows.map(row => `${col.name}${row}`))
    .filter(coord => !chamberConfig.blocked?.includes(coord))
    .sort(naturalSort);
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

export function generateDteXml(doc: any): string {
  // Hardcoded Emitter data - This should ideally come from a config
  const emisor = {
    RUT: '76.123.456-7',
    RazonSocial: 'FRIGO MANAGER SPA',
    Giro: 'SERVICIOS DE FRIGORIFICO',
    Direccion: 'AV. FRUTOS DEL PAIS 123',
    Comuna: 'QUILICURA',
    Ciudad: 'SANTIAGO'
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp?.toDate) return new Date().toISOString().split('T')[0];
    return timestamp.toDate().toISOString().split('T')[0];
  };

  const formatDateTime = (timestamp: any) => {
     if (!timestamp?.toDate) return new Date().toISOString();
     return timestamp.toDate().toISOString();
  }

  const escapeXml = (unsafe: string) => {
    if (typeof unsafe !== 'string') {
      return '';
    }
    return unsafe.replace(/[<>&'"]/g, (c) => {
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

  const itemsXml = doc.items.map((item: any, index: number) => `
    <Detalle>
      <NroLinDet>${index + 1}</NroLinDet>
      <CdgItem>
        <TpoCodigo>INT1</TpoCodigo>
        <VlrCodigo>${escapeXml(item.codigo)}</VlrCodigo>
      </CdgItem>
      <NmbItem>${escapeXml(item.descripcion)}</NmbItem>
      <QtyItem>${item.cantidad}</QtyItem>
      <UnmdItem>${escapeXml(item.unidad_medida)}</UnmdItem>
    </Detalle>`).join('');

  const folio = doc.sourceMovementId ? doc.sourceMovementId.substring(0, 10) : 'S/F';

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v1.0.xsd" version="1.0">
  <SetDTE ID="SetDoc">
    <Caratula version="1.0">
      <RutEmisor>${emisor.RUT}</RutEmisor>
      <RutEnvia>${emisor.RUT}</RutEnvia>
      <RutReceptor>${escapeXml(doc.receptor.rut)}</RutReceptor>
      <FchResol>2024-01-01</FchResol>
      <NroResol>0</NroResol>
      <TmstFirmaEnv>${formatDateTime(new Date())}</TmstFirmaEnv>
      <SubTotDTE>
        <TpoDTE>52</TpoDTE>
        <NroDTE>1</NroDTE>
      </SubTotDTE>
    </Caratula>
    <DTE version="1.0">
      <Documento ID="F${folio}T52">
        <Encabezado>
          <IdDoc>
            <TipoDTE>52</TipoDTE>
            <Folio>${folio}</Folio>
            <FchEmis>${formatDate(doc.fecha_salida)}</FchEmis>
            <TipoDespacho>1</TipoDespacho>
            <IndTraslado>1</IndTraslado>
          </IdDoc>
          <Emisor>
            <RUTEmisor>${emisor.RUT}</RUTEmisor>
            <RznSoc>${emisor.RazonSocial}</RznSoc>
            <GiroEmis>${emisor.Giro}</GiroEmis>
            <DirOrigen>${emisor.Direccion}</DirOrigen>
            <CmnaOrigen>${emisor.Comuna}</CmnaOrigen>
            <CiudadOrigen>${emisor.Ciudad}</CiudadOrigen>
          </Emisor>
          <Receptor>
            <RUTRecep>${escapeXml(doc.receptor.rut)}</RUTRecep>
            <RznSocRecep>${escapeXml(doc.receptor.razon_social)}</RznSocRecep>
            <GiroRecep>${escapeXml(doc.receptor.giro)}</GiroRecep>
            <DirRecep>${escapeXml(doc.receptor.direccion)}</DirRecep>
            <CmnaRecep>${escapeXml(doc.receptor.comuna)}</CmnaRecep>
            <CiudadRecep>${escapeXml(doc.receptor.ciudad)}</CiudadRecep>
          </Receptor>
          <Transporte>
            <Patente>${escapeXml(doc.documento.patente_vehiculo)}</Patente>
            <DirDest>${escapeXml(doc.receptor.direccion)}</DirDest>
            <CmnaDest>${escapeXml(doc.receptor.comuna)}</CmnaDest>
            <CiudadDest>${escapeXml(doc.receptor.ciudad)}</CiudadDest>
          </Transporte>
          <Totales>
            <MntTotal>0</MntTotal>
          </Totales>
        </Encabezado>
        ${itemsXml}
        <Referencia>
           <NroLinRef>1</NroLinRef>
           <CodRef>1</CodRef>
           <RazonRef>${escapeXml(doc.documento.observaciones)}</RazonRef>
        </Referencia>
      </Documento>
    </DTE>
  </SetDTE>
</EnvioDTE>
`;
}
