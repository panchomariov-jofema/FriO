
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import { 
    ChevronRight, 
    Settings, 
    Eye, 
    EyeOff,
    Package,
    Calculator,
    Box,
    Table2,
    ClipboardList,
    MapPin,
    History,
    Truck,
    Thermometer,
    Clock
} from 'lucide-react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { ReportSetting } from '@/lib/types';
import { collection, doc, setDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const reportList = [
    { 
        id: 'stock-bins',
        title: 'Stock de Bins y Mat. En Planta', 
        description: 'Vea cuántos bins y materiales vacíos hay disponibles en el frigorífico ahora mismo. Útil para saber qué entregar a los productores.',
        href: '/reportes/stock-bins-materiales',
        icon: Package,
        color: 'text-blue-500',
        image: PlaceHolderImages.find(img => img.id === 'report-stock')
    },
    {
        id: 'saldo-productor',
        title: "Saldo de Bins y Mat. Entregados",
        description: "Revise la cuenta de cada productor: cuántos materiales se llevaron al campo y cuántos han devuelto a la planta hasta hoy.",
        href: "/reportes/saldo-por-productor",
        icon: Calculator,
        color: 'text-green-500',
        image: PlaceHolderImages.find(img => img.id === 'report-accounting')
    },
    { 
        id: 'kardex-bins',
        title: 'Kardex de Movimientos de Bins', 
        description: 'El historial completo de cada entrada y salida registrada. Es el libro de actas detallado de todos los movimientos de materiales.',
        href: '/reportes/kardex-bins-materiales',
        icon: Table2,
        color: 'text-indigo-500',
        image: PlaceHolderImages.find(img => img.id === 'report-logistics')
    },
    { 
        id: 'recepcion-fruta',
        title: 'Registro de Recepción de Fruta', 
        description: 'Listado cronológico de todos los lotes de fruta que han ingresado por portería, incluyendo sus pesos y estados actuales.',
        href: '/reportes/log-recepcion-fruta',
        icon: ClipboardList,
        color: 'text-emerald-500',
        image: PlaceHolderImages.find(img => img.id === 'report-fruit')
    },
    { 
        id: 'stock-ubicacion-otros',
        title: 'Stock por Ubicación (Socios)', 
        description: 'Mapa detallado de dónde se encuentran almacenados los Bins de nuestros Clientes, especificando N° de Cámara y ubicación exacta.',
        href: '/reportes/stock-fruta-otros-clientes',
        icon: MapPin,
        color: 'text-rose-500',
        image: PlaceHolderImages.find(img => img.id === 'report-chamber')
    },
    { 
        id: 'kardex-fruta-otros',
        title: 'Movimientos de Fruta (Socios)', 
        description: 'Historial de entradas y salidas de fruta de terceros. Permite ver cuándo llegó y cuándo se despachó cada artículo.',
        href: '/reportes/kardex-fruta-otros-clientes',
        icon: History,
        color: 'text-purple-500',
        image: PlaceHolderImages.find(img => img.id === 'report-logistics')
    },
    { 
        id: 'despachos-packing',
        title: 'Reporte de Despachos a Packing', 
        description: 'Consulte todos los camiones que han salido cargados hacia el proceso de embalaje, con el detalle de kilos y lotes enviados.',
        href: '/reportes/despachos',
        icon: Truck,
        color: 'text-orange-500',
        image: PlaceHolderImages.find(img => img.id === 'report-truck')
    },
    { 
        id: 'registro-temperaturas',
        title: 'Registro de Temperaturas', 
        description: 'Bitácora histórica de las mediciones de frío realizadas en cada una de las cámaras para asegurar la cadena de frío.',
        href: '/reportes/registro-temperaturas',
        icon: Thermometer,
        color: 'text-cyan-500',
        image: PlaceHolderImages.find(img => img.id === 'report-temp')
    },
    {
        id: 'permanencia-stock',
        title: "Días de Permanencia en Frío",
        description: "Cálculo automático de cuántos días lleva la fruta de terceros en las cámaras. Herramienta fundamental para el cobro del servicio.",
        href: "/reportes/permanencia-stock-otros-clientes",
        icon: Clock,
        color: 'text-slate-500',
        image: PlaceHolderImages.find(img => img.id === 'report-clock')
    },
    { 
        id: 'stock-embalajes',
        title: 'Inventario de Embalajes', 
        description: 'Stock actual de pallets de materiales de embalaje (cajas, esquineros, láminas) almacenados en las bodegas secas.',
        href: '/reportes/stock-embalajes',
        icon: Box,
        color: 'text-amber-500',
        image: PlaceHolderImages.find(img => img.id === 'report-stock')
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
        <div className="space-y-8 pb-12">
             <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Centro de Reportes</h1>
                <p className="text-muted-foreground text-lg">
                    Acceda a la información detallada de su operación. Todos los reportes pueden exportarse a Excel.
                </p>
            </div>

            {isAdmin && (
                <Card className="border-primary/20 bg-primary/5 shadow-md">
                    <CardHeader className="flex flex-row items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-full">
                            <Settings className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Gestión de Visibilidad (Admin)</CardTitle>
                            <CardDescription>Oculte reportes temporalmente para simplificar la vista a los usuarios.</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {reportList.map(report => (
                                <div key={report.id} className="flex items-center justify-between p-3 border rounded-md bg-background shadow-sm hover:border-primary/50 transition-colors">
                                    <div className="flex flex-col pr-2">
                                        <Label className="font-bold text-xs mb-1 line-clamp-1">{report.title}</Label>
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                            {hiddenReportIds.has(report.id) ? (
                                                <span className="flex items-center gap-1 text-destructive"><EyeOff className="h-3 w-3" /> Oculto</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-green-600"><Eye className="h-3 w-3" /> Visible</span>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {loadingSettings ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-80 w-full rounded-xl" />
                    ))
                ) : visibleReports.map(report => (
                    <Link href={report.href} key={report.id} className="block group">
                        <Card className={`overflow-hidden border-2 transition-all duration-300 hover:shadow-2xl hover:border-primary group-active:scale-[0.98] h-full flex flex-col ${hiddenReportIds.has(report.id) ? 'opacity-60 border-dashed bg-muted/30' : 'bg-card border-border'}`}>
                            
                            {/* Image Header */}
                            <div className="relative h-48 w-full overflow-hidden">
                                {report.image && (
                                    <Image 
                                        src={report.image.imageUrl} 
                                        alt={report.image.description}
                                        fill
                                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                                        data-ai-hint={report.image.imageHint}
                                    />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                                    <div className={`p-3 rounded-xl bg-white shadow-lg ${report.color}`}>
                                        <report.icon size={28} />
                                    </div>
                                    <div className="flex flex-col">
                                        {isAdmin && hiddenReportIds.has(report.id) && (
                                            <Badge variant="destructive" className="w-fit text-[10px] mb-1">OCULTO PARA USUARIOS</Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <CardHeader className="flex-1 space-y-3 pb-4">
                                <div className='flex justify-between items-start'>
                                    <CardTitle className="text-2xl font-bold leading-tight line-clamp-2 min-h-[4rem]">
                                        {report.title}
                                    </CardTitle>
                                    <div className="p-1 rounded-full bg-muted group-hover:bg-primary group-hover:text-primary-foreground transition-colors mt-1 shrink-0">
                                        <ChevronRight className="h-5 w-5" />
                                    </div>
                                </div>
                                <CardDescription className="text-base font-medium text-muted-foreground leading-relaxed">
                                    {report.description}
                                </CardDescription>
                            </CardHeader>
                            
                            <div className="px-6 pb-6 mt-auto">
                                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <div className={`h-full w-0 group-hover:w-full transition-all duration-500 bg-primary`} />
                                </div>
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>

            {visibleReports.length === 0 && !loadingSettings && (
                <div className="text-center py-24 border-2 border-dashed rounded-2xl bg-muted/20">
                    <div className="flex justify-center mb-4">
                        <EyeOff size={48} className="text-muted-foreground opacity-20" />
                    </div>
                    <p className="text-muted-foreground text-lg">No hay reportes habilitados para su visualización en este momento.</p>
                </div>
            )}
        </div>
    );
}
