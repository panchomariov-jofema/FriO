import * as React from 'react';
import { cn } from '@/lib/utils';

export const FrioLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("font-body font-bold tracking-tight", className)}
            {...props}
        >
            FriO
        </div>
    )
);
FrioLogo.displayName = 'FrioLogo';
