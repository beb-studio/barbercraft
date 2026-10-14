"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, LayoutDashboard, Settings, Scissors, Users, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  /** "dashboard" for authenticated business members, "public" for visitors. */
  variant?: "public" | "dashboard";
  userRole?: string;
}

export function MobileNav({ variant = "public", userRole }: MobileNavProps) {
  const pathname = usePathname();

  const navItems = variant === "dashboard"
    ? (userRole === "STAFF"
      ? [
          { href: "/dashboard", label: "Bugün", icon: LayoutDashboard },
          { href: "/dashboard/appointments", label: "Ajanda", icon: Calendar },
          { href: "/dashboard/appointments/new", label: "Yeni Randevu", icon: Plus },
        ]
      : [
          { href: "/dashboard", label: "Genel Bakış", icon: LayoutDashboard },
          { href: "/dashboard/appointments", label: "Randevular", icon: Calendar },
          ...(userRole === "OWNER" || userRole === "MANAGER"
            ? [
                { href: "/dashboard/services", label: "Hizmetler", icon: Scissors },
                { href: "/dashboard/staff", label: "Personel", icon: Users },
              ]
            : []),
          { href: "/dashboard/settings", label: "Ayarlar", icon: Settings },
        ])
    : [
        { href: "/", label: "Randevu Al", icon: Calendar },
        { href: "/login", label: "Giriş Yap", icon: LayoutDashboard },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 block border-t bg-background/95 backdrop-blur md:hidden">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-12 min-w-16 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors",
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
