'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { ChevronRight, Settings, Eye, EyeOff } from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { ReportSetting } from '@/lib/types';
import { collection, doc, setDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const reportList = [
    { 
        id: 'stock-bins',
        title: 'Stock de Bins y Mat. En Planta', 
        description: 'Inventario actual de todos los bins y materiales en planta.',
        href: '/reportes/stock-bins-materiales'
    },
    {
        id: 'saldo-productor',
        title: "Saldo por Exp/Productor",
        description: "Consolidado de materiales entregados y devueltos por productor.",
        href: "/reportes/saldo-por-productor"
    },
    { 
        id: 'stock-embalajes',
        title: 'Stock de Embalajes', 
        description: 'Inventario de pallets de embalaje almacenados.',
        href: '/reportes/stock-embalajes'
    },
    { 
        id: 'kardex-bins',
        title: 'Kardex de Movimientos de Bins y Materiales', 
        description: 'Historial detallado de entradas, salidas y saldos iniciales históricos.',
        href: '/reportes/kardex-bins-materiales'
    },
    { 
        id: 'recepcion-fruta',
        title: 'Registro de Recepción de Fruta', 
        description: 'Listado de todos los lotes ingresados.',
        href: '/reportes/log-recepcion-fruta'
    },
    { 
        id: 'stock-ubicacion-otros',
        title: 'Reporte Stock por Ubicacion (Otros Clientes)', 
        description: 'Inventario de fruta de clientes externos detallado por ubicación.',
        href: '/reportes/stock-fruta-otros-clientes'
    },
    { 
        id: 'kardex-fruta-otros',
        title: 'Kardex de Movimientos de Fruta (Otros Clientes)', 
        description: 'Historial de entradas y salidas de fruta de clientes externos.',
        href: '/reportes/kardex-fruta-otros-clientes'
    },
    { 
        id: 'despachos-packing',
        title: 'Reporte de Despachos a Packing', 
        description: 'Listado de todos los despachos de fruta creados.',
        href: '/reportes/despachos'
    },
    { 
        id: 'registro-temperaturas',
        title: 'Registro de Temperaturas', 
        description: 'Historial de todas las temperaturas registradas en las cámaras.',
        href: '/reportes/registro-temperaturas'
    },
    {
        id: 'permanencia-stock',
        title: "Permanencia Stock (Otros Clientes)",
        description: "Calcula los días de permanencia del stock de fruta de otros clientes.",
        href: "/reportes/permanencia-stock-otros-clientes"
    },
];

export default function ReportesPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    const isAdmin = user?.email === 'francisco.villarreal@outlook.es';

    const reportSettingsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'reportSettings');
    }, [firestore]);

    const { data: settings, isLoading: loadingSettings } = useCollection<ReportSetting>(reportSettingsQuery);

    const hiddenReportIds = React.useMemo(() => {
        if (!settings) return new Set<string>();
        return new Set(settings.filter(s => s.hidden).map(s => s.reportId));
    }, [settings]);

    const handleToggleVisibility = (reportId: string, isHidden: boolean) => {
        if (!firestore) return;
        const settingRef = doc(firestore, 'reportSettings', reportId);
        setDoc(settingRef, {
            reportId,
            hidden: isHidden
        }, { merge: true });
    };

    const visibleReports = React.useMemo(() => {
        if (isAdmin) return reportList;
        return reportList.filter(report => !hiddenReportIds.has(report.id));
    }, [isAdmin, hiddenReportIds]);

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle>Módulo de Reportes</CardTitle>
                    <CardDescription>Acceda a reportes tabulares para un análisis más profundo y exportación de datos.</CardDescription>
                </CardHeader>
            </Card>

            {isAdmin && (
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="flex flex-row items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-lg">Herramientas de Administrador</CardTitle>
                            <CardDescription>Oculte reportes temporalmente para los usuarios del sistema.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {reportList.map(report => (
                                <div key={report.id} className="flex items-center justify-between p-3 border rounded-md bg-background shadow-sm">
                                    <div className="flex flex-col">
                                        <Label className="font-semibold text-xs mb-1">{report.title}</Label>
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                            {hiddenReportIds.has(report.id) ? (
                                                <><EyeOff className="h-3 w-3" /> Oculto</>
                                            ) : (
                                                <><Eye className="h-3 w-3" /> Visible</>
                                            )}
                                        </div>
                                    </div>
                                    <Switch 
                                        checked={!hiddenReportIds.has(report.id)}
                                        onCheckedChange={(checked) => handleToggleVisibility(report.id, !checked)}
                                    />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loadingSettings ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                    ))
                ) : visibleReports.map(report => (
                    <Link href={report.href} key={report.id} className="block">
                        <Card className={`hover:border-primary/80 hover:shadow-md transition-all h-full ${hiddenReportIds.has(report.id) ? 'opacity-60 border-dashed' : ''}`}>
                            <CardHeader>
                                <div className='flex justify-between items-start'>
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            {report.title}
                                            {isAdmin && hiddenReportIds.has(report.id) && (
                                                <Badge variant="secondary" className="text-[10px] h-4">Oculto</Badge>
                                            )}
                                        </CardTitle>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <CardDescription className="pt-2">{report.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>

            {visibleReports.length === 0 && !loadingSettings && (
                <div className="text-center p-12 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">No hay reportes disponibles en este momento.</p>
                </div>
            )}
        </div>
    );
}