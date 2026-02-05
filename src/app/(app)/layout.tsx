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
  Sprout,
  Cherry,
  Users,
  ChevronRight,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChamberStrategyProvider } from '@/contexts/ChamberStrategyContext';

// Define the structure with types and potential nesting
const navStructure: any[] = [
    { type: 'item', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
        type: 'group',
        label: 'Cereza',
        icon: Cherry, // New Icon
        items: [
            { type: 'item', href: '/bins-y-materiales', label: 'Bins y Materiales', icon: Archive },
            { type: 'item', href: '/recepcion', label: 'Recepción', icon: PanelLeft },
            { type: 'item', href: '/hidrocooler', label: 'Hidrocooler', icon: Waves },
            { type: 'item', href: '/camaras', label: 'Cámaras', icon: Building2 },
            { type: 'item', href: '/despachos', label: 'Despachos', icon: Truck },
        ]
    },
    {
        type: 'group',
        label: 'Otros clientes',
        icon: Users, // New Icon
        items: [
            { type: 'item', href: '/embalajes', label: 'Embalajes', icon: Package },
            { type: 'item', href: '/otros-hortofruticolas', label: 'Socios Comerciales', icon: Grape },
            { type: 'item', href: '/fall-creek', label: 'Fall Creek', icon: Sprout },
        ]
    },
    { type: 'item', href: '/reportes', label: 'Reportes', icon: PieChart },
    { type: 'item', href: '/datos-maestros', label: 'Datos Maestros', icon: Database },
];


function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');
  const [accessibleNav, setAccessibleNav] = React.useState<any[] | null>(null);
  const { setOpenMobile } = useSidebar();
  
  const [openCollapsibles, setOpenCollapsibles] = React.useState<Record<string, boolean>>({});

  const isChildActive = React.useCallback((items: any[]): boolean => {
    return items.some(item => 
        (item.type === 'item' && pathname.startsWith(item.href)) ||
        (item.type === 'group' && isChildActive(item.items))
    );
  }, [pathname]);

  React.useEffect(() => {
    // When path changes, open the parent collapsible if a child is active
    const newOpenState: Record<string, boolean> = {};
    const checkAndSetOpen = (items: any[]) => {
      items.forEach(item => {
        if (item.type === 'group') {
          if (isChildActive(item.items)) {
            newOpenState[item.label] = true;
          }
          checkAndSetOpen(item.items); // Recurse
        }
      });
    }
    checkAndSetOpen(navStructure);
    setOpenCollapsibles(newOpenState);
  }, [pathname, isChildActive]);

  React.useEffect(() => {
    if (isUserLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (loadingUsers || loadingProfiles) return;
      
    let accessibleModuleNames: Set<string>;

    if (user.isAnonymous) {
        accessibleModuleNames = new Set(navStructure.flatMap(item => 
            item.type === 'item' ? [item.label] : [item.label, ...item.items.map((sub: any) => sub.label)]
        ));
    } else {
        const emailUsername = user?.email
          ? user.email.split('@')[0].toLowerCase()
          : null;

        let currentUserMaster: UserMaster | null = null;
        let userProfile: Profile | null = null;

        if (emailUsername && users.length > 0 && profiles.length > 0) {
          currentUserMaster = users.find(
            (u) => typeof u.userName === 'string'
              && u.userName.toLowerCase() === emailUsername
          ) ?? null;

          if (currentUserMaster) {
            userProfile = profiles.find(
              (p) => p.profileId === currentUserMaster!.profileId
            ) ?? null;
          }
        }
        
        if (userProfile) {
             accessibleModuleNames = new Set(userProfile.modulesAccess.map((permission: ModulePermission) => 
                typeof permission === 'string' ? permission : permission.name
            ));
        } else {
            accessibleModuleNames = new Set(navStructure.flatMap(item => 
                item.type === 'item' ? [item.label] : [item.label, ...item.items.map((sub: any) => sub.label)]
            ));
        }
    }
      
    const filterNavItems = (items: any[], accessibleNames: Set<string>): any[] => {
      return items.map(item => {
        if (item.type === 'item') {
          return accessibleNames.has(item.label) ? item : null;
        }
        if (item.type === 'group') {
          const accessibleSubItems = filterNavItems(item.items, accessibleNames);
          if (accessibleSubItems.length > 0) {
            return { ...item, items: accessibleSubItems };
          }
          return null;
        }
        return null;
      }).filter(Boolean);
    };

    const filteredNav = filterNavItems(navStructure, accessibleModuleNames);
    setAccessibleNav(filteredNav);

  }, [user, isUserLoading, router, users, profiles, loadingUsers, loadingProfiles]);

  const loading = isUserLoading || accessibleNav === null;

  if (loading || !user) {
    return <LoadingScreen />;
  }
  
  const handleSignOut = async () => {
    if (auth) {
        await signOut(auth);
        router.push('/login');
    }
  }

  const renderNavItem = (item: any, isSubmenu: boolean = false) => {
    if (item.type === 'item') {
        const menuItemContent = (
            <Link href={item.href} className="w-full">
            <SidebarMenuButton
                isActive={pathname.startsWith(item.href)}
                tooltip={item.label}
            >
                <item.icon />
                <span>{item.label}</span>
            </SidebarMenuButton>
            </Link>
        );

        return (
            <SidebarMenuItem key={item.href} onClick={() => setOpenMobile(false)}>
                {menuItemContent}
            </SidebarMenuItem>
        )
    }

    if (item.type === 'group') {
        const active = isChildActive(item.items);

        return (
            <Collapsible 
                key={item.label} 
                open={openCollapsibles[item.label]}
                onOpenChange={(isOpen) => setOpenCollapsibles(prev => ({...prev, [item.label]: isOpen}))}
                className="w-full"
            >
                <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={active} className="w-full justify-between pr-2">
                            <div className="flex items-center gap-2">
                                <item.icon />
                                <span>{item.label}</span>
                            </div>
                            <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform duration-200", openCollapsibles[item.label] && "rotate-90")} />
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                </SidebarMenuItem>
                <CollapsibleContent>
                    <SidebarMenu className="pl-6">
                        {item.items.map((subItem: any) => renderNavItem(subItem, true))}
                    </SidebarMenu>
                </CollapsibleContent>
            </Collapsible>
        )
    }
    return null;
  }

  return (
      <>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center justify-center p-2 h-14">
              <div className="flex items-center gap-1">
                <span className="font-bold text-xl group-data-[collapsible=icon]:hidden">Fri</span>
                <Apple className="w-5 h-5 text-primary" />
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              {accessibleNav.map((item) => renderNavItem(item))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className='group-data-[collapsible=icon]:hidden'>
            <p className="text-xs text-muted-foreground text-center">© 2024 FriO</p>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
           <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b bg-background">
              <SidebarTrigger />
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Cerrar Sesión</span>
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
    <SidebarProvider defaultOpen={true}>
      <ChamberStrategyProvider>
        <AppLayoutContent>{children}</AppLayoutContent>
      </ChamberStrategyProvider>
    </SidebarProvider>
  )
}
