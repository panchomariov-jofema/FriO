import * as React from 'react';

export const FrioLogo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
        <svg
            ref={ref}
            viewBox="-5 -5 135 60" // Adjusted viewBox for better centering and size
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <text 
                x="0" 
                y="45" // Adjusted for vertical alignment
                fontFamily='"PT Sans", sans-serif'
                fontSize="56"
                fontWeight="bold"
                fill="currentColor"
            >
                Fri
            </text>
            <g transform="translate(82, 9) scale(1.5)"> 
                {/* Virgulilla - more accurate shape and position */}
                <path d="M8.5 4 C10.5 2.5, 13.5 2.5, 15.5 4 C13.5 5.5, 10.5 5.5, 8.5 4 Z" fill="currentColor" />
                {/* Apple Body - more accurate shape */}
                <path d="M19.5,10.5C19.5,5.5,16,5,15,5.5C13.5,6,12,8,12,8C12,8,10.5,6,9,5.5C8,5,4.5,5.5,4.5,10.5C4.5,16.5,8,22,12,22C16,22,19.5,16.5,19.5,10.5Z" fill="currentColor" />
            </g>
        </svg>
    )
);
FrioLogo.displayName = 'FrioLogo';
