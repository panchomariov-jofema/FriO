import { Apple } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="relative flex items-center justify-center w-24 h-24">
        <div className="absolute inline-flex h-full w-full rounded-full bg-primary/20 animate-ping"></div>
        <div className="relative inline-flex items-center justify-center rounded-full h-20 w-20 bg-primary/30">
            <div className="flex items-center gap-1">
                <span className="font-bold text-3xl text-primary">Fri</span>
                <Apple className="w-7 h-7 text-primary" />
            </div>
        </div>
      </div>
      <p className="mt-4 text-muted-foreground">Cargando...</p>
    </div>
  );
}
