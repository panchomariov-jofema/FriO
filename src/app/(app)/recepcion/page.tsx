'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { Exporter, Producer, ReceptionLot } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { LotCreationForm } from '@/components/reception/LotCreationForm';
import { LotList } from '@/components/reception/LotList';
import { WeightCalculator } from '@/components/reception/WeightCalculator';
import { TemperatureForm } from '@/components/reception/TemperatureForm';
import { useProducersByExporter } from '@/hooks/use-producers-by-exporter';

export default function RecepcionPage() {
  const [selectedExporter, setSelectedExporter] = React.useState<string | null>(null);
  const [selectedProducer, setSelectedProducer] = React.useState<string | null>(null);
  const [selectedLot, setSelectedLot] = React.useState<ReceptionLot | null>(null);

  const { data: exporters, loading: loadingExporters } = useFirestoreCollection<Exporter>('exporters');
  const { data: producers, loading: loadingProducers } = useProducersByExporter(selectedExporter);

  React.useEffect(() => {
    setSelectedProducer(null);
    setSelectedLot(null);
  }, [selectedExporter]);

  React.useEffect(() => {
    setSelectedLot(null);
  }, [selectedProducer]);

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
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-1 space-y-4">
            <LotCreationForm
              exporterId={selectedExporter}
              producerId={selectedProducer}
              onLotCreated={() => setSelectedLot(null)}
            />
             {selectedLot && selectedLot.status === 'Pendiente de Peso' && (
                <WeightCalculator lot={selectedLot} onWeightSaved={() => setSelectedLot(null)}/>
            )}
            {selectedLot && ['Pendiente de Pre-Hidro', 'Pendiente de Post-Hidro'].includes(selectedLot.status) && (
                <TemperatureForm lot={selectedLot} onTempSaved={() => setSelectedLot(null)} />
            )}
          </div>
          <div className="lg:col-span-2">
            <LotList
              exporterId={selectedExporter}
              producerId={selectedProducer}
              selectedLot={selectedLot}
              onSelectLot={setSelectedLot}
            />
          </div>
        </div>
      )}
    </div>
  );
}
