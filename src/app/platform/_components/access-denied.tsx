import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export function PlatformAccessDenied() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-6 text-center shadow-lg space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">Erişim Engellendi</h1>
          <p className="text-sm text-muted-foreground">
            Bu alana yalnızca yetkili platform yöneticileri erişebilir. İşletme sahibi, yöneticisi veya personeli olmanız platform yönetici yetkisi sağlamaz.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Yönetim Paneline Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
