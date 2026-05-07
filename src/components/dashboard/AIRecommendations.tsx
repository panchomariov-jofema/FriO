'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sparkles, Thermometer, Zap, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Insight {
  type: 'cooling' | 'health';
  title: string;
  description: string;
  tip: string;
  impact: 'high' | 'medium' | 'low';
}

export function AIRecommendations() {
  const [loading, setLoading] = React.useState(false);
  const [insights, setInsights] = React.useState<Insight[]>([
    {
      type: 'cooling',
      title: 'Predicción de Hidrocooling',
      description: 'Variedad Cereza (Lapins) a 22°C requiere ~35 min para alcanzar 2°C.',
      tip: 'Aumentar flujo de agua un 5% para reducir 4 min de proceso.',
      impact: 'high'
    },
    {
      type: 'health',
      title: 'Eficiencia en Cámara 4',
      description: 'Humedad relativa al 88%. Leve desviación del óptimo (92%).',
      tip: 'Revisar sellos de puerta norte durante el próximo turno.',
      impact: 'medium'
    }
  ]);

  const refreshInsights = async () => {
    setLoading(true);
    // In a real scenario, we would call the Genkit flows here via a Server Action
    await new Promise(resolve => setTimeout(resolve, 1500));
    setLoading(false);
  };

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <Sparkles className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Insights de IA</CardTitle>
              <CardDescription>Recomendaciones operativas inteligentes</CardDescription>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-green-600 hover:bg-green-100"
            onClick={refreshInsights}
            disabled={loading}
          >
            {loading ? 'Analizando...' : 'Actualizar'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {insights.map((insight, index) => (
          <div key={index} className="flex gap-4 p-3 bg-white rounded-xl border border-green-100 shadow-sm transition-all hover:shadow-md">
            <div className={`p-2 rounded-full h-fit ${insight.type === 'cooling' ? 'bg-blue-50' : 'bg-orange-50'}`}>
              {insight.type === 'cooling' ? (
                <Zap className="h-4 w-4 text-blue-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">{insight.title}</h4>
                <Badge variant={insight.impact === 'high' ? 'default' : 'secondary'} className={insight.impact === 'high' ? 'bg-green-500' : ''}>
                  {insight.impact === 'high' ? 'Impacto Alto' : 'Impacto Medio'}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 leading-tight">
                {insight.description}
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-medium text-green-700">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                TIP: {insight.tip}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
