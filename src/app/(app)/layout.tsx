
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
  SidebarMenuBadge,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useFirestoreCollection } from '@/hooks/use-firestore-collection';
import type { UserMaster, Profile, ModulePermission, OtherFruitReception, PackagingReception, OtherFruitMovement, PackagingMovement, Dispatch } from '@/lib/types';
import { signOut } from 'firebase/auth';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { FrioLogo } from '@/components/ui/FrioLogo';
import { CustomAppleIcon } from '@/components/ui/CustomAppleIcon';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { PwaInstallButton } from '@/components/pwa-install-button';

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
        label: 'Clientes',
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

const grueroNavStructure: any[] = [
    { type: 'item', href: '/camaras', label: 'Cámaras', icon: Building2 },
    { type: 'item', href: '/otros-hortofruticolas', label: 'Socios Comerciales', icon: Grape },
];


function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { data: users, loading: loadingUsers } = useFirestoreCollection<UserMaster>('usersMaster');
  const { data: profiles, loading: loadingProfiles } = useFirestoreCollection<Profile>('profiles');

  const { data: otherFruitReceptions, loading: loadingOFR } = useFirestoreCollection<OtherFruitReception>('otherFruitReceptions');
  const { data: packagingReceptions, loading: loadingPR } = useFirestoreCollection<PackagingReception>('packagingReceptions');
  const { data: otherFruitMovements, loading: loadingOFM } = useFirestoreCollection<OtherFruitMovement>('otherFruitMovements');
  const { data: packagingMovements, loading: loadingPM } = useFirestoreCollection<PackagingMovement>('packagingMovements');
  const { data: dispatches, loading: loadingDispatches } = useFirestoreCollection<Dispatch>('dispatches');


  const [accessibleNav, setAccessibleNav] = React.useState<any[] | null>(null);
  const { setOpenMobile } = useSidebar();
  const [activePermissions, setActivePermissions] = React.useState<ModulePermission[]>([]);
  
  const [openCollapsibles, setOpenCollapsibles] = React.useState<Record<string, boolean>>({});

  const isChildActive = React.useCallback((items: any[]): boolean => {
    return items.some(item => 
        (item.type === 'item' && pathname.startsWith(item.href)) ||
        (item.type === 'group' && isChildActive(item.items))
    );
  }, [pathname]);

  const notificationCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};

    const sociosComercialesStorage = (otherFruitReceptions || [])
        .filter(r => r.status === 'Pendiente de almacenar' || r.status === 'Parcialmente Almacenado').length;
    const sociosComercialesPicking = (otherFruitMovements || [])
        .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking').length;
    counts['Socios Comerciales'] = sociosComercialesStorage + sociosComercialesPicking;

    const embalajesStorage = (packagingReceptions || [])
        .filter(r => r.status === 'Pendiente de almacenar' || r.status === 'Parcialmente Almacenado').length;
    const embalajesPicking = (packagingMovements || [])
        .filter(m => m.type === 'salida' && m.status === 'Pendiente de Picking').length;
    counts['Embalajes'] = embalajesStorage + embalajesPicking;

    counts['Despachos'] = (dispatches || []).filter(d => d.status === 'Pendiente de Picking').length;
    
    return counts;
  }, [otherFruitReceptions, otherFruitMovements, packagingReceptions, packagingMovements, dispatches]);
  
  const dynamicNavStructure = React.useMemo(() => {
    const addBadges = (items: any[]): any[] => {
      return items.map(item => {
        if (item.type === 'item') {
          return { ...item, badge: notificationCounts[item.label] || 0 };
        }
        if (item.type === 'group') {
          const newItems = addBadges(item.items);
          const groupBadge = newItems.reduce((sum, subItem) => sum + (subItem.badge || 0), 0);
          return { ...item, items: newItems, badge: groupBadge };
        }
        return item;
      });
    };
    return addBadges(navStructure);
  }, [notificationCounts]);
  

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
    if (isUserLoading || loadingUsers || loadingProfiles) return;

    if (!user) {
      router.push('/login');
      return;
    }
      
    let accessibleModuleNames: Set<string> = new Set();
    let currentUserProfile: Profile | null = null;

    if (!user.isAnonymous) {
        const emailUsername = user?.email
          ? user.email.split('@')[0].toLowerCase()
          : null;

        if (emailUsername && users.length > 0 && profiles.length > 0) {
          const currentUserMaster = users.find(
            (u) => typeof u.userName === 'string'
              && u.userName.toLowerCase() === emailUsername
          ) ?? null;

          if (currentUserMaster) {
            currentUserProfile = profiles.find(
              (p) => p.profileId === currentUserMaster!.profileId
            ) ?? null;
          }
        }
    }
    
    if (currentUserProfile) {
        // Special case for 'grua' profile or any profile containing 'grua'
        if (currentUserProfile.profileId.toLowerCase().includes('grua')) {
            setAccessibleNav(grueroNavStructure);
            setActivePermissions(currentUserProfile.modulesAccess);
            return; // Exit early to use the special nav
        }

        accessibleModuleNames = new Set(currentUserProfile.modulesAccess.map((permission: ModulePermission) =>
            typeof permission === 'string' ? permission : permission.name
        ));
        setActivePermissions(currentUserProfile.modulesAccess);
    } else {
        // Fallback for guest users or logged-in users without a profile: give access to all modules for demo purposes.
        const allModuleNames = navStructure.flatMap(item =>
            item.type === 'item' ? [item.label] : [item.label, ...item.items.map((sub: any) => sub.label)]
        );
        accessibleModuleNames = new Set(allModuleNames);
        setActivePermissions(allModuleNames as any);
    }
      
    const filterNavItems = (items: any[], accessibleNames: Set<string>): any[] => {
      return items.map(item => {
        if (item.type === 'item') {
          return accessibleNames.has(item.label) ? item : null;
        }
        if (item.type === 'group') {
          const accessibleSubItems = filterNavItems(item.items, accessibleNames);
          if (accessibleSubItems.length > 0) {
            return { ...item, items: accessibleSubItems, badge: accessibleSubItems.reduce((sum, i) => sum + (i.badge || 0), 0) };
          }
          return null;
        }
        return null;
      }).filter(Boolean);
    };

    const filteredNav = filterNavItems(dynamicNavStructure, accessibleModuleNames);
    setAccessibleNav(filteredNav);

  }, [user, isUserLoading, router, users, profiles, loadingUsers, loadingProfiles, dynamicNavStructure]);

  React.useEffect(() => {
    if (accessibleNav && pathname === '/dashboard') {
        const hasDashboardAccess = accessibleNav.some(item => item.href === '/dashboard' && item.type === 'item');
        
        if (!hasDashboardAccess) {
            const findFirstHref = (items: any[]): string | null => {
                for (const item of items) {
                    if (item.type === 'item' && item.href) {
                        return item.href;
                    }
                    if (item.type === 'group' && item.items) {
                        const firstChildHref = findFirstHref(item.items);
                        if (firstChildHref) {
                            return firstChildHref;
                        }
                    }
                }
                return null;
            };

            const firstAccessiblePage = findFirstHref(accessibleNav);
            if (firstAccessiblePage && firstAccessiblePage !== '/dashboard') {
                router.push(firstAccessiblePage);
            }
        }
    }
  }, [accessibleNav, pathname, router]);

  const mobileTabs = React.useMemo(() => {
    if (!accessibleNav) return [];
    const flatItems: any[] = [];
    const extract = (list: any[]) => {
      list.forEach(item => {
        if (item.type === 'item') flatItems.push(item);
        else if (item.type === 'group' && item.items) extract(item.items);
      });
    };
    extract(accessibleNav);

    const priorityUris = ['/dashboard', '/recepcion', '/camaras', '/despachos', '/bins-y-materiales', '/reportes'];
    const tabs: any[] = [];
    
    priorityUris.forEach(uri => {
      const found = flatItems.find(i => i.href === uri);
      if (found && tabs.length < 4) tabs.push(found);
    });
    
    flatItems.forEach(item => {
      if (tabs.length < 4 && !tabs.some(t => t.href === item.href)) {
        tabs.push(item);
      }
    });
    
    return tabs;
  }, [accessibleNav]);

  const loading = isUserLoading || accessibleNav === null || loadingOFR || loadingPR || loadingOFM || loadingPM || loadingDispatches;

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
                {item.badge > 0 && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
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
                    {item.badge > 0 && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
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
               <FrioLogo className="text-4xl text-primary group-data-[collapsible=icon]:hidden" />
               <CustomAppleIcon className="text-3xl h-10 w-10 text-primary hidden group-data-[collapsible=icon]:block" />
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
           <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur px-4 shadow-sm">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="md:hidden" />
                <SidebarTrigger className="hidden md:flex" />
                <div className="flex items-center gap-2 md:hidden">
                  <FrioLogo className="text-2xl text-primary" />
                </div>
              </div>
              <div className="flex flex-1 items-center justify-end gap-2">
                <PwaInstallButton />
                {user && (
                  <span className="hidden text-sm text-muted-foreground sm:inline">
                    Bienvenido,{' '}
                    {user.isAnonymous
                      ? 'Invitado'
                      : user.displayName || user.email}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive transition-colors">
                  <LogOut className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Cerrar Sesión</span>
                </Button>
              </div>
            </header>
          <main className="p-4 pb-24 md:pb-4 max-w-[100vw] overflow-x-hidden pt-4 animate-in fade-in-50 duration-300">
            <PermissionsProvider permissions={activePermissions}>
              {children}
            </PermissionsProvider>
          </main>
          
          {/* Navegación Inferior Móvil (Estilo Android/PWA Nativo) */}
          <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t bg-background/95 backdrop-blur-lg py-2 px-1 shadow-lg md:hidden pb-safe animate-in slide-in-from-bottom duration-300">
            {mobileTabs.map((tab) => {
              const isActive = pathname.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 select-none",
                    isActive 
                      ? "text-primary scale-105 font-semibold" 
                      : "text-muted-foreground hover:text-primary font-medium"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full transition-colors", 
                    isActive && "bg-primary/10"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] leading-none tracking-tight truncate max-w-[68px]">
                    {tab.label}
                  </span>
                  {tab.badge > 0 && (
                    <span className="absolute top-0 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground animate-pulse">
                      {tab.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            <button
              onClick={() => setOpenMobile(true)}
              className="flex flex-col items-center justify-center gap-1 py-1 px-3 text-muted-foreground hover:text-primary transition-all duration-200 select-none"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-full">
                <PanelLeft className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium leading-none tracking-tight">Menú</span>
            </button>
          </nav>
        </SidebarInset>
      </>
  );
}


export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppLayoutContent>{children}</AppLayoutContent>
    </SidebarProvider>
  )
}
