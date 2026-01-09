'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { BinMaterialStock, PackagingReception, ReceptionLot, OtherFruitReception, OtherFruitMovement, BinMaterialMovement } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Helper to convert array of objects to CSV
function convertToCSV(data: any[], headers: string[]) {
    const headerRow = headers.join(';');
    const rows = data.map(row => 
        headers.map(header => {
            let value = row[header];
            if (value instanceof Date) {
                value = value.toLocaleString();
            } else if (typeof value === 'object' && value !== null && value.toDate) { // Firebase Timestamp
                value = value.toDate().toLocaleString();
            }
            const stringValue = String(value ?? '');
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(';')
    );
    return [headerRow, ...rows].join('\n');
}


function downloadCSV(csvString: string, filename: string) {
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' }); // Add BOM for Excel
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


function BinMaterialStockReport() {
    const { data, loading } = useFirestoreCollection<BinMaterialStock>('binMaterialStock');

    const handleExport = () => {
        const headers = ['binMaterialCode', 'binMaterialName', 'quantity', 'exporterId'];
        const csv = convertToCSV(data, headers);
        downloadCSV(csv, 'reporte_stock_bins.csv');
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Stock de Bins y Materiales</CardTitle>
                    <CardDescription className="pt-2">Inventario actual de todos los bins y materiales.</CardDescription>
                </div>
                 <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || data.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Material</TableHead>
                                <TableHead>Cantidad</TableHead>
                                <TableHead>Exportador</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : data.length > 0 ? (
                                data.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.binMaterialCode}</TableCell>
                                        <TableCell>{item.binMaterialName}</TableCell>
                                        <TableCell>{item.quantity}</TableCell>
                                        <TableCell>{item.exporterId}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={4} className="h-24 text-center">No hay datos de stock.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function PackagingStockReport() {
    const { data, loading } = useFirestoreCollection<PackagingReception>('packagingReceptions');

    const flattenedData = React.useMemo(() => {
        return data.flatMap(reception => 
            reception.items
                .filter(item => item.status === 'Almacenado')
                .map(item => ({
                    id: `${reception.id}-${item.packagingMasterCode}`,
                    clientName: reception.clientName,
                    document: reception.document,
                    code: item.packagingMasterCode,
                    name: item.packagingMasterName,
                    pallets: item.palletCount,
                    location: `${item.storageLocation?.warehouse || ''} / ${item.storageLocation?.aisle || ''}`,
                    storedAt: item.storedAt,
                }))
        );
    }, [data]);

    const handleExport = () => {
        const headers = ['clientName', 'document', 'code', 'name', 'pallets', 'location', 'storedAt'];
        const csv = convertToCSV(flattenedData, headers);
        downloadCSV(csv, 'reporte_stock_embalajes.csv');
    };

    return (
        <Card>
             <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Stock de Embalajes</CardTitle>
                    <CardDescription className="pt-2">Inventario de pallets de embalaje almacenados.</CardDescription>
                </div>
                 <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || flattenedData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Cód. Artículo</TableHead>
                                <TableHead>Artículo</TableHead>
                                <TableHead>Cant. Pallets</TableHead>
                                <TableHead>Ubicación</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : flattenedData.length > 0 ? (
                                flattenedData.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.clientName}</TableCell>
                                        <TableCell>{item.code}</TableCell>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell>{item.pallets}</TableCell>
                                        <TableCell>{item.location}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay stock de embalajes.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function BinMaterialKardexReport() {
    const { data: movements, loading } = useFirestoreCollection<BinMaterialMovement>('binMaterialMovements');

    const kardexData = React.useMemo(() => {
        return movements.flatMap(mov => 
            mov.items.map((item: any, index: number) => ({
                key: `${mov.id}-${index}`,
                date: mov.createdAt.toDate(),
                type: mov.type,
                document: mov.document,
                producerId: mov.producerId,
                code: item.binMaterialCode,
                name: item.binMaterialName,
                quantity: mov.type === 'entrada' ? item.quantity : -item.quantity,
            }))
        ).sort((a,b) => b.date.getTime() - a.date.getTime());
    }, [movements]);

     const handleExport = () => {
        const headers = ['date', 'type', 'document', 'producerId', 'code', 'name', 'quantity'];
        const csv = convertToCSV(kardexData, headers);
        downloadCSV(csv, 'kardex_bins_y_materiales.csv');
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Kardex de Movimientos de Bins y Materiales</CardTitle>
                    <CardDescription className="pt-2">Historial de entradas y salidas.</CardDescription>
                </div>
                 <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || kardexData.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Documento</TableHead>
                                <TableHead>Productor</TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead>Material</TableHead>
                                <TableHead>Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : kardexData.length > 0 ? (
                                kardexData.map(item => (
                                    <TableRow key={item.key}>
                                        <TableCell>{item.date.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <Badge variant={item.type === 'entrada' ? 'default' : 'secondary'}>
                                                {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{item.document}</TableCell>
                                        <TableCell>{item.producerId}</TableCell>
                                        <TableCell>{item.code}</TableCell>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell className={item.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {item.quantity}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay movimientos.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function ReceptionLogReport() {
    const { data: receptionLots, loading } = useFirestoreCollection<ReceptionLot>('receptionLots');

     const handleExport = () => {
        const headers = ['createdAt', 'displayLotId', 'producerId', 'variety', 'binCount', 'status', 'totalWeight', 'pesoNeto'];
        const dataForExport = receptionLots.map(lot => {
            const pesoNeto = (lot.totalWeight && lot.totalWeight > 0)
                ? (lot.totalWeight - (lot.binCount * 65) + (lot.noTotes || 0))
                : null;
            return {
                ...lot,
                pesoNeto: pesoNeto !== null ? pesoNeto.toFixed(2) : ''
            };
        });
        const csv = convertToCSV(dataForExport, headers);
        downloadCSV(csv, 'registro_recepcion_fruta.csv');
    };
    
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Registro de Recepción de Fruta</CardTitle>
                    <CardDescription className="pt-2">Listado de todos los lotes ingresados.</CardDescription>
                </div>
                 <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || receptionLots.length === 0}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar CSV
                </Button>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha Ingreso</TableHead>
                                <TableHead>ID Lote</TableHead>
                                <TableHead>Productor</TableHead>
                                <TableHead>Variedad</TableHead>
                                <TableHead>N° Bins</TableHead>
                                <TableHead>Peso Total (kg)</TableHead>
                                <TableHead>Peso Neto (kg)</TableHead>
                                <TableHead>Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : receptionLots.length > 0 ? (
                                receptionLots.map(lot => {
                                    const pesoNeto = (lot.totalWeight && lot.totalWeight > 0)
                                        ? (lot.totalWeight - (lot.binCount * 65) + (lot.noTotes || 0))
                                        : null;

                                    return (
                                    <TableRow key={lot.id}>
                                        <TableCell>{lot.createdAt?.toDate().toLocaleString()}</TableCell>
                                        <TableCell>{lot.displayLotId}</TableCell>
                                        <TableCell>{lot.producerId}</TableCell>
                                        <TableCell>{lot.variety}</TableCell>
                                        <TableCell>{lot.binCount}</TableCell>
                                        <TableCell>{lot.totalWeight?.toFixed(2)}</TableCell>
                                        <TableCell>{pesoNeto !== null ? pesoNeto.toFixed(2) : '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={lot.status === 'Cerrado' ? 'default' : 'secondary'}>{lot.status}</Badge>
                                        </TableCell>
                                    </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow><TableCell colSpan={8} className="h-24 text-center">No hay lotes de recepción.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

function OtherFruitStockReport() {
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const [clientFilter, setClientFilter] = React.useState('');
    const [productFilter, setProductFilter] = React.useState('');

    const stockData = React.useMemo(() => {
        const stockMap: { [key: string]: { clientName: string, productCode: string, productName: string, unit: string, totalQuantity: number, locations: { loc: string, qty: number }[] } } = {};

        receptions.forEach(reception => {
            reception.items.forEach(item => {
                if (item.status === 'Almacenado' && item.quantity > 0) {
                    const key = `${reception.clientId}-${item.productCode}`;
                    if (!stockMap[key]) {
                        stockMap[key] = {
                            clientName: reception.clientName,
                            productCode: item.productCode,
                            productName: item.productName,
                            unit: reception.unit,
                            totalQuantity: 0,
                            locations: []
                        };
                    }
                    stockMap[key].totalQuantity += item.quantity;
                    if (item.storageLocation) {
                        stockMap[key].locations.push({
                            loc: `${item.storageLocation.chamberId} / ${item.storageLocation.coordinate}`,
                            qty: item.quantity
                        });
                    }
                }
            });
        });

        return Object.values(stockMap);
    }, [receptions]);
    
    const filteredData = React.useMemo(() => {
        return stockData.filter(item => {
            const clientMatch = clientFilter ? item.clientName.toLowerCase().includes(clientFilter.toLowerCase()) : true;
            const productMatch = productFilter ? item.productCode.toLowerCase().includes(productFilter.toLowerCase()) : true;
            return clientMatch && productMatch;
        });
    }, [stockData, clientFilter, productFilter]);
    
    const clientOptions = React.useMemo(() => {
        return [...new Set(stockData.map(item => item.clientName))];
    }, [stockData]);

    const handleExport = () => {
        const dataToExport = filteredData.map(item => ({
            "Cliente": item.clientName,
            "Codigo Producto": item.productCode,
            "Nombre Producto": item.productName,
            "Cantidad Total": item.totalQuantity,
            "Unidad": item.unit
        }));
        const headers = ["Cliente", "Codigo Producto", "Nombre Producto", "Cantidad Total", "Unidad"];
        const csv = convertToCSV(dataToExport, headers);
        downloadCSV(csv, 'reporte_stock_otros_clientes.csv');
    };
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Reporte de Stock de Fruta (Otros Clientes)</CardTitle>
                <CardDescription className="pt-2">Inventario consolidado de fruta de clientes externos en cámara.</CardDescription>
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Select onValueChange={(value) => setClientFilter(value === 'all' ? '' : value)} value={clientFilter || 'all'}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por cliente..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los Clientes</SelectItem>
                            {clientOptions.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input 
                        placeholder="Filtrar por código de producto..."
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                    />
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={loadingReceptions || filteredData.length === 0} className="w-full sm:w-auto">
                        <Download className="mr-2 h-4 w-4" />
                        Exportar CSV
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Cód. Producto</TableHead>
                                <TableHead>Producto</TableHead>
                                <TableHead>Cantidad Total</TableHead>
                                <TableHead>Unidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loadingReceptions ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : filteredData.length > 0 ? (
                                filteredData.map(item => (
                                    <TableRow key={`${item.clientName}-${item.productCode}`}>
                                        <TableCell>{item.clientName}</TableCell>
                                        <TableCell>{item.productCode}</TableCell>
                                        <TableCell>{item.productName}</TableCell>
                                        <TableCell className="font-semibold">{item.totalQuantity}</TableCell>
                                        <TableCell>{item.unit}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">No hay datos de stock para los filtros seleccionados.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

function OtherFruitKardexReport() {
    const { data: receptions, loading: loadingReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: movements, loading: loadingMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    
    const kardexData = React.useMemo(() => {
        const allMovements: any[] = [];
        
        receptions.forEach(reception => {
            reception.items.forEach((item, index) => {
                allMovements.push({
                    key: `${reception.id}-E-${index}`,
                    date: reception.createdAt,
                    type: 'entrada',
                    clientName: reception.clientName,
                    document: reception.document,
                    productCode: item.productCode,
                    productName: item.productName,
                    quantity: item.quantity,
                });
            });
        });

        movements.forEach(movement => {
            if (movement.type !== 'salida') return;
            movement.items.forEach((item, index) => {
                 allMovements.push({
                    key: `${movement.id}-S-${index}`,
                    date: movement.createdAt,
                    type: 'salida',
                    clientName: movement.clientName,
                    document: movement.document,
                    productCode: item.productCode,
                    productName: item.productName,
                    quantity: -item.quantity,
                });
            });
        });

        return allMovements.sort((a,b) => b.date.toMillis() - a.date.toMillis());
    }, [receptions, movements]);

    const [clientFilter, setClientFilter] = React.useState('');
    const [productFilter, setProductFilter] = React.useState('');
    
     const filteredData = React.useMemo(() => {
        return kardexData.filter(item => {
            const clientMatch = clientFilter ? item.clientName.toLowerCase().includes(clientFilter.toLowerCase()) : true;
            const productMatch = productFilter ? item.productCode.toLowerCase().includes(productFilter.toLowerCase()) : true;
            return clientMatch && productMatch;
        });
    }, [kardexData, clientFilter, productFilter]);

    const clientOptions = React.useMemo(() => {
        return [...new Set(kardexData.map(item => item.clientName))];
    }, [kardexData]);


    const handleExport = () => {
         const dataToExport = filteredData.map(item => ({
            "Fecha": item.date.toDate(),
            "Tipo": item.type,
            "Cliente": item.clientName,
            "Documento": item.document,
            "Codigo Producto": item.productCode,
            "Nombre Producto": item.productName,
            "Cantidad": item.quantity,
        }));
        const headers = ["Fecha", "Tipo", "Cliente", "Documento", "Codigo Producto", "Nombre Producto", "Cantidad"];
        const csv = convertToCSV(dataToExport, headers);
        downloadCSV(csv, 'kardex_fruta_otros_clientes.csv');
    };

    const loading = loadingReceptions || loadingMovements;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Kardex de Movimientos de Fruta (Otros Clientes)</CardTitle>
                <CardDescription className="pt-2">Historial de entradas y salidas de fruta de clientes externos.</CardDescription>
                 <div className="flex flex-col sm:flex-row gap-4 pt-4">
                    <Select onValueChange={(value) => setClientFilter(value === 'all' ? '' : value)} value={clientFilter || 'all'}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por cliente..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los Clientes</SelectItem>
                            {clientOptions.map(client => <SelectItem key={client} value={client}>{client}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Input 
                        placeholder="Filtrar por código de producto..."
                        value={productFilter}
                        onChange={(e) => setProductFilter(e.target.value)}
                    />
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || filteredData.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Exportar CSV
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha/Hora</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Documento</TableHead>
                                <TableHead>Cód. Prod.</TableHead>
                                <TableHead>Producto</TableHead>
                                <TableHead>Cantidad</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>)
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item) => (
                                <TableRow key={item.key}>
                                    <TableCell>{item.date.toDate().toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Badge variant={item.type === 'entrada' ? 'default' : 'secondary'}>
                                            {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{item.clientName}</TableCell>
                                    <TableCell>{item.document}</TableCell>
                                    <TableCell>{item.productCode}</TableCell>
                                    <TableCell>{item.productName}</TableCell>
                                    <TableCell className={item.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                                        {item.quantity}
                                    </TableCell>
                                </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center">No hay movimientos para los filtros seleccionados.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}


export default function ReportesPage() {
    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Módulo de Reportes</CardTitle>
                    <CardDescription>Acceda a reportes tabulares para un análisis más profundo y exportación de datos.</CardDescription>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <BinMaterialStockReport />
                <PackagingStockReport />
            </div>
            <div className="space-y-6">
                <BinMaterialKardexReport />
                <ReceptionLogReport />
                <OtherFruitStockReport />
                <OtherFruitKardexReport />
            </div>
        </div>
    );
}
