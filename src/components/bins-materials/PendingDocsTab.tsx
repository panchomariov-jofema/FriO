'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PendingDocsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos Pendientes</CardTitle>
        <CardDescription>
          Aquí se mostrarán los documentos pendientes. La funcionalidad se implementará próximamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 flex items-center justify-center border-dashed border-2 rounded-md">
          <p className="text-muted-foreground">Funcionalidad en construcción.</p>
        </div>
      </CardContent>
    </Card>
  );
}
