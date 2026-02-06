
'use client';

import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { ModulePermission } from '@/lib/types';
import { Card, CardContent } from '../ui/card';

// This structure should match the available modules and their sub-modules (tabs)
const ALL_MODULES_CONFIG = [
    { id: 'Dashboard', label: 'Dashboard' },
    {
        id: 'Bins y Materiales',
        label: 'Bins y Materiales',
        subModules: [
            { id: 'entradas', label: 'Entradas' },
            { id: 'salidas', label: 'Salidas' },
            { id: 'documentos_pendientes', label: 'Documentos Pendientes' },
            { id: 'stock', label: 'Stock' },
        ],
    },
    { id: 'Recepción', label: 'Recepción' },
    { id: 'Hidrocooler', label: 'Hidrocooler' },
    { id: 'Cámaras', label: 'Cámaras' },
    { id: 'Despachos', label: 'Despachos' },
    {
        id: 'Embalajes',
        label: 'Embalajes',
        subModules: [
            { id: 'recepcion', label: 'Recepción' },
            { id: 'salidas', label: 'Despacho' },
            { id: 'stock', label: 'Stock' },
        ],
    },
    {
        id: 'Socios Comerciales',
        label: 'Socios Comerciales',
        subModules: [
            { id: 'recepcion', label: 'Recepción' },
            { id: 'almacenamiento', label: 'Almacenamiento' },
            { id: 'salidas', label: 'Despacho' },
            { id: 'picking', label: 'Picking' },
            { id: 'stock', label: 'Stock' },
        ],
    },
    { id: 'Fall Creek', label: 'Fall Creek' },
    { id: 'Reportes', label: 'Reportes' },
    { id: 'Datos Maestros', label: 'Datos Maestros' },
];

interface ModulePermissionsSelectorProps {
  value: ModulePermission[] | string; // Allow string to handle bad data
  onChange: (value: ModulePermission[]) => void;
}

export function ModulePermissionsSelector({ value, onChange }: ModulePermissionsSelectorProps) {
  // Defensively ensure `selectedPermissions` is always an array.
  let selectedPermissions: ModulePermission[];
  if (Array.isArray(value)) {
    selectedPermissions = value;
  } else if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      selectedPermissions = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      selectedPermissions = [];
    }
  } else if (typeof value === 'string') {
    selectedPermissions = value.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    selectedPermissions = [];
  }


  const handleParentChange = (moduleId: string, subModules: { id: string, label: string }[] | undefined, checked: boolean) => {
    let newPermissions = [...selectedPermissions];
    
    // Remove existing simple string or object for this module
    newPermissions = newPermissions.filter(p => {
        if (typeof p === 'string') return p !== moduleId;
        if (typeof p === 'object' && p !== null && 'name' in p) return p.name !== moduleId;
        return true;
    });

    if (checked) {
        if (subModules) {
            // Add as an object with all sub-modules
            newPermissions.push({ name: moduleId as any, allowedTabs: subModules.map(sm => sm.id) });
        } else {
            // Add as a simple string
            newPermissions.push(moduleId);
        }
    }
    onChange(newPermissions);
  };
  
  const handleChildChange = (parentId: string, subModuleId: string, checked: boolean) => {
    let newPermissions = [...selectedPermissions];
    
    const parentPermission = newPermissions.find(p => typeof p === 'object' && p !== null && 'name' in p && p.name === parentId);
    
    if (parentPermission && typeof parentPermission === 'object' && 'allowedTabs' in parentPermission) {
        let newTabs = parentPermission.allowedTabs ? [...parentPermission.allowedTabs] : [];
        if (checked) {
            if (!newTabs.includes(subModuleId)) newTabs.push(subModuleId);
        } else {
            newTabs = newTabs.filter(t => t !== subModuleId);
        }

        if (newTabs.length === 0) {
            // If no tabs are selected, remove the parent object entirely
            newPermissions = newPermissions.filter(p => (typeof p === 'object' && p !== null && 'name' in p) ? p.name !== parentId : true);
        } else {
            // Update the parent object with new tabs
            newPermissions = newPermissions.map(p => 
                (typeof p === 'object' && p !== null && 'name' in p && p.name === parentId) 
                ? { ...p, allowedTabs: newTabs } 
                : p
            );
        }
    } else if (checked) {
        // Parent doesn't exist, create it with this one submodule
         newPermissions.push({ name: parentId as any, allowedTabs: [subModuleId] });
    }

    onChange(newPermissions);
  };

  return (
    <Card>
        <CardContent className="p-2 max-h-64 overflow-y-auto">
             <Accordion type="multiple" className="w-full">
                {ALL_MODULES_CONFIG.map(module => {

                    const parentPermission = selectedPermissions.find(p => {
                        if (typeof p === 'string') return p === module.id;
                        if (typeof p === 'object' && p !== null && 'name' in p) return p.name === module.id;
                        return false;
                    });
                    
                    let isParentChecked = !!parentPermission;
                    let isIndeterminate = false;

                    if (module.subModules && typeof parentPermission === 'object' && parentPermission !== null && 'allowedTabs' in parentPermission) {
                        const selectedTabsCount = parentPermission.allowedTabs?.length || 0;
                        if (selectedTabsCount > 0 && selectedTabsCount < module.subModules.length) {
                            isIndeterminate = true;
                            isParentChecked = false; // Set to false to allow indeterminate state to show
                        } else if (selectedTabsCount === module.subModules.length) {
                            isParentChecked = true;
                        }
                    }

                    return (
                        <AccordionItem value={module.id} key={module.id}>
                            <div className="flex items-center space-x-2 py-2 pr-2">
                                <Checkbox
                                    id={`parent-${module.id}`}
                                    checked={isIndeterminate ? 'indeterminate' : isParentChecked}
                                    onCheckedChange={(checked) => handleParentChange(module.id, module.subModules, !!checked)}
                                />
                                {module.subModules ? (
                                    <AccordionTrigger className="flex-1 p-0 hover:no-underline">
                                        <Label htmlFor={`parent-${module.id}`} className="font-semibold cursor-pointer">
                                            {module.label}
                                        </Label>
                                    </AccordionTrigger>
                                ) : (
                                     <Label htmlFor={`parent-${module.id}`} className="font-semibold cursor-pointer flex-1">
                                        {module.label}
                                    </Label>
                                )}
                            </div>
                            {module.subModules && (
                                <AccordionContent>
                                    <div className="pl-8 pt-2 space-y-2">
                                        {module.subModules.map(subModule => {
                                            const isChildChecked = 
                                                typeof parentPermission === 'object' && 
                                                parentPermission !== null &&
                                                'allowedTabs' in parentPermission &&
                                                Array.isArray(parentPermission.allowedTabs) &&
                                                parentPermission.allowedTabs.includes(subModule.id);

                                            return (
                                                <div key={subModule.id} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`child-${module.id}-${subModule.id}`}
                                                        checked={!!isChildChecked}
                                                        onCheckedChange={(checked) => handleChildChange(module.id, subModule.id, !!checked)}
                                                    />
                                                    <Label htmlFor={`child-${module.id}-${subModule.id}`} className="font-normal cursor-pointer">
                                                        {subModule.label}
                                                    </Label>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </AccordionContent>
                            )}
                        </AccordionItem>
                    )
                })}
            </Accordion>
        </CardContent>
    </Card>
  );
}
