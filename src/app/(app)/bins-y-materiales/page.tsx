'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Exporter } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { useProducersByExporter } from '@/hooks/use-producers-by-exporter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntriesTab } from '@/components/bins-materials/EntriesTab';
import { ExitsTab } from '@/components/bins-materials/ExitsTab';
import { StockTab } from '@/components/bins-materials/StockTab';
import { Checkbox } from '@/components/ui/checkbox';

export default function BinsYMaterialesPage() {
  const [selectedExporterId, setSelectedExporterId] = React.useState<string | null>(null);
  const [selectedProducerId, setSelectedProducerId] = React.useState<string | null>(null);
  const [isDirectDispatch, setIsDirectDispatch] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('salidas');

  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: producers, loading: loadingProducers } = useProducersByExporter(selectedExporterId);

  const handleDirectDispatchChange = (checked: boolean) => {
    setIsDirectDispatch(checked);
    if (checked) {
      setActiveTab('entradas');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Gestión de Bins y Materiales</CardTitle>
          <CardDescription>Seleccione un exportador y productor para gestionar el inventario.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exporter-select">Exportador</Label>
              <Select
                value={selectedExporterId ?? ''}
                onValueChange={(value) => {
                  setSelectedExporterId(value);
                  setSelectedProducerId(null); // Reset producer when exporter changes
                }}
                disabled={loadingExporters}
              >
                <SelectTrigger id="exporter-select">
                  <SelectValue placeholder="Seleccione un exportador..." />
                </SelectTrigger>
                <SelectContent>
                  {exporters.map(e => (
                    <SelectItem key={e.id} value={e.exporterId}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="producer-select">Productor</Label>
              <Select
                value={selectedProducerId ?? ''}
                onValueChange={(value) => setSelectedProducerId(value)}
                disabled={!selectedExporterId || loadingProducers}
              >
                <SelectTrigger id="producer-select">
                  <SelectValue placeholder="Seleccione un productor..." />
                </SelectTrigger>
                <SelectContent>
                  {producers.map(p => (
                    <SelectItem key={p.id} value={p.producerId}>
                      {p.shortName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-4 md:pt-0 md:self-end md:pb-1">
                <Checkbox 
                    id="direct-dispatch" 
                    checked={isDirectDispatch}
                    onCheckedChange={(checked) => handleDirectDispatchChange(!!checked)}
                    disabled={!selectedExporterId || !selectedProducerId}
                />
                <Label
                    htmlFor="direct-dispatch"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Despacho Directo
                </Label>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="entradas" disabled={!selectedExporterId || !selectedProducerId}>Entradas</TabsTrigger>
              <TabsTrigger value="salidas" disabled={!selectedExporterId || !selectedProducerId || isDirectDispatch}>Salidas</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
          </TabsList>
          <TabsContent value="entradas" className="mt-4">
             {selectedExporterId && selectedProducerId ? (
                <EntriesTab 
                  exporterId={selectedExporterId} 
                  producerId={selectedProducerId} 
                  isDirectDispatch={isDirectDispatch} 
                />
              ) : (
                <Card className="mt-4 flex items-center justify-center h-64 border-dashed">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">Seleccione un exportador y un productor para registrar entradas.</p>
                    </CardContent>
                </Card>
            )}
          </TabsContent>
          <TabsContent value="salidas" className="mt-4">
              {selectedExporterId && selectedProducerId ? (
                <ExitsTab 
                  exporterId={selectedExporterId}
                  producerId={selectedProducerId} 
                />
               ) : (
                <Card className="mt-4 flex items-center justify-center h-64 border-dashed">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">Seleccione un exportador y un productor para registrar salidas.</p>
                    </CardContent>
                </Card>
            )}
          </TabsContent>
          <TabsContent value="stock" className="mt-4">
              <StockTab exporterId={selectedExporterId} />
          </TabsContent>
      </Tabs>

    </div>
  );
}
