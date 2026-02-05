'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FrioLogo } from '@/components/ui/FrioLogo';
import { Download } from 'lucide-react';

export default function LogoPage() {
    const svgRef = React.useRef<SVGSVGElement>(null);

    const handleDownload = () => {
        if (svgRef.current) {
            const svgData = new XMLSerializer().serializeToString(svgRef.current);
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'FriO-Logo.svg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Logo Exportable</CardTitle>
                    <CardDescription>
                        Aquí puedes ver y descargar el logo de la aplicación en formato SVG (Scalable Vector Graphics), que no pierde calidad al hacer zoom.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-8 pt-8">
                    <FrioLogo ref={svgRef} className="w-80 h-auto text-primary" />
                     <div className="text-center p-6 border-dashed border-2 rounded-lg max-w-md">
                        <h3 className="font-semibold mb-2">Instrucciones de Descarga</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="font-medium">Opción 1: Descarga directa</p>
                                <p className="text-sm text-muted-foreground mb-2">Haz clic en el botón para descargar el archivo SVG.</p>
                                <Button onClick={handleDownload}>
                                    <Download className="mr-2 h-4 w-4"/>
                                    Descargar SVG
                                </Button>
                            </div>
                            <div>
                                <p className="font-medium">Opción 2: Guardar manualmente</p>
                                <p className="text-sm text-muted-foreground">
                                    Haz clic derecho sobre el logo de arriba, y selecciona "Guardar imagen como...". Asegúrate de guardarlo con la extensión ".svg".
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
