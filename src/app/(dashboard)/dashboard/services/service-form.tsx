"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import {
  createDashboardServiceAction,
  updateDashboardServiceAction,
} from "@/actions/service.actions";
import { getCurrencySymbol } from "@/lib/presentation";

interface ServiceFormProps {
  mode: "create" | "edit";
  serviceId?: string;
  initialData?: {
    name: string;
    description?: string | null;
    durationMinutes: number;
    price: string;
    active?: boolean;
  };
  currency: string;
}

export function ServiceForm({
  mode,
  serviceId,
  initialData,
  currency,
}: ServiceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    initialData ? String(initialData.durationMinutes) : ""
  );
  const [price, setPrice] = useState(initialData?.price ?? "");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Lütfen hizmet adını girin.");
      return;
    }

    const durationNum = Number(durationMinutes);
    if (
      !durationMinutes ||
      isNaN(durationNum) ||
      !Number.isInteger(durationNum) ||
      durationNum <= 0 ||
      durationNum > 1440
    ) {
      setError("Lütfen 1 ile 1440 dakika arasında geçerli bir süre girin.");
      return;
    }

    const priceNum = Number(price);
    if (!price || isNaN(priceNum) || priceNum < 0) {
      setError("Lütfen geçerli ve pozitif bir fiyat girin.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "create") {
        const res = await createDashboardServiceAction({
          name: trimmedName,
          description: description.trim() || undefined,
          durationMinutes: durationNum,
          price: price.trim(),
          active: true,
        });

        if (!res.success) {
          setError(res.error || "Hizmet oluşturulamadı.");
          setLoading(false);
          return;
        }
      } else {
        if (!serviceId) {
          setError("Hizmet ID bulunamadı.");
          setLoading(false);
          return;
        }

        const res = await updateDashboardServiceAction({
          serviceId,
          name: trimmedName,
          description: description.trim() || undefined,
          durationMinutes: durationNum,
          price: price.trim(),
        });

        if (!res.success) {
          setError(res.error || "Hizmet güncellenemedi.");
          setLoading(false);
          return;
        }
      }

      router.push("/dashboard/services");
      router.refresh();
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

      <div className="space-y-1.5">
        <Label htmlFor="service-name" className="text-sm font-medium">
          Hizmet Adı *
        </Label>
        <Input
          id="service-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn: Saç Kesimi"
          className="h-11"
          required
          maxLength={100}
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="service-description" className="text-sm font-medium">
          Açıklama <span className="text-xs font-normal text-muted-foreground">(İsteğe bağlı)</span>
        </Label>
        <Input
          id="service-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Hizmet detayları ve açıklaması"
          className="h-11"
          maxLength={500}
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="service-duration" className="text-sm font-medium">
            Süre *
          </Label>
          <div className="relative">
            <Input
              id="service-duration"
              name="durationMinutes"
              type="number"
              inputMode="numeric"
              min="1"
              max="1440"
              step="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              placeholder="30"
              className="h-11 pr-10"
              required
              disabled={loading}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">
              dk
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="service-price" className="text-sm font-medium">
            Fiyat *
          </Label>
          <div className="relative">
            <Input
              id="service-price"
              name="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="250"
              className="h-11 pr-12"
              required
              disabled={loading}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground pointer-events-none">
              {getCurrencySymbol(currency)}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-4 flex flex-col gap-2.5">
        <Button
          type="submit"
          className="w-full h-11 font-medium text-sm"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === "create" ? "Hizmet Ekleniyor..." : "Güncelleniyor..."}
            </>
          ) : (
            mode === "create" ? "Hizmeti Kaydet" : "Değişiklikleri Kaydet"
          )}
        </Button>

        <Link
          href="/dashboard/services"
          className="inline-flex items-center justify-center h-11 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Vazgeç
        </Link>
      </div>
    </form>
  );
}
