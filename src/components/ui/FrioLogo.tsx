import * as React from 'react';

export const FrioLogo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
        <svg
            ref={ref}
            viewBox="0 0 160 50" // A viewBox that works well with the text and icon
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <text 
                x="0" 
                y="40" 
                fontFamily='"PT Sans", sans-serif'
                fontSize="48"
                fontWeight="bold"
                fill="currentColor"
            >
                Fri
            </text>
            <g transform="translate(90, -1) scale(2.2)">
                <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 2 Q 12 4 14 2" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
        </svg>
    )
);
FrioLogo.displayName = 'FrioLogo';
