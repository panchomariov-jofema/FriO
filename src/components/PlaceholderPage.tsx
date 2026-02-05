
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FrioLogo } from "./ui/FrioLogo";


export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card className="h-full flex flex-col items-center justify-center border-dashed">
      <CardHeader className="items-center">
        <div className="p-4 bg-primary/20 rounded-full">
            <FrioLogo className="w-24 h-auto text-primary" />
        </div>
      </CardHeader>
      <CardContent className="text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Módulo: {title}
        </CardTitle>
        <CardDescription className="text-muted-foreground mt-2">
          Esta sección se implementará próximamente.
        </CardDescription>
      </CardContent>
    </Card>
  );
}
