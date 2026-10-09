import Link from "next/link";
import { Scissors, User } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeaderProps {
  shopName?: string;
  isDashboard?: boolean;
  showPlatformLink?: boolean;
}

export function Header({
  shopName = "BarberCraft",
  isDashboard = false,
  showPlatformLink = false,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-screen-md items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
            <Scissors className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-foreground leading-none">
              {shopName}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {isDashboard ? "Yönetim Paneli" : "Randevu"}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {showPlatformLink && (
            <Link
              href="/platform"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "text-xs gap-1 text-primary border-primary/30"
              )}
            >
              Platform
            </Link>
          )}

          {isDashboard ? (
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Ana Sayfa
            </Link>
          ) : (
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-9 gap-1.5 px-3"
              )}
            >
              <User className="h-4 w-4" />
              <span className="text-xs font-medium">Giriş Yap</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
