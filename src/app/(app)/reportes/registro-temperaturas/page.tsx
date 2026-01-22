'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { ChamberTemperature } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { chambersConfig } from '@/lib/chambers-config';

function convertToCSV(data: any[], headers: { key: string, label: string }[]) {
    const headerRow = headers.map(h => h.label).join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header.key];
            if (value instanceof Date) {
                value = value.toLocaleString('es-CL');
            } else if (typeof value === 'object' && value !== null && value.toDate) { // Firebase Timestamp
                value = value.toDate().toLocaleString('es-CL');
            }
            const stringValue = String(value ?? '');
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}

function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export default function TemperatureLogReportPage() {
    const { data: temperatures, loading } = useFirestoreCollection<ChamberTemperature>('chamberTemperatures');

    const sortedData = React.useMemo(() => {
        if (!temperatures) return [];
        return [...temperatures].sort((a, b) => (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0));
    }, [temperatures]);

    const handleExport = () => {
        if (!sortedData) return;
        const headers = [
            { key: 'timestamp', label: 'Fecha y Hora' },
            { key: 'chamberName', label: 'Cámara' },
            { key: 'temperature', label: 'Temperatura (°C)' },
            { key: 'userName', label: 'Usuario' }
        ];

        const dataForExport = sortedData.map(t => ({
            ...t,
            chamberName: chambersConfig[t.chamberId]?.name || t.chamberId,
            userName: t.userName || (t.userId ? 'Usuario Desconocido' : 'N/A')
        }));
        
        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'registro_temperaturas.csv');
    };
    
    return (
        <div className="space-y-6">
            <ReportHeader
                title="Registro de Temperaturas"
                description="Historial de todas las temperaturas registradas en las cámaras."
                onExport={handleExport}
                isExportDisabled={loading || !sortedData || sortedData.length === 0}
            />
            <Card>
                <CardContent className="pt-6">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha y Hora</TableHead>
                                    <TableHead>Cámara</TableHead>
                                    <TableHead>Temperatura</TableHead>
                                    <TableHead>Usuario</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 10 }).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                                ) : sortedData && sortedData.length > 0 ? (
                                    sortedData.map(temp => (
                                        <TableRow key={temp.id}>
                                            <TableCell>{temp.timestamp?.toDate().toLocaleString('es-CL')}</TableCell>
                                            <TableCell>{chambersConfig[temp.chamberId]?.name || temp.chamberId}</TableCell>
                                            <TableCell>{temp.temperature.toFixed(1)} °C</TableCell>
                                            <TableCell>{temp.userName || (temp.userId ? 'Usuario Desconocido' : 'N/A')}</TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay temperaturas registradas.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
