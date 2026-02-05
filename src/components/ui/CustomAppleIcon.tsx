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
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("", className)}
        {...props}
    >
        <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
        <path d="M8.5 1.5 C 9.5 -0.5, 11.5 3.5, 14.5 1.5" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
));
CustomAppleIcon.displayName = 'CustomAppleIcon';
