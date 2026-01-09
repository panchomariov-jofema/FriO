'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ArrowLeft } from "lucide-react";
import Link from 'next/link';

interface ReportHeaderProps {
    title: string;
    description: string;
    onExport: () => void;
    isExportDisabled?: boolean;
    children?: React.ReactNode;
}

export function ReportHeader({ title, description, onExport, isExportDisabled = false, children }: ReportHeaderProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/reportes" legacyBehavior>
                           <a className="hidden sm:block">
                             <Button variant="outline" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                             </Button>
                           </a>
                        </Link>
                        <div>
                            <CardTitle>{title}</CardTitle>
                            <CardDescription className="mt-1">{description}</CardDescription>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                       {children}
                        <Button onClick={onExport} disabled={isExportDisabled} className="w-full sm:w-auto">
                            <Download className="mr-2 h-4 w-4" />
                            Exportar CSV
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>
    );
}
