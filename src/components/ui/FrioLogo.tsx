import * as React from 'react';
import { cn } from '@/lib/utils';
import { CustomAppleIcon } from './CustomAppleIcon';

export const FrioLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("relative inline-flex items-center justify-center font-body font-bold", className)}
            {...props}
        >
            {/* Circle background */}
            <div className="absolute w-[150%] h-[150%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary/20 rounded-full"></div>
            
            {/* The original logo content, sits on top */}
            <div className={cn("relative flex items-baseline justify-center tracking-tight")}>
                <span className="text-foreground">Fri</span>
                <CustomAppleIcon className="text-primary relative top-[0.1em] h-[0.85em] w-[0.85em] -ml-[0.05em]" />
            </div>
        </div>
    )
);
FrioLogo.displayName = 'FrioLogo';
