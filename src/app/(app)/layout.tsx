'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Archive,
  Building2,
  Database,
  Grape,
  LayoutDashboard,
  Apple,
  LogOut,
  Package,
  PanelLeft,
  PieChart,
  Truck,
  Waves,
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
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { UserMaster, Profile, ModulePermission } from '@/lib/types';
import { signOut } from 'firebase/auth';

const navIcons: { [key: string]: React.ElementType } = {
  Dashboard: LayoutDashboard,
  'Bins y Materiales': Archive,
  Recepción: PanelLeft,
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
    { href: '/recepcion', label: 'Recepción', icon: PanelLeft },
    { href: '/hidrocooler', label: 'Hidrocooler', icon: Waves },
    { href: '/camaras', label: 'Cámaras', icon: Building2 },
    { href: '/despachos', label: 'Despachos', icon: Truck },
    { href: '/embalajes', label: 'Embalajes', icon: Package },
    { href: '/otros-hortofruticolas', label: 'Otros Hortofrutícolas', icon: Grape },
    { href: '/reportes', label: 'Reportes', icon: PieChart },
    { href: '/datos-maestros', label: 'Datos Maestros', icon: Database },
];

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
  const [navItems, setNavItems] = React.useState<{ href: string; label: string; icon: React.ElementType }[] | null>(null);
  const { setOpenMobile } = useSidebar();

  React.useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  React.useEffect(() => {
    if (user && !loadingUsers && !loadingProfiles) {
      if (user.isAnonymous) {
        // Anonymous users get full access for this dev build
        setNavItems(defaultNavItems);
        return;
      }
      
      const emailUsername = user.email ? user.email.split('@')[0].toLowerCase() : null;
      if (emailUsername) {
        const currentUserMaster = users.find(u => u.userName.toLowerCase() === emailUsername);
        if (currentUserMaster) {
          const userProfile = profiles.find(p => p.profileId === currentUserMaster.profileId);
          if (userProfile) {
            const accessibleNavs = userProfile.modulesAccess
              .map((permission: ModulePermission) => {
                const moduleName = typeof permission === 'string' ? permission : permission.name;
                const href = `/${moduleName.toLowerCase().replace(/\s/g, '-').replace(/y-/, '-')}`;
                return defaultNavItems.find(item => item.href === href);
              })
              .filter(Boolean) as { href: string; label: string; icon: React.ElementType }[];
            setNavItems(accessibleNavs);
          } else {
            setNavItems(defaultNavItems); // Profile referenced but not found, grant all
          }
        } else {
          setNavItems(defaultNavItems); // User not in master list, grant all
        }
      } else {
        // Fallback for users without email (should not happen for non-anonymous)
        setNavItems([]);
      }
    }
  }, [user, users, profiles, loadingUsers, loadingProfiles]);

  const loading = isUserLoading || navItems === null;

  if (loading || !user) {
    return <LoadingScreen />;
  }
  
  const handleSignOut = async () => {
    if (auth) {
        await signOut(auth);
        router.push('/login');
    }
  }

  return (
      <>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 p-2">
              <Apple className="w-8 h-8 text-primary" />
              <span className="font-bold text-lg group-data-[collapsible=icon]:hidden">
                FÑO
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href} onClick={() => setOpenMobile(false)}>
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
            <p className="text-xs text-muted-foreground text-center">© 2024 FÑO</p>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
           <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b bg-background">
              <SidebarTrigger />
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar Sesión
              </Button>
          </header>
          <main className="p-4">
              {children}
          </main>
        </SidebarInset>
      </>
  );
}


export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={false}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  )
}
