"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { provisionStaffAction } from "@/actions/staff.actions";

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  price: string;
}

interface NewStaffFormProps {
  availableServices: Service[];
}

export function NewStaffForm({ availableServices }: NewStaffFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());

  const [successData, setSuccessData] = useState<{
    tempPassword: string | null;
    isNewUser: boolean;
    email: string;
    name: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  const handleToggleService = (id: string) => {
    const next = new Set(selectedServiceIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedServiceIds(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Personel adı boş bırakılamaz.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Geçerli bir e-posta adresi giriniz.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await provisionStaffAction({
      name: name.trim(),
      email: email.trim(),
      serviceIds: Array.from(selectedServiceIds),
    });

    setLoading(false);

    if (!res.success) {
      setError("error" in res && res.error ? res.error : "Personel oluşturulurken bir hata oluştu.");
    } else {
      setSuccessData({
        tempPassword: "tempPassword" in res ? res.tempPassword : null,
        isNewUser: "isNewUser" in res ? res.isNewUser : false,
        email: email.trim(),
        name: name.trim(),
      });
    }
  };

  const handleCopyPassword = () => {
    if (successData?.tempPassword) {
      navigator.clipboard.writeText(successData.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (successData) {
    return (
      <div className="space-y-6">
        <Alert className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/50">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <AlertTitle className="text-emerald-800 dark:text-emerald-300 font-semibold ml-2">
            Personel Hesabı Oluşturuldu
          </AlertTitle>
          <AlertDescription className="text-emerald-700 dark:text-emerald-400 ml-2 mt-2">
            {successData.name} adlı personel işletmenize başarıyla eklendi.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                Personel Bilgileri
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Ad Soyad</span>
                  <p className="font-medium">{successData.name}</p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">E-posta Adresi</span>
                  <p className="font-medium break-all">{successData.email}</p>
                </div>
              </div>
            </div>

            {successData.isNewUser && successData.tempPassword && (
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                  <ShieldCheck className="h-5 w-5" />
                  <h3 className="font-semibold text-sm">Geçici Şifre Oluşturuldu</h3>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Bu e-posta adresi ile ilk kez bir hesap oluşturulduğu için sistem geçici bir şifre belirledi.
                  Personel ilk girişinde bu şifreyi değiştirmek zorundadır.
                </p>

                <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/20 border-red-500/30 text-red-800 dark:text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="ml-2 font-medium">
                    Bu şifre yalnızca bir kez gösterilir. Lütfen şimdi kopyalayın.
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-4 bg-muted/50 rounded-lg border border-border">
                  <div className="flex-1 space-y-1">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Geçici Şifre</span>
                    <p className="font-mono text-lg font-bold tracking-tight bg-background px-3 py-1.5 rounded-md border border-border inline-block">
                      {successData.tempPassword}
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={handleCopyPassword}
                    className="shrink-0"
                  >
                    {copied ? (
                      <><CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" /> Kopyalandı</>
                    ) : (
                      <><Copy className="mr-2 h-4 w-4" /> Şifreyi Kopyala</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {!successData.isNewUser && (
              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Bu e-posta adresine ait mevcut bir hesap bulunduğu için geçici şifre oluşturulmadı.
                  Personel kendi mevcut şifresiyle giriş yapabilir.
                </p>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <Button onClick={() => router.push("/dashboard/staff")}>
                Personel Listesine Dön
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="pt-6 space-y-8">
          
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
              Personel Bilgileri
            </h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Ad Soyad</Label>
                <Input
                  id="name"
                  placeholder="Örn: Ahmet Yılmaz"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-posta Adresi</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Örn: ahmet@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
              Verebildiği Hizmetler
            </h3>
            
            {availableServices.length === 0 ? (
              <p className="text-sm text-muted-foreground italic bg-muted/50 p-4 rounded-lg border border-border text-center">
                İşletmenizde henüz aktif hizmet bulunmuyor. Personel oluşturduktan sonra hizmet ekleyebilirsiniz.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableServices.map((service) => {
                  const isSelected = selectedServiceIds.has(service.id);
                  return (
                    <div
                      key={service.id}
                      onClick={() => !loading && handleToggleService(service.id)}
                      className={`
                        relative flex flex-col p-3 rounded-lg border cursor-pointer transition-all
                        ${isSelected 
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" 
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"}
                        ${loading ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className={`font-semibold text-sm ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {service.name}
                        </span>
                        <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <CheckCircle2 className="h-3 w-3" />}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-auto pt-2">
                        <Badge variant="secondary" className="text-[10px] px-1.5 font-normal bg-background/50">
                          {service.durationMinutes} dk
                        </Badge>
                        <span className="text-xs font-medium text-muted-foreground">
                          {Number(service.price).toLocaleString("tr-TR")} ₺
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Personelin verebildiği hizmetleri seçin. Daha sonra personel detay sayfasından değiştirebilirsiniz.
            </p>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard/staff")}
              disabled={loading}
            >
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Personel Oluştur
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
