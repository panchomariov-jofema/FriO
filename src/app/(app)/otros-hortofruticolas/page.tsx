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
import type { OtherFruitMovement } from '@/lib/types';
import { Badge } from '@/components/ui/badge';

export default function OtrosHortofruticolasPage() {
    const { data: otherFruitMovements } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');

    const pendingPickingCount = React.useMemo(() => {
        if (!otherFruitMovements) return 0;
        return (otherFruitMovements || []).filter(
            (mov) => mov.type === 'salida' && mov.status === 'Pendiente de Picking'
        ).length;
    }, [otherFruitMovements]);

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Socios Comerciales</CardTitle>
                    <CardDescription>Recepción, almacenamiento y despacho de productos de socios comerciales.</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="recepcion" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="recepcion">Recepción</TabsTrigger>
                    <TabsTrigger value="almacenamiento">Almacenamiento</TabsTrigger>
                    <TabsTrigger value="salidas">Despacho</TabsTrigger>
                    <TabsTrigger value="picking" className="flex items-center gap-2">
                        Picking
                        {pendingPickingCount > 0 && (
                            <Badge className="h-5 w-5 p-0 flex items-center justify-center">{pendingPickingCount}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="stock">Stock</TabsTrigger>
                </TabsList>
                
                <TabsContent value="recepcion">
                    <OtherFruitReceptionTab />
                </TabsContent>

                <TabsContent value="almacenamiento">
                    <OtherFruitStorageTab />
                </TabsContent>

                <TabsContent value="salidas">
                    <OtherFruitExitTab />
                </TabsContent>

                <TabsContent value="picking">
                    <OtherFruitPickingTab />
                </TabsContent>

                <TabsContent value="stock">
                    <StockAndRelocationTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
