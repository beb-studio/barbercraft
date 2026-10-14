"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Scissors,
  Users,
  ExternalLink,
  Shield,
  Menu,
  X,
  User,
  Settings,
  BellRing,
  Plus,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
  businessName: string;
  businessSlug: string;
  userRole: "OWNER" | "MANAGER" | "STAFF";
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
}

export function DashboardShell({
  children,
  businessName,
  businessSlug,
  userRole,
  userName,
  userEmail,
  isPlatformAdmin,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "OWNER":
        return "İşletme Sahibi";
      case "MANAGER":
      case "ADMIN":
        return "İşletme Yöneticisi";
      case "STAFF":
        return "Personel";
      default:
        return role;
    }
  };

  const navItems =
    userRole === "STAFF"
      ? [
          {
            href: "/dashboard",
            label: "Programım",
            mobileLabel: "Bugün",
            icon: LayoutDashboard,
            exact: true,
            showInBottomNav: true,
          },
          {
            href: "/dashboard/appointments",
            label: "Ajanda",
            mobileLabel: "Ajanda",
            icon: Calendar,
            exact: false,
            showInBottomNav: true,
          },
          {
            href: "/dashboard/appointments/new",
            label: "Yeni Randevu",
            mobileLabel: "Yeni Randevu",
            icon: Plus,
            exact: false,
            showInBottomNav: true,
          },
        ]
      : [
          {
            href: "/dashboard",
            label: "Genel Bakış",
            mobileLabel: "Genel Bakış",
            icon: LayoutDashboard,
            exact: true,
            showInBottomNav: true,
          },
          {
            href: "/dashboard/appointments",
            label: "Randevular",
            mobileLabel: "Randevular",
            icon: Calendar,
            exact: false,
            showInBottomNav: true,
          },
          ...(userRole === "OWNER" || userRole === "MANAGER"
            ? [
                {
                  href: "/dashboard/services",
                  label: "Hizmetler",
                  mobileLabel: "Hizmetler",
                  icon: Scissors,
                  exact: false,
                  showInBottomNav: true,
                },
                {
                  href: "/dashboard/staff",
                  label: "Personel",
                  mobileLabel: "Personel",
                  icon: Users,
                  exact: false,
                  showInBottomNav: true,
                },
                {
                  href: "/dashboard/customers",
                  label: "Müşteriler",
                  mobileLabel: "Müşteriler",
                  icon: User,
                  exact: false,
                  showInBottomNav: true,
                },
                {
                  href: "/dashboard/settings/booking",
                  label: "Randevu Kuralları",
                  mobileLabel: "Randevu Kuralları",
                  icon: Settings,
                  exact: false,
                  showInBottomNav: false,
                },
                {
                  href: "/dashboard/settings/notifications",
                  label: "Bildirimler",
                  mobileLabel: "Bildirimler",
                  icon: BellRing,
                  exact: false,
                  showInBottomNav: false,
                },
              ]
            : []),
        ];

  const isLinkActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* ============================================================ */}
      {/* DESKTOP SIDEBAR (>= lg)                                     */}
      {/* ============================================================ */}
      <aside className="hidden lg:flex flex-col w-64 xl:w-72 border-r border-border bg-card shrink-0 h-screen sticky top-0 z-30">
        {/* Brand & Business Header */}
        <div className="p-5 border-b border-border/70 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Scissors className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base tracking-tight text-foreground truncate">
                {businessName}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-tight">
                İşletme Yönetimi
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Badge
              variant="outline"
              className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 border-border bg-muted/40 text-foreground/80"
            >
              {getRoleLabel(userRole)}
            </Badge>
            {businessSlug && (
              <Link
                href={`/book/${businessSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                title="Müşteri rezervasyon sayfasını yeni sekmede aç"
              >
                <span>Online Sayfa</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Primary Navigation Links */}
        <nav
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
          aria-label="İşletme Navigasyonu"
        >
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Yönetim
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isLinkActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                  active
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                    active
                      ? "text-primary-foreground"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer: Platform Link + User & Logout */}
        <div className="p-4 border-t border-border/70 flex flex-col gap-3 bg-muted/10">
          {isPlatformAdmin && (
            <Link
              href="/platform"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground bg-primary/5 hover:bg-primary/10 border border-primary/20 transition-colors"
            >
              <Shield className="h-4 w-4 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-semibold truncate">Platform Yönetimi</span>
                <span className="text-[10px] text-muted-foreground">Süper Yönetici Paneli</span>
              </div>
            </Link>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground border border-border">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-foreground truncate max-w-[110px] xl:max-w-[130px]">
                  {userName || "Kullanıcı"}
                </span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[110px] xl:max-w-[130px]">
                  {userEmail}
                </span>
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MOBILE / TABLET TOP HEADER (< lg)                           */}
      {/* ============================================================ */}
      <header className="lg:hidden sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <Scissors className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-foreground truncate">
                {businessName}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {getRoleLabel(userRole)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {businessSlug && (
              <Link
                href={`/book/${businessSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex items-center gap-1 border rounded-md px-2 py-1"
              >
                <span>Online Sayfa</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              aria-label="Menüyü aç/kapat"
            >
              {mobileDrawerOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileDrawerOpen && (
          <div className="border-b border-border bg-card p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{userEmail}</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {getRoleLabel(userRole)}
              </Badge>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isLinkActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-2 border-t border-border/60 flex flex-col gap-2">
              {isPlatformAdmin && (
                <Link
                  href="/platform"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary bg-primary/5 rounded-md border border-primary/20"
                >
                  <Shield className="h-4 w-4" />
                  <span>Platform Yönetimi</span>
                </Link>
              )}
              {businessSlug && (
                <Link
                  href={`/book/${businessSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground sm:hidden"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Online Müşteri Sayfası</span>
                </Link>
              )}
              <div className="pt-2">
                <LogoutButton />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ============================================================ */}
      {/* MAIN WORKSPACE CANVAS                                        */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Top Workspace Bar */}
        <header className="hidden lg:flex h-14 border-b border-border bg-card/60 backdrop-blur-md px-6 xl:px-8 items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">
              {businessName}
            </span>
            <span className="text-muted-foreground text-xs">•</span>
            <span className="text-xs text-muted-foreground">
              {pathname === "/dashboard"
                ? (userRole === "STAFF" ? "Programım" : "Genel Bakış")
                : pathname === "/dashboard/appointments/new"
                ? "Yeni Randevu"
                : pathname.startsWith("/dashboard/appointments")
                ? (userRole === "STAFF" ? "Ajanda" : "Randevular")
                : pathname.startsWith("/dashboard/services")
                ? "Hizmetler"
                : pathname.startsWith("/dashboard/staff")
                ? "Personel"
                : pathname.startsWith("/dashboard/customers")
                ? "Müşteriler"
                : pathname.startsWith("/dashboard/settings")
                ? "Randevu Kuralları"
                : "Yönetim"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {businessSlug && (
              <Link
                href={`/book/${businessSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors shadow-2xs"
              >
                <span>Müşteri Sayfası</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </header>

        {/* Workspace Content Region */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 pb-24 md:pb-10 max-w-[1600px] mx-auto w-full">
          {children}
        </main>
      </div>

      {/* ============================================================ */}
      {/* MOBILE BOTTOM NAVIGATION (< md)                              */}
      {/* ============================================================ */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 block border-t border-border bg-card/95 backdrop-blur-md md:hidden"
        aria-label="Mobil Alt Menü"
      >
        <div className="flex h-16 items-center justify-around px-2">
          {navItems.filter((item) => item.showInBottomNav).map((item) => {
            const Icon = item.icon;
            const active = isLinkActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-12 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
                <span>{item.mobileLabel ?? item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
