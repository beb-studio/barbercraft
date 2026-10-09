"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2, Scissors, ShieldCheck } from "lucide-react";
import { completeOwnerStaffAction } from "@/actions/staff.actions";
import { formatCurrency } from "@/lib/presentation";

export interface ServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  price: string;
}

interface OwnerStaffFormProps {
  services: ServiceItem[];
  currency: string;
}

export function OwnerStaffForm({ services, currency }: OwnerStaffFormProps) {
  const router = useRouter();
  const [decision, setDecision] = useState<"YES" | "NO">("YES");
  // Default to selecting all existing active services if YES
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(
    services.map((s) => s.id)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (decision === "YES" && selectedServiceIds.length === 0) {
      setError("Lütfen verdiğiniz en az bir hizmeti seçin.");
      return;
    }

    setLoading(true);

    try {
      const res = await completeOwnerStaffAction({
        decision,
        serviceIds: decision === "YES" ? selectedServiceIds : undefined,
      });

      if (!res.success) {
        setError(res.error || "Kurulum tamamlanamadı.");
        setLoading(false);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left">
      {error && (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs ml-2 leading-relaxed">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Decision Radio Cards */}
      <div className="space-y-2.5">
        <label
          htmlFor="decision-yes"
          className={`flex items-start p-3.5 rounded-lg border cursor-pointer transition-all min-h-[56px] ${
            decision === "YES"
              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
              : "border-border/70 hover:border-border"
          }`}
        >
          <input
            type="radio"
            id="decision-yes"
            name="decision"
            value="YES"
            checked={decision === "YES"}
            onChange={() => setDecision("YES")}
            className="sr-only"
            disabled={loading}
          />
          <Scissors className="h-5 w-5 text-primary shrink-0 mt-0.5 mr-3" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Evet, hizmet veriyorum
              </span>
              {decision === "YES" && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Müşteriler randevu alırken sizi berber olarak seçebilir.
            </p>
          </div>
        </label>

        <label
          htmlFor="decision-no"
          className={`flex items-start p-3.5 rounded-lg border cursor-pointer transition-all min-h-[56px] ${
            decision === "NO"
              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
              : "border-border/70 hover:border-border"
          }`}
        >
          <input
            type="radio"
            id="decision-no"
            name="decision"
            value="NO"
            checked={decision === "NO"}
            onChange={() => setDecision("NO")}
            className="sr-only"
            disabled={loading}
          />
          <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5 mr-3" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">
                Hayır, sadece işletmeyi yönetiyorum
              </span>
              {decision === "NO" && (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Randevu takviminde görünmezsiniz, sadece yönetim paneline erişirsiniz.
            </p>
          </div>
        </label>
      </div>

      {/* Services Multi-Select when YES is selected */}
      {decision === "YES" && (
        <div className="pt-2 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground tracking-tight">
              Verdiğiniz Hizmetler *
            </span>
            <span className="text-[11px] text-muted-foreground">
              {selectedServiceIds.length} / {services.length} seçildi
            </span>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5">
            {services.map((svc) => {
              const isChecked = selectedServiceIds.includes(svc.id);
              return (
                <label
                  key={svc.id}
                  htmlFor={`service-${svc.id}`}
                  className={`flex items-center justify-between p-3 rounded-md border cursor-pointer min-h-[44px] transition-colors ${
                    isChecked
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/60 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Checkbox
                      id={`service-${svc.id}`}
                      checked={isChecked}
                      onCheckedChange={() => toggleService(svc.id)}
                      disabled={loading}
                    />
                    <div className="text-xs font-medium text-foreground">
                      {svc.name}
                      <span className="text-muted-foreground font-normal ml-1.5">
                        ({svc.durationMinutes} dk)
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-foreground shrink-0">
                    {formatCurrency(svc.price, currency)}
                  </span>
                </label>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded border border-border/40">
            ℹ️ Çalışma saatleri olarak işletmenizin haftalık çalışma saatleri kullanılacaktır.
          </p>
        </div>
      )}

      <div className="pt-2">
        <Button
          type="submit"
          className="w-full h-11 font-medium text-sm"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Kurulum Tamamlanıyor...
            </>
          ) : (
            "Kurulumu Tamamla"
          )}
        </Button>
      </div>
    </form>
  );
}
