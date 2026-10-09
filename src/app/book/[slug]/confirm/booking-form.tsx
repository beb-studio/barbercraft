"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Calendar, Scissors, User, Users, AlertCircle, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createPublicAppointmentAction, PublicBookingConfirmation } from "@/actions/public-booking.actions";
import { formatCurrency } from "@/lib/presentation";

interface BookingFormProps {
  slug: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  business: { name: string; currency: string };
  service: { name: string; durationMinutes: number; price: string };
  staff: { displayName: string; profileImageUrl?: string | null };
  slot: { localStartTime: string; localEndTime: string };
  formattedStart: { displayStr: string };
  scheduleBackUrl: string;
  isAnyStaff?: boolean;
}

export function BookingForm({
  slug,
  serviceId,
  staffId,
  startAt,
  business,
  service,
  staff,
  slot,
  formattedStart,
  scheduleBackUrl,
  isAnyStaff = false,
}: BookingFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);
  const [successData, setSuccessData] = useState<PublicBookingConfirmation | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    setIsPending(true);
    setError(null);

    const result = await createPublicAppointmentAction({
      slug,
      serviceId,
      staffId,
      startAt,
      customerName: name,
      customerPhone: phone,
    });

    setIsPending(false);

    if (result.success) {
      setSuccessData(result.data);
    } else {
      setError({ type: result.type, message: result.error });
    }
  }

  // ----------------------------------------
  // SUCCESS STATE
  // ----------------------------------------
  if (successData) {
    return (
      <div className="max-w-3xl mx-auto space-y-10 py-10">
        <div className="flex flex-col items-center justify-center text-center space-y-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Randevunuz Oluşturuldu
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-2 max-w-sm mx-auto">
              Randevu bilgileriniz işletme tarafından görüntülenebilir.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm max-w-lg mx-auto">
          <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-4">
            İşlem Özeti
          </div>

          <div className="space-y-4 text-sm">
            <div className="flex justify-between pb-3 border-b border-border/60">
              <span className="text-muted-foreground">İşletme</span>
              <span className="font-medium text-foreground text-right">{successData.businessName}</span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border/60">
              <span className="text-muted-foreground">Hizmet</span>
              <span className="font-medium text-foreground text-right">{successData.serviceName}</span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border/60">
              <span className="text-muted-foreground">Personel</span>
              <span className="font-medium text-foreground text-right">{successData.staffDisplayName}</span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border/60">
              <span className="text-muted-foreground">Tarih</span>
              <span className="font-medium text-foreground text-right">{successData.localDate}</span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border/60">
              <span className="text-muted-foreground">Saat</span>
              <span className="font-medium text-foreground text-right">
                {successData.localStartTime} - {successData.localEndTime}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tutar</span>
              <span className="font-semibold text-foreground text-right">
                {formatCurrency(successData.formattedPrice, business.currency)}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-6 flex justify-center">
          <Link
            href={`/book/${slug}`}
            className={buttonVariants({ variant: "outline", className: "w-full max-w-lg h-12 text-base" })}
          >
            İşletme Sayfasına Dön
          </Link>
        </div>
      </div>
    );
  }

  // ----------------------------------------
  // FORM OR ERROR STATE
  // ----------------------------------------
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Mobile Step Indicator */}
      <div className="flex items-center gap-2 mb-2 lg:hidden">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          3
        </span>
        <span className="text-sm font-semibold text-muted-foreground">Adım 3 / 3</span>
      </div>

      {/* Header Info */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Bilgiler & Onay
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Lütfen bilgilerinizi kontrol edip randevuyu onaylayın.
        </p>
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center justify-between">
          <span>Seçim Bilgileri</span>
          <Badge variant="outline" className="text-[11px] font-normal text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
            Saat Müsait
          </Badge>
        </div>

        {/* Service */}
        <div className="flex items-start justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm sm:text-base text-foreground">
                {service.name}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {service.durationMinutes} dk
                </span>
                <span>•</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(service.price, business.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Staff */}
        <div className="border-t border-border/60 pt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground border border-border">
            {isAnyStaff ? (
              <Users className="h-5 w-5 text-primary" />
            ) : staff.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={staff.profileImageUrl}
                alt={staff.displayName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="font-medium text-sm text-foreground">
              {staff.displayName}
            </div>
            <div className="text-xs text-muted-foreground">
              {isAnyStaff ? "Uygun personel otomatik atanacak" : "Seçilen Personel"}
            </div>
          </div>
        </div>

        {/* Time & Date */}
        <div className="border-t border-border/60 pt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium text-sm text-foreground">
              {formattedStart.displayStr}
            </div>
            <div className="text-xs text-muted-foreground">
              {slot.localStartTime} - {slot.localEndTime} ({service.durationMinutes} dakika)
            </div>
          </div>
        </div>
      </div>

      {/* SLOT ERROR STATE */}
      {error && error.type === "SLOT_UNAVAILABLE" && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="text-base font-semibold text-foreground">
            Bu saat az önce başka biri tarafından alındı.
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {error.message}
          </p>
          <Link
            href={scheduleBackUrl}
            className={buttonVariants({ variant: "default", className: "w-full" })}
          >
            Başka Saat Seç
          </Link>
        </div>
      )}

      {/* CUSTOMER FORM */}
      {(!error || error.type !== "SLOT_UNAVAILABLE") && (
        <form onSubmit={handleSubmit} className="space-y-6 pt-2">
          {error && error.type !== "SLOT_UNAVAILABLE" && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customerName" className="text-sm font-medium">Ad Soyad <span className="text-destructive">*</span></Label>
              <Input
                id="customerName"
                placeholder="Örn: Ali Yılmaz"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPending}
                required
                className="h-12"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerPhone" className="text-sm font-medium">Telefon Numarası <span className="text-destructive">*</span></Label>
              <Input
                id="customerPhone"
                type="tel"
                placeholder="Örn: 0532 123 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isPending}
                required
                className="h-12"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Randevu bilgileriniz bu numara ile kaydedilecektir.
              </p>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-10 sm:relative sm:p-0 sm:bg-transparent sm:border-0 sm:backdrop-blur-none">
            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-12 text-base font-medium rounded-xl shadow-md sm:h-11 sm:rounded-md"
            >
              {isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {isPending ? "Onaylanıyor..." : "Randevuyu Onayla"}
            </Button>
          </div>
          {/* Spacer for mobile fixed bottom bar */}
          <div className="h-16 sm:hidden" aria-hidden="true" />
        </form>
      )}
    </div>
  );
}
