
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CustomAppleIcon = ({ className }: { className?: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
      <path d="M9 2 Q 10.5 0 12 2 T 15 2" />
    </svg>
  );

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card className="h-full flex flex-col items-center justify-center border-dashed">
      <CardHeader className="items-center">
        <div className="p-4 bg-primary/20 rounded-full">
            <CustomAppleIcon className="w-12 h-12 text-primary" />
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
