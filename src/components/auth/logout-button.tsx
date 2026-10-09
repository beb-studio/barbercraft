"use client";

import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        },
      },
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} className={className}>
      <LogOut className="mr-1.5 h-3.5 w-3.5" />
      Çıkış Yap
    </Button>
  );
}
