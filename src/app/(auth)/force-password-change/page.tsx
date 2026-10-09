import { requireSession } from "@/lib/auth/guards";
import { ForcePasswordChangeForm } from "./form";

export const metadata = {
  title: "Şifrenizi Değiştirin - BarberCraft",
};

export default async function ForcePasswordChangePage() {
  const user = await requireSession();
  
  // If they don't need to change it, redirect to dashboard
  if (!user.forcePasswordChange) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Güvenlik Güncellemesi
        </h1>
        <p className="text-muted-foreground text-sm">
          Hesabınızın güvenliği için lütfen platform yöneticisi tarafından size verilen geçici şifreyi değiştirin.
        </p>
      </div>

      <ForcePasswordChangeForm userId={user.id} />
    </div>
  );
}
