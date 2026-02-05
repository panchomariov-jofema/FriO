import * as React from 'react';
import { cn } from '@/lib/utils';
import { CustomAppleIcon } from './CustomAppleIcon';

export const FrioLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("flex items-baseline justify-center font-body font-bold tracking-tight", className)}
            {...props}
        >
            <span className="text-foreground">Fri</span>
            <CustomAppleIcon className="text-primary relative top-[0.1em] h-[0.85em] w-[0.85em] -ml-[0.05em]" />
        </div>
    )
);
FrioLogo.displayName = 'FrioLogo';
