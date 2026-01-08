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


const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bins-y-materiales', label: 'Bins y Materiales', icon: Archive },
  { href: '/recepcion', label: 'Recepción', icon: ChevronsLeft },
  { href: '/hidrocooler', label: 'Hidrocooler', icon: Waves },
  { href: '/camaras', label: 'Cámaras', icon: Building2 },
  { href: '/despachos', label: 'Despachos', icon: Truck },
  { href: '/reportes', label: 'Reportes', icon: PieChart },
  { href: '/embalajes', label: 'Embalajes', icon: Package },
  { href: '/otros-hortofruticolas', label: 'Otros Hortofrutícolas', icon: Grape },
  { href: '/datos-maestros', label: 'Datos Maestros', icon: Database },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  React.useEffect(() => {
    if (!isUserLoading && !user && auth) {
      signInAnonymously(auth);
    }
  }, [user, isUserLoading, auth]);

  if (isUserLoading || !user) {
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
