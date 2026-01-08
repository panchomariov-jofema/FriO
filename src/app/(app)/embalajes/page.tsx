'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReceptionTab } from '@/components/packaging/ReceptionTab';
import { StorageTab } from '@/components/packaging/StorageTab';
import { StockTab } from '@/components/packaging/StockTab';
import { ExitTab } from '@/components/packaging/ExitTab';

export default function EmbalajesPage() {
  return (
    <div className="space-y-4">
       <Card>
        <CardHeader>
          <CardTitle>Gestión de Embalajes</CardTitle>
          <CardDescription>
            Recepción, almacenamiento y consulta de stock de materiales de embalaje en pallets.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="recepcion" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="recepcion">Recepción</TabsTrigger>
          <TabsTrigger value="salida">Salida</TabsTrigger>
          <TabsTrigger value="almacenamiento">Pendientes de Almacenar</TabsTrigger>
          <TabsTrigger value="stock">Stock en Bodega</TabsTrigger>
        </TabsList>
        
        <TabsContent value="recepcion">
          <ReceptionTab />
        </TabsContent>

        <TabsContent value="salida">
          <ExitTab />
        </TabsContent>
        
        <TabsContent value="almacenamiento">
          <StorageTab />
        </TabsContent>

        <TabsContent value="stock">
          <StockTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}

    