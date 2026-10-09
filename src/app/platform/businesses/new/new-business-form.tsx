"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { provisionBusinessAction } from "@/actions/platform-admin.actions";
import { Copy, Check, Info } from "lucide-react";

export function NewBusinessForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    businessId: string;
    tempPassword?: string;
    isNewUser?: boolean;
    ownerEmail: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const ownerEmail = formData.get("ownerEmail")?.toString().trim() || "";

    const res = await provisionBusinessAction(formData);

    setLoading(false);

    if (!res.success) {
      setError("error" in res && res.error ? res.error : "İşletme oluşturulurken bir hata oluştu.");
    } else {
      setSuccessData({
        businessId: "businessId" in res ? (res.businessId as string) : "",
        tempPassword: ("tempPassword" in res && res.tempPassword) ? res.tempPassword : undefined,
        isNewUser: "isNewUser" in res ? res.isNewUser : false,
        ownerEmail,
      });
    }
  };

  const copyPassword = () => {
    if (successData?.tempPassword) {
      navigator.clipboard.writeText(successData.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (successData) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900 rounded-lg flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-800 dark:text-emerald-300">
              İşletme Başarıyla Oluşturuldu
            </h3>
            <p className="text-emerald-700 dark:text-emerald-400/90 text-sm mt-1">
              {successData.isNewUser
                ? "Yeni işletme yöneticisi hesabı oluşturuldu ve yetkilendirildi."
                : "Mevcut kullanıcı hesabına işletme yöneticisi yetkisi eklendi."}
            </p>
          </div>
        </div>

        {successData.isNewUser && successData.tempPassword && (
          <div className="p-5 border border-border/60 rounded-lg space-y-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-foreground">Geçici Şifre Oluşturuldu</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Yönetici ilk girişinde bu şifreyi kullanacak ve hemen ardından yeni bir şifre belirlemeye zorlanacaktır. 
                  Lütfen bu şifreyi yönetici ile güvenli bir şekilde paylaşın.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <div className="flex-1 bg-muted p-3 rounded-md font-mono text-sm border border-border/50 text-center tracking-wider">
                {successData.tempPassword}
              </div>
              <button
                onClick={copyPassword}
                type="button"
                className="h-11 px-4 bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center gap-2 rounded-md font-medium transition-colors border border-border/50"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>
            
            <p className="text-xs text-rose-500 font-medium text-center mt-2">
              Bu şifre yalnızca BİR KEZ gösterilmektedir. Lütfen kopyaladığınızdan emin olun.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button
            onClick={() => router.push(`/platform/businesses/${successData.businessId}`)}
            className="h-10 px-6 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            İşletme Detayına Git
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 text-sm bg-rose-50 border border-rose-200 text-rose-600 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-medium text-lg border-b pb-2">İşletme Bilgileri</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">İşletme Adı <span className="text-rose-500">*</span></label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Örn: Elite Barber Shop"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="slug" className="text-sm font-medium">Bağlantı (URL) <span className="text-rose-500">*</span></label>
            <div className="flex items-center">
              <span className="flex items-center h-10 px-3 bg-muted border border-r-0 border-input rounded-l-md text-muted-foreground text-sm">
                barbercraft.com/
              </span>
              <input
                type="text"
                id="slug"
                name="slug"
                required
                pattern="[a-z0-9-]+"
                title="Sadece küçük harf, rakam ve tire (-) kullanılabilir"
                className="flex h-10 w-full rounded-r-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="elite-barber"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="timezone" className="text-sm font-medium">Zaman Dilimi</label>
            <select
              id="timezone"
              name="timezone"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              defaultValue="Europe/Istanbul"
            >
              <option value="Europe/Istanbul">Avrupa/İstanbul (TSİ)</option>
              <option value="Europe/London">Avrupa/Londra (GMT)</option>
              <option value="America/New_York">Amerika/New York (EST)</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="currency" className="text-sm font-medium">Para Birimi</label>
            <select
              id="currency"
              name="currency"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              defaultValue="TRY"
            >
              <option value="TRY">Türk Lirası (₺)</option>
              <option value="USD">Amerikan Doları ($)</option>
              <option value="EUR">Euro (€)</option>
              <option value="GBP">İngiliz Sterlini (£)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <h3 className="font-medium text-lg border-b pb-2">Yönetici (OWNER) Bilgileri</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="ownerName" className="text-sm font-medium">Yönetici Adı <span className="text-rose-500">*</span></label>
            <input
              type="text"
              id="ownerName"
              name="ownerName"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Örn: Ahmet Yılmaz"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="ownerEmail" className="text-sm font-medium">E-posta Adresi <span className="text-rose-500">*</span></label>
            <input
              type="email"
              id="ownerEmail"
              name="ownerEmail"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="ornek@email.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Bu e-posta kayıtlı ise mevcut hesaba yetki verilir, değilse yeni hesap oluşturulur.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-6 gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md text-sm font-medium transition-colors"
        >
          İptal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-sm font-medium transition-colors min-w-[120px]"
        >
          {loading ? "Oluşturuluyor..." : "İşletme Oluştur"}
        </button>
      </div>
    </form>
  );
}
