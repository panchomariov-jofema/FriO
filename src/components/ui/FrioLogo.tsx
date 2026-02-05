import * as React from 'react';

export const FrioLogo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
        <svg
            ref={ref}
            viewBox="0 0 160 60"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            {...props}
        >
            <text 
                x="0" 
                y="50"
                fontFamily='"PT Sans", sans-serif'
                fontSize="60"
                fontWeight="bold"
                fill="currentColor"
            >
                Fri
            </text>
            <g transform="translate(95, -5) scale(2)"> 
                {/* The tilde/virgulilla path */}
                <path d="M15,4 C16,2 18,2 19,4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                {/* The apple body path */}
                <path d="M19.5,10.5C19.5,5.5,16,5,15,5.5C13.5,6,12,8,12,8C12,8,10.5,6,9,5.5C8,5,4.5,5.5,4.5,10.5C4.5,16.5,8,22,12,22C16,22,19.5,16.5,19.5,10.5Z" fill="currentColor" />
            </g>
        </svg>
    )
);
FrioLogo.displayName = 'FrioLogo';
