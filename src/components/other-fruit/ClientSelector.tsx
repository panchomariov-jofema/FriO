'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Package, ChevronRight } from 'lucide-react';

interface ClientWithPending {
    id: string;
    name: string;
    count: number;
}

interface ClientSelectorProps {
    clients: ClientWithPending[];
    onSelect: (clientId: string) => void;
}

export function ClientSelector({ clients, onSelect }: ClientSelectorProps) {
    return (
        <div className="space-y-6">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Seleccione un Cliente</h2>
                <p className="text-muted-foreground">
                    Inicie el proceso de almacenamiento seleccionando un cliente con productos pendientes.
                </p>
            </div>

            {clients.length === 0 ? (
                <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center">
                    <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <CardTitle className="text-xl">No hay productos pendientes</CardTitle>
                    <CardDescription>
                        Todos los productos de socios comerciales han sido almacenados correctamente.
                    </CardDescription>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clients.map((client) => (
                        <Card 
                            key={client.id}
                            className="group cursor-pointer hover:border-primary/50 transition-all hover:shadow-md bg-card/50 backdrop-blur-sm"
                            onClick={() => onSelect(client.id)}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        <User className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-semibold">{client.name}</CardTitle>
                                        <CardDescription className="text-xs uppercase tracking-wider">ID: {client.id}</CardDescription>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="font-mono">
                                    {client.count} ítems
                                </Badge>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <div className="flex items-center justify-between text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                    Comenzar Almacenamiento
                                    <ChevronRight className="h-4 w-4" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
