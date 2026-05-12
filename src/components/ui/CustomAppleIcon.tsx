import * as React from 'react';
import { cn } from '@/lib/utils';

export const CustomAppleIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
    <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("", className)}
        {...props}
    >
        {/* Simplified Geometric Apple for Icon Use */}
        <path d="M12 21C7 21 3 17.5 3 12C3 7 7.5 4.5 12 7.5C16.5 4.5 21 7 21 12C21 17.5 17 21 12 21Z" fill="currentColor" fillOpacity="0.15" />
        <path d="M12 21C7 21 3 17.5 3 12C3 7 7.5 4.5 12 7.5C16.5 4.5 21 7 21 12C21 17.5 17 21 12 21Z" />
        <path d="M12.5 7.5C13 3 18 2.5 19 5C19 8 14 9 12.5 7.5Z" fill="currentColor" />
    </svg>
));
CustomAppleIcon.displayName = 'CustomAppleIcon';
