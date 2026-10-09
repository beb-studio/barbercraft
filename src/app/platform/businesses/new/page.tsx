import { requirePlatformAdmin } from "@/lib/auth/guards";
import { NewBusinessForm } from "./new-business-form";

export const metadata = {
  title: "Yeni İşletme Oluştur - Platform",
};

export default async function NewBusinessPage() {
  await requirePlatformAdmin();

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yeni İşletme Oluştur</h1>
        <p className="text-muted-foreground mt-1">
          Platforma yeni bir işletme ekleyin ve yönetici (OWNER) hesabını yetkilendirin.
        </p>
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-6 shadow-sm">
        <NewBusinessForm />
      </div>
    </div>
  );
}
