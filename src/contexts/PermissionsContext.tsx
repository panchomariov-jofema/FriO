
'use client';

import * as React from 'react';
import type { ModulePermission } from '@/lib/types';

interface PermissionsContextType {
  permissions: ModulePermission[];
}

const PermissionsContext = React.createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children, permissions }: { children: React.ReactNode, permissions: ModulePermission[] }) {
  return (
    <PermissionsContext.Provider value={{ permissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = React.useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
