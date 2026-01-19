'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OtherFruitReceptionTab } from '@/components/other-fruit/ReceptionTab';
import { OtherFruitStorageTab } from '@/components/other-fruit/StorageTab';
import { OtherFruitExitTab } from '@/components/other-fruit/ExitTab';

export default function OtrosHortofruticolasPage() {
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Gestión de Otros Hortofrutícolas</CardTitle>
                    <CardDescription>Recepción, almacenamiento y despacho de fruta de otros clientes.</CardDescription>
                </CardHeader>
            </Card>

            <Tabs defaultValue="recepcion" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="recepcion">Recepción</TabsTrigger>
                    <TabsTrigger value="salidas">Despacho</TabsTrigger>
                    <TabsTrigger value="almacenamiento">Pendientes de Almacenar</TabsTrigger>
                </TabsList>
                
                <TabsContent value="recepcion">
                    <OtherFruitReceptionTab />
                </TabsContent>

                <TabsContent value="salidas">
                    <OtherFruitExitTab />
                </TabsContent>
                
                <TabsContent value="almacenamiento">
                    <OtherFruitStorageTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
