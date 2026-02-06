
'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OtherFruitReceptionTab } from '@/components/other-fruit/ReceptionTab';
import { OtherFruitStorageTab } from '@/components/other-fruit/StorageTab';
import { OtherFruitExitTab } from '@/components/other-fruit/ExitTab';
import { StockAndRelocationTab } from '@/components/other-fruit/StockAndRelocationTab';
import { OtherFruitPickingTab } from '@/components/other-fruit/PickingTab';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { OtherFruitMovement, OtherFruitReception, PackagingMovement, PackagingReception } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/contexts/PermissionsContext';

export default function OtrosHortofruticolasPage() {
    const { data: otherFruitMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
    const { data: otherFruitReceptions } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
    const { data: packagingMovements } = useFirestoreCollection<PackagingMovement>('packagingMovements');
    const { data: packagingReceptions } = useFirestoreCollection<PackagingReception>('packagingReceptions');
    const { permissions } = usePermissions();

    const pendingPickingCount = React.useMemo(() => {
        const fruitCount = (otherFruitMovements || []).filter(
            (mov) => mov.type === 'salida' && mov.status === 'Pendiente de Picking'
        ).length;
        const packagingCount = (packagingMovements || []).filter(
            (mov) => mov.type === 'salida' && mov.status === 'Pendiente de Picking'
        ).length;
        return fruitCount + packagingCount;
    }, [otherFruitMovements, packagingMovements]);
    
    const pendingStorageCount = React.useMemo(() => {
        const fruitCount = (otherFruitReceptions || [])
            .flatMap(reception => reception.items)
            .filter(item => item.status === 'Pendiente de almacenar')
            .length;
        const packagingCount = (packagingReceptions || [])
            .flatMap(reception => reception.items)
            .filter(item => item.status === 'Pendiente de almacenar')
            .length;
        return fruitCount + packagingCount;
    }, [otherFruitReceptions, packagingReceptions]);

    const allowedTabs = React.useMemo(() => {
      const permission = permissions.find(p => typeof p === 'object' && p !== null && 'name' in p && p.name === 'Socios Comerciales');
      if (!permission || typeof permission === 'string') {
        return ['recepcion', 'almacenamiento', 'salidas', 'picking', 'stock'];
      }
      if (typeof permission === 'object' && permission.allowedTabs) {
        return permission.allowedTabs;
      }
      return [];
    }, [permissions]);

    const tabsConfig = [
        { value: 'recepcion', label: 'Recepción' },
        { value: 'almacenamiento', label: 'Almacenamiento', badge: pendingStorageCount },
        { value: 'salidas', label: 'Despacho' },
        { value: 'picking', label: 'Picking', badge: pendingPickingCount },
        { value: 'stock', label: 'Stock' },
    ];
    
    const visibleTabs = tabsConfig.filter(tab => allowedTabs.includes(tab.value));


    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Socios Comerciales</CardTitle>
                    <CardDescription>Recepción, almacenamiento y despacho de productos de socios comerciales (Fruta y Embalajes).</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue={visibleTabs.length > 0 ? visibleTabs[0].value : 'recepcion'} className="w-full">
                {visibleTabs.length > 0 && (
                    <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
                        {visibleTabs.map(tab => (
                            <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                            {tab.label}
                            {tab.badge > 0 && (
                                <Badge className="h-5 w-5 p-0 flex items-center justify-center">{tab.badge}</Badge>
                            )}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                )}
                
                {allowedTabs.includes('recepcion') && <TabsContent value="recepcion"><OtherFruitReceptionTab /></TabsContent>}
                {allowedTabs.includes('almacenamiento') && <TabsContent value="almacenamiento"><OtherFruitStorageTab /></TabsContent>}
                {allowedTabs.includes('salidas') && <TabsContent value="salidas"><OtherFruitExitTab /></TabsContent>}
                {allowedTabs.includes('picking') && <TabsContent value="picking"><OtherFruitPickingTab /></TabsContent>}
                {allowedTabs.includes('stock') && <TabsContent value="stock"><StockAndRelocationTab /></TabsContent>}
            </Tabs>
        </div>
    );
}
