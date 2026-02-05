
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
      <path d="M9 4 Q 10.5 2 12 4 T 15 4" />
    </svg>
  );


export function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="relative flex items-center justify-center w-32 h-32">
        <div className="absolute inline-flex h-full w-full rounded-full bg-primary/20 animate-ping"></div>
        <div className="relative inline-flex items-center justify-center rounded-full h-28 w-28 bg-primary/30">
            <div className="flex items-baseline gap-1">
                <span className="font-bold text-5xl text-primary">Fri</span>
                <CustomAppleIcon className="w-10 h-10 text-primary translate-y-1" />
            </div>
        </div>
      </div>
      <p className="mt-4 text-muted-foreground">Cargando...</p>
    </div>
  );
}
