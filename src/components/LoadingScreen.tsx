

import { FrioLogo } from "./ui/FrioLogo";

export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="relative flex items-center justify-center w-32 h-32">
        <div className="absolute inline-flex h-full w-full rounded-full bg-primary/20 animate-ping"></div>
        <div className="relative inline-flex items-center justify-center rounded-full h-28 w-28 bg-primary/30">
            <FrioLogo className="w-24 h-auto text-primary" />
        </div>
      </div>
      <p className="mt-4 text-muted-foreground">Cargando...</p>
    </div>
  );
}
