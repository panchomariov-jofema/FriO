'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

const reportList = [
    { 
        title: 'Stock de Bins y Materiales', 
        description: 'Inventario actual de todos los bins y materiales.',
        href: '/reportes/stock-bins-materiales'
    },
    { 
        title: 'Stock de Embalajes', 
        description: 'Inventario de pallets de embalaje almacenados.',
        href: '/reportes/stock-embalajes'
    },
    { 
        title: 'Kardex de Movimientos de Bins y Materiales', 
        description: 'Historial de entradas y salidas.',
        href: '/reportes/kardex-bins-materiales'
    },
    { 
        title: 'Registro de Recepción de Fruta', 
        description: 'Listado de todos los lotes ingresados.',
        href: '/reportes/log-recepcion-fruta'
    },
    { 
        title: 'Reporte de Stock de Fruta (Otros Clientes)', 
        description: 'Inventario consolidado de fruta de clientes externos en cámara.',
        href: '/reportes/stock-fruta-otros-clientes'
    },
    { 
        title: 'Kardex de Movimientos de Fruta (Otros Clientes)', 
        description: 'Historial de entradas y salidas de fruta de clientes externos.',
        href: '/reportes/kardex-fruta-otros-clientes'
    },
];

export default function ReportesPage() {
    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Módulo de Reportes</CardTitle>
                    <CardDescription>Acceda a reportes tabulares para un análisis más profundo y exportación de datos.</CardDescription>
                </CardHeader>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reportList.map(report => (
                    <Link href={report.href} key={report.href} className="block">
                        <Card className="hover:border-primary/80 hover:shadow-md transition-all h-full">
                            <CardHeader>
                                <div className='flex justify-between items-start'>
                                    <CardTitle className="text-lg">{report.title}</CardTitle>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <CardDescription className="pt-2">{report.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
