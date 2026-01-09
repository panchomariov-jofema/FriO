'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  Building2,
  Database,
  Grape,
  LayoutDashboard,
  Leaf,
  Package,
  PieChart,
  Truck,
  Waves,
  ChevronsLeft,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { signInAnonymously } from 'firebase/auth';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { UserMaster, Profile, ModulePermission } from '@/lib/types';

const navIcons: { [key: string]: React.ElementType } = {
  Dashboard: LayoutDashboard,
  'Bins y Materiales': Archive,
  Recepción: ChevronsLeft,
  Hidrocooler: Waves,
  Cámaras: Building2,
  Despachos: Truck,
  Reportes: PieChart,
  Embalajes: Package,
  'Otros Hortofrutícolas': Grape,
  'Datos Maestros': Database,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
  const [navItems, setNavItems] = React.useState<{ href: string; label: string; icon: React.ElementType }[]>([]);

  React.useEffect(() => {
    if (!isUserLoading && !user && auth) {
      signInAnonymously(auth);
    }
  }, [user, isUserLoading, auth]);

  React.useEffect(() => {
    if (user && users.length > 0 && profiles.length > 0) {
      const currentUserMaster = users.find(u => u.userName.toLowerCase() === user.email?.split('@')[0].toLowerCase());
      if (currentUserMaster) {
        const userProfile = profiles.find(p => p.profileId === currentUserMaster.profileId);
        if (userProfile) {
          const accessibleNavs = userProfile.modulesAccess.map((permission: ModulePermission) => {
            const moduleName = typeof permission === 'string' ? permission : permission.name;
            const href = `/${moduleName.toLowerCase().replace(/\s/g, '-')}`;
            return {
              href,
              label: moduleName,
              icon: navIcons[moduleName] || Leaf,
            };
          });
          setNavItems(accessibleNavs);
        }
      } else {
        // Default to a restricted view or handle no-profile case
        setNavItems([]);
      }
    }
  }, [user, users, profiles]);

  const loading = isUserLoading || loadingUsers || loadingProfiles;

  if (loading || !user) {
    return <LoadingScreen />;
  }

  if (navItems.length === 0 && !loading) {
    // This can be a "no profile assigned" page
    return <LoadingScreen />; 
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <Button variant="ghost" size="icon" className="md:hidden" asChild>
                <SidebarTrigger>
                    <ChevronsLeft />
                </SidebarTrigger>
            </Button>
            <Leaf className="w-8 h-8 text-primary" />
            <span className="font-bold text-lg group-data-[collapsible=icon]:hidden">
              FrigoManager
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className='group-data-[collapsible=icon]:hidden'>
          <p className="text-xs text-muted-foreground text-center">© 2024 FrigoManager</p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="p-4">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
