import * as React from 'react';

export const CustomAppleIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
    ({ className, ...props }, ref) => (
    <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
    >
        <g transform="scale(1.2) translate(-2, -2)">
            <path d="M15 6 C 16 3, 19 3, 19 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M19.5,10.5C19.5,5.5,16,5,15,5.5C13.5,6,12,8,12,8C12,8,10.5,6,9,5.5C8,5,4.5,5.5,4.5,10.5C4.5,16.5,8,22,12,22C16,22,19.5,16.5,19.5,10.5Z" />
        </g>
    </svg>
));
CustomAppleIcon.displayName = 'CustomAppleIcon';
