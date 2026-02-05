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
            {/* Bin Icon SVG as a background layer, slightly larger than the text */}
            <svg
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute w-[150%] h-[150%] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-black/20"
                fill="currentColor"
                aria-hidden="true"
            >
                <path d="M2.37,7.27,5.31,21.5H18.69l2.94-14.23ZM6,20,3.31,8.27H20.69L18,20Z" />
            </svg>
            
            {/* The original logo content, sits on top */}
            <div className={cn("relative flex items-baseline justify-center tracking-tight")}>
                <span className="text-foreground">Fri</span>
                <CustomAppleIcon className="text-primary relative top-[0.1em] h-[0.85em] w-[0.85em] -ml-[0.05em]" />
            </div>
        </div>
    )
);
FrioLogo.displayName = 'FrioLogo';
