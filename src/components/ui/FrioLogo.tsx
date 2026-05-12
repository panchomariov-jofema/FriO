import * as React from 'react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export const FrioLogo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
        <div
            ref={ref}
            className={cn("flex items-center gap-2", className)}
            {...props}
        >
            <div className="relative flex items-center justify-center h-9 w-9">
                <div className="absolute -inset-1.5 bg-green-500/20 blur-lg rounded-full animate-pulse" />
                <svg
                    viewBox="0 0 100 100"
                    className="h-full w-full relative overflow-visible drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <defs>
                        <linearGradient id="appleMain" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#4ade80" />
                            <stop offset="100%" stopColor="#166534" />
                        </linearGradient>
                        <linearGradient id="appleLeaf" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#86efac" />
                            <stop offset="100%" stopColor="#22c55e" />
                        </linearGradient>
                    </defs>
                    {/* Tech-Geometric Apple Body */}
                    <path
                        d="M50 92C28 92 10 74 10 48C10 24 32 12 50 28C68 12 90 24 90 48C90 74 72 92 50 92Z"
                        fill="url(#appleMain)"
                    />
                    {/* Tech details - circuit line */}
                    <path
                        d="M35 55 L45 65 L65 45"
                        stroke="white"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.2"
                    />
                    {/* Digital Leaf */}
                    <path
                        d="M52 28C55 8 78 4 82 18C82 32 60 36 52 28Z"
                        fill="url(#appleLeaf)"
                    />
                    {/* Glowing highlight */}
                    <circle cx="30" cy="35" r="4" fill="white" fillOpacity="0.2" />
                </svg>
            </div>
            <div className="flex items-baseline font-black tracking-tighter">
                <span className="text-2xl bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-700 dark:from-white dark:to-slate-400">
                    Fri
                </span>
                <div className="h-6 w-6 ml-0.5 translate-y-1">
                    <svg
                        viewBox="0 0 100 100"
                        className="h-full w-full drop-shadow-[0_0_5px_rgba(34,197,94,0.3)]"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path
                            d="M50 92C28 92 10 74 10 48C10 24 32 12 50 28C68 12 90 24 90 48C90 74 72 92 50 92Z"
                            fill="url(#appleMain)"
                        />
                        <path
                            d="M52 28C55 8 78 4 82 18C82 32 60 36 52 28Z"
                            fill="url(#appleLeaf)"
                        />
                    </svg>
                </div>
            </div>
        </div>
    )
);
FrioLogo.displayName = 'FrioLogo';

