"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scissors, Loader2, AlertCircle } from "lucide-react";
import { mapAuthError } from "@/lib/presentation";

function getSafeRedirectUrl(target: string | null): string {
  if (!target) return "/dashboard";
  if (target.startsWith("/") && !target.startsWith("//") && !target.includes("://")) {
    return target;
  }
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const returnTo = searchParams.get("returnTo") || searchParams.get("redirect");

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const { error: signInError } = await signIn.email({
        email,
        password,
      });
      if (signInError) {
        setError(mapAuthError(signInError));
      } else {
        const targetUrl = getSafeRedirectUrl(returnTo);
        router.push(targetUrl);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(mapAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[380px] sm:max-w-[400px] mx-auto my-auto flex flex-col justify-center space-y-8">
      {/* Brand Identity & Header */}
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 group transition-opacity hover:opacity-80"
          aria-label="BarberCraft Ana Sayfa"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Scissors className="h-5 w-5" />
          </div>
          <span className="font-bold text-xl tracking-tight text-foreground">
            BarberCraft
          </span>
        </Link>

        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Giriş Yap
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            İşletmenizi yönetmek için e-posta ve şifrenizi girin.
          </p>
        </div>
      </div>

      {/* Login Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            E-posta
          </label>
          <Input
            id="email"
            type="email"
            placeholder="ornek@isletmeniz.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="email"
            className="h-11 bg-background"
            aria-label="E-posta adresi"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Şifre
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
            autoComplete="current-password"
            className="h-11 bg-background"
            aria-label="Şifre"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 text-sm font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2 leading-relaxed"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 text-sm font-medium shadow-sm transition-all"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Giriş yapılıyor...
            </>
          ) : (
            "Giriş Yap"
          )}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 xl:p-12 bg-background">
      {/* Centered Auth Card with Desktop Split */}
      <div className="w-full max-w-md lg:max-w-5xl xl:max-w-6xl min-h-[580px] lg:min-h-[660px] bg-card rounded-2xl lg:rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col lg:flex-row">
        {/* Left Column: Login Form */}
        <div className="w-full lg:w-[44%] xl:w-[42%] flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 bg-card">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" />
                Yükleniyor...
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          {/* Form Bottom Note */}
          <div className="mt-8 pt-6 border-t border-border/50 text-xs text-muted-foreground text-center lg:text-left">
            <span>BarberCraft Güvenli Giriş Sistemi</span>
          </div>
        </div>

        {/* Right Column: B2B Brand & Editorial Panel (Desktop only) */}
        <div className="hidden lg:flex lg:w-[56%] xl:w-[58%] bg-primary text-primary-foreground p-10 lg:p-12 xl:p-16 flex-col justify-between relative overflow-hidden">
          {/* Subtle decorative glow */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-white/[0.04] rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-white/[0.03] rounded-full blur-3xl pointer-events-none" />

          {/* Top Editorial Tag */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider uppercase text-primary-foreground/80 bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10">
              B2B Operasyon Paneli
            </span>
          </div>

          {/* Middle Editorial Content with Optimal Line Length */}
          <div className="relative z-10 my-auto py-10 max-w-xl">
            <blockquote className="space-y-6">
              <p className="text-2xl lg:text-3xl font-medium leading-relaxed tracking-tight text-primary-foreground">
                &ldquo;Randevuları, personeli ve günlük akışı tek bir ekrandan pürüzsüz bir şekilde yönetin.&rdquo;
              </p>
              <footer className="text-primary-foreground/75 text-base leading-relaxed">
                Kuaför ve berber işletmeleri için geliştirilmiş modern randevu, takvim ve ekip yönetim altyapısı.
              </footer>
            </blockquote>
          </div>

          {/* Bottom Trust/Operational Summary */}
          <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-primary-foreground/60">
            <span>BarberCraft B2B Platform</span>
            <span>Profesyonel İşletme Altyapısı</span>
          </div>
        </div>
      </div>
    </div>
  );
}
