import * as React from 'react';

export const FrioLogo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
        <svg
            ref={ref}
            viewBox="0 -10 135 60"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <text 
                x="0" 
                y="45"
                fontFamily='"PT Sans", sans-serif'
                fontSize="56"
                fontWeight="bold"
                fill="currentColor"
            >
                Fri
            </text>
            <g transform="translate(80, 20) scale(1.5)"> 
                 <path d="M15 6 C 16 3, 19 3, 19 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M19.5,10.5C19.5,5.5,16,5,15,5.5C13.5,6,12,8,12,8C12,8,10.5,6,9,5.5C8,5,4.5,5.5,4.5,10.5C4.5,16.5,8,22,12,22C16,22,19.5,16.5,19.5,10.5Z" fill="currentColor" />
            </g>
        </svg>
    )
);
FrioLogo.displayName = 'FrioLogo';
