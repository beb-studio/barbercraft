"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Building2,
  Menu,
  X,
  User,
  ArrowLeft,
  Activity
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlatformShellProps {
  children: React.ReactNode;
  userRoleLabel: string;
  userName: string;
  userEmail: string;
}

export function PlatformShell({
  children,
  userRoleLabel,
  userName,
  userEmail,
}: PlatformShellProps) {
  const pathname = usePathname();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const navItems = [
    {
      href: "/platform",
      label: "Genel Bakış",
      icon: Activity,
      exact: true,
    },
    {
      href: "/platform/businesses",
      label: "İşletmeler",
      icon: Building2,
      exact: false,
    },
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
        {/* Brand Header */}
        <div className="p-5 border-b border-border/70 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base tracking-tight text-foreground truncate">
                Platform Yönetimi
              </span>
              <span className="text-[11px] font-medium text-muted-foreground tracking-tight">
                Merkezi Yönetim
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Badge
              variant="outline"
              className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-900/20 dark:text-indigo-400"
            >
              {userRoleLabel}
            </Badge>
          </div>
        </div>

        {/* Primary Navigation Links */}
        <nav
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
          aria-label="Platform Navigasyonu"
        >
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Sistem
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
                    ? "bg-indigo-600 text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                    active
                      ? "text-white"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-border/70 flex flex-col gap-3 bg-muted/10">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground bg-background hover:bg-muted border border-border transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold truncate">İşletme Paneli</span>
              <span className="text-[10px] text-muted-foreground">İşletme çalışma alanına dön</span>
            </div>
          </Link>

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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <Shield className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-foreground truncate">
                Platform
              </span>
              <span className="text-[10px] text-muted-foreground">
                {userRoleLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
          <div className="border-b border-border bg-card p-4 space-y-4 animate-in slide-in-from-top-2 duration-200 absolute w-full shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{userEmail}</span>
              </div>
              <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-700 bg-indigo-50">
                {userRoleLabel}
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
                        ? "bg-indigo-600 text-white font-semibold"
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
              <Link
                href="/dashboard"
                onClick={() => setMobileDrawerOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-background rounded-md border border-border"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>İşletme Paneline Dön</span>
              </Link>
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
              Platform Yönetimi
            </span>
            <span className="text-muted-foreground text-xs">•</span>
            <span className="text-xs text-muted-foreground">
              {pathname === "/platform"
                ? "Genel Bakış"
                : pathname.startsWith("/platform/businesses")
                ? "İşletmeler"
                : "Sistem"}
            </span>
          </div>
        </header>

        {/* Workspace Content Region */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 xl:p-10 pb-24 md:pb-10 max-w-[1600px] mx-auto w-full">
          {children}
        </main>
      </div>

      {/* ============================================================ */}
      {/* MOBILE BOTTOM NAVIGATION (< lg)                              */}
      {/* ============================================================ */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 block border-t border-border bg-card/95 backdrop-blur-md lg:hidden pb-safe"
        aria-label="Mobil Alt Menü"
      >
        <div className="flex h-16 items-center justify-around px-2 pb-2 sm:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isLinkActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-12 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active
                    ? "text-indigo-600 font-bold dark:text-indigo-400"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "scale-110 transition-transform")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
