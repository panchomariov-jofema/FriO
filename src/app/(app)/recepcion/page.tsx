'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Exporter } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { LotList } from '@/components/reception/LotList';
import { useProducersByExporter } from '@/hooks/use-producers-by-exporter';

export default function RecepcionPage() {
  const [selectedExporter, setSelectedExporter] = React.useState<string | null>(null);
  const [selectedProducer, setSelectedProducer] = React.useState<string | null>(null);

  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: producers, loading: loadingProducers } = useProducersByExporter(selectedExporter);

  React.useEffect(() => {
    setSelectedProducer(null);
  }, [selectedExporter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Recepción de Fruta</CardTitle>
          <CardDescription>Seleccione un exportador y productor para gestionar los lotes.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="exporter-select">Exportador</Label>
            <Select
              value={selectedExporter ?? ''}
              onValueChange={setSelectedExporter}
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
              value={selectedProducer ?? ''}
              onValueChange={setSelectedProducer}
              disabled={!selectedExporter || loadingProducers}
            >
              <SelectTrigger id="producer-select">
                <SelectValue placeholder="Seleccione un productor..." />
              </SelectTrigger>
              <SelectContent>
                {producers.map(p => (
                  <SelectItem key={p.id} value={p.producerId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedExporter && selectedProducer && (
        <LotList
          exporterId={selectedExporter}
          producerId={selectedProducer}
        />
      )}
    </div>
  );
}
