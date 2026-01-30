'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OtherFruitReceptionTab } from '@/components/other-fruit/ReceptionTab';
import { OtherFruitStorageTab } from '@/components/other-fruit/StorageTab';
import { OtherFruitExitTab } from '@/components/other-fruit/ExitTab';
import { StockAndRelocationTab } from '@/components/other-fruit/StockAndRelocationTab';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import { OtherClient } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

const FALL_CREEK_CLIENT_NAME = 'FALL CREEK';

export default function FallCreekPage() {
    const { data: allClients, loading: loadingClients } = useFirestoreCollection<OtherClient>('otherClients');

    const fallCreekClientId = React.useMemo(() => {
        if (!allClients) return null;
        const fallCreekClient = allClients.find(c => c.name.toUpperCase() === FALL_CREEK_CLIENT_NAME);
        return fallCreekClient?.clientId || null;
    }, [allClients]);

    if (loadingClients) {
        return (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-8 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardHeader>
                </Card>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }
    
    if (!fallCreekClientId) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Error</CardTitle>
                    <CardDescription>No se pudo encontrar el cliente "{FALL_CREEK_CLIENT_NAME}" en los datos maestros.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Fall Creek</CardTitle>
                    <CardDescription>Recepción, almacenamiento y despacho de fruta para el cliente Fall Creek.</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="recepcion" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="recepcion">Recepción</TabsTrigger>
                    <TabsTrigger value="almacenamiento">Almacenamiento</TabsTrigger>
                    <TabsTrigger value="salidas">Despacho</TabsTrigger>
                    <TabsTrigger value="stock">Stock</TabsTrigger>
                </TabsList>
                
                <TabsContent value="recepcion">
                    <OtherFruitReceptionTab clientId={fallCreekClientId} />
                </TabsContent>

                <TabsContent value="almacenamiento">
                    <OtherFruitStorageTab clientId={fallCreekClientId} />
                </TabsContent>

                <TabsContent value="salidas">
                    <OtherFruitExitTab clientId={fallCreekClientId} />
                </TabsContent>

                <TabsContent value="stock">
                    <StockAndRelocationTab clientId={fallCreekClientId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
