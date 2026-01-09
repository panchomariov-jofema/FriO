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

const defaultNavItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/bins-y-materiales', label: 'Bins y Materiales', icon: Archive },
    { href: '/recepcion', label: 'Recepción', icon: ChevronsLeft },
    { href: '/hidrocooler', label: 'Hidrocooler', icon: Waves },
    { href: '/camaras', label: 'Cámaras', icon: Building2 },
    { href: '/despachos', label: 'Despachos', icon: Truck },
    { href: '/embalajes', label: 'Embalajes', icon: Package },
    { href: '/otros-hortofruticolas', label: 'Otros Hortofrutícolas', icon: Grape },
    { href: '/reportes', label: 'Reportes', icon: PieChart },
    { href: '/datos-maestros', label: 'Datos Maestros', icon: Database },
];


export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
  const [navItems, setNavItems] = React.useState<{ href: string; label: string; icon: React.ElementType }[] | null>(null);

  React.useEffect(() => {
    if (!isUserLoading && !user && auth) {
      signInAnonymously(auth);
    }
  }, [user, isUserLoading, auth]);

  React.useEffect(() => {
    if (user && !loadingUsers && !loadingProfiles) {
      const emailUsername = user.isAnonymous ? null : (user.email ? user.email.split('@')[0].toLowerCase() : null);
      const currentUserMaster = emailUsername ? users.find(u => u.userName.toLowerCase() === emailUsername) : null;

      if (currentUserMaster) {
        const userProfile = profiles.find(p => p.profileId === currentUserMaster.profileId);
        if (userProfile) {
          const accessibleNavs = userProfile.modulesAccess.map((permission: ModulePermission) => {
            const moduleName = typeof permission === 'string' ? permission : permission.name;
            const href = `/${moduleName.toLowerCase().replace(/\s/g, '-').replace(/y-/, '-')}`;
            return {
              href,
              label: moduleName,
              icon: navIcons[moduleName] || Leaf,
            };
          });
          setNavItems(accessibleNavs);
        } else {
             setNavItems(defaultNavItems); // Profile referenced but not found
        }
      } else {
        // Handle anonymous users or users without a profile
        setNavItems(defaultNavItems);
      }
    }
  }, [user, users, profiles, loadingUsers, loadingProfiles]);

  const loading = isUserLoading || navItems === null;

  if (loading || !user) {
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
