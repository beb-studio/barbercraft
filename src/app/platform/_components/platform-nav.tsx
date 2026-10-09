"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PlatformNav() {
  const pathname = usePathname();

  const isBusinesses = pathname.startsWith("/platform/businesses");
  const isOverview = pathname === "/platform";

  return (
    <nav className="flex items-center gap-1 sm:gap-2">
      <Link
        href="/platform"
        className={cn(
          "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          isOverview
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        Genel Bakış
      </Link>
      <Link
        href="/platform/businesses"
        className={cn(
          "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
          isBusinesses
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        İşletmeler
      </Link>
    </nav>
  );
}
