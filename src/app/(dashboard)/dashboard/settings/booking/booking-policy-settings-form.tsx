"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  RotateCcw,
  Save,
  TriangleAlert,
} from "lucide-react";
import {
  updateBusinessBookingPolicyAction,
  type BusinessBookingPolicySettingsDto,
} from "@/actions/business-booking-policy.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  BookingPolicyTimeUnit,
  BusinessBookingPolicyFormValues,
  PolicyDurationInput,
} from "@/lib/business-booking-policy-presentation";

const UNIT_OPTIONS: Array<{ value: BookingPolicyTimeUnit; label: string }> = [
  { value: "MINUTE", label: "Dakika" },
  { value: "HOUR", label: "Saat" },
  { value: "DAY", label: "Gün" },
];

interface DurationFieldProps {
  id: string;
  label: string;
  description: string;
  value: PolicyDurationInput;
  zeroHint?: string;
  disabled: boolean;
  onChange: (value: PolicyDurationInput) => void;
}

function DurationField({
  id,
  label,
  description,
  value,
  zeroHint,
  disabled,
  onChange,
}: DurationFieldProps) {
  const descriptionId = `${id}-description`;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">{label}</legend>
      <p id={descriptionId} className="text-sm leading-5 text-muted-foreground">
        {description}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(118px,0.55fr)] gap-2 sm:max-w-md">
        <div>
          <Label htmlFor={`${id}-amount`} className="sr-only">
            {label} miktarı
          </Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={value.amount}
            onChange={(event) =>
              onChange({ ...value, amount: event.target.value })
            }
            aria-describedby={descriptionId}
            className="h-11 font-mono"
            disabled={disabled}
            required
          />
        </div>
        <div>
          <Label htmlFor={`${id}-unit`} className="sr-only">
            {label} birimi
          </Label>
          <select
            id={`${id}-unit`}
            value={value.unit}
            onChange={(event) =>
              onChange({
                ...value,
                unit: event.target.value as BookingPolicyTimeUnit,
              })
            }
            aria-describedby={descriptionId}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {zeroHint && value.amount === "0" && (
        <p className="text-xs font-medium text-primary">{zeroHint}</p>
      )}
    </fieldset>
  );
}

export function BookingPolicySettingsForm({
  initialSettings,
}: {
  initialSettings: BusinessBookingPolicySettingsDto;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [values, setValues] = useState<BusinessBookingPolicyFormValues>(
    initialSettings.values
  );
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyServerSettings(next: BusinessBookingPolicySettingsDto) {
    setSettings(next);
    setValues(next.values);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setFeedback(null);

    startTransition(async () => {
      const result = await updateBusinessBookingPolicyAction({
        expectedVersion: settings.version,
        minimumBookingLeadAmount: values.minimumBookingLead.amount,
        minimumBookingLeadUnit: values.minimumBookingLead.unit,
        maximumAdvanceUnlimited: values.maximumAdvanceUnlimited,
        maximumAdvanceBookingDays: values.maximumAdvanceBookingDays,
        cancellationNoticeAmount: values.cancellationNotice.amount,
        cancellationNoticeUnit: values.cancellationNotice.unit,
        rescheduleNoticeAmount: values.rescheduleNotice.amount,
        rescheduleNoticeUnit: values.rescheduleNotice.unit,
      });

      if (result.data) applyServerSettings(result.data);
      setFeedback({
        kind: result.success ? "success" : "error",
        message: result.success ? result.message : result.error,
      });
      if (result.success || result.type === "STALE") router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)] xl:items-start">
      <Card className="border-border shadow-xs">
        <CardHeader className="border-b border-border/70 px-4 py-5 sm:px-6">
          <CardTitle className="text-lg">Müşteri İşlem Kuralları</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Bu kurallar müşterilerin çevrim içi işlemlerine uygulanır;
            personelin manuel randevu ve iç yönetim işlemlerini kısıtlamaz.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={submit} noValidate className="space-y-7">
            {feedback && (
              <div
                className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                  feedback.kind === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
                role={feedback.kind === "success" ? "status" : "alert"}
                aria-live={feedback.kind === "success" ? "polite" : "assertive"}
              >
                {feedback.kind === "success" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                )}
                <p className="font-medium">{feedback.message}</p>
              </div>
            )}

            <DurationField
              id="minimum-booking-lead"
              label="En erken randevu"
              description="Müşteri en erken ne kadar süre sonrasına randevu alabilir?"
              value={values.minimumBookingLead}
              zeroHint="Bekleme yok; uygun olan ilk saat seçilebilir."
              disabled={isPending}
              onChange={(minimumBookingLead) =>
                setValues((current) => ({ ...current, minimumBookingLead }))
              }
            />

            <fieldset className="space-y-3 border-t border-border/70 pt-6">
              <legend className="text-sm font-semibold text-foreground">
                En ileri randevu tarihi
              </legend>
              <p
                id="maximum-advance-description"
                className="text-sm leading-5 text-muted-foreground"
              >
                Müşterilerin en fazla kaç gün sonrasına randevu alabileceğini
                belirleyin.
              </p>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-medium text-foreground sm:max-w-md">
                <input
                  type="checkbox"
                  checked={values.maximumAdvanceUnlimited}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      maximumAdvanceUnlimited: event.target.checked,
                    }))
                  }
                  disabled={isPending}
                  className="h-5 w-5 rounded border-border accent-primary"
                  aria-describedby="maximum-advance-description"
                />
                Sınırsız
              </label>
              {!values.maximumAdvanceUnlimited && (
                <div className="sm:max-w-md">
                  <Label htmlFor="maximum-advance-days">Gün sayısı</Label>
                  <div className="relative mt-2">
                    <Input
                      id="maximum-advance-days"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="730"
                      step="1"
                      value={values.maximumAdvanceBookingDays}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          maximumAdvanceBookingDays: event.target.value,
                        }))
                      }
                      aria-describedby="maximum-advance-description"
                      className="h-11 pr-14 font-mono"
                      disabled={isPending}
                      required
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                      gün
                    </span>
                  </div>
                </div>
              )}
            </fieldset>

            <div className="border-t border-border/70 pt-6">
              <DurationField
                id="cancellation-notice"
                label="İptal için minimum süre"
                description="Müşteri, randevu başlamadan en az ne kadar önce iptal edebilir?"
                value={values.cancellationNotice}
                zeroHint="Randevu başlayana kadar"
                disabled={isPending}
                onChange={(cancellationNotice) =>
                  setValues((current) => ({ ...current, cancellationNotice }))
                }
              />
            </div>

            <div className="border-t border-border/70 pt-6">
              <DurationField
                id="reschedule-notice"
                label="Değişiklik için minimum süre"
                description="Müşteri, randevu başlamadan en az ne kadar önce tarih veya saati değiştirebilir?"
                value={values.rescheduleNotice}
                zeroHint="Randevu başlayana kadar"
                disabled={isPending}
                onChange={(rescheduleNotice) =>
                  setValues((current) => ({ ...current, rescheduleNotice }))
                }
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-6 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  setValues(settings.values);
                  setFeedback(null);
                }}
                disabled={isPending}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Değişiklikleri Sıfırla
              </Button>
              <Button
                type="submit"
                className="h-11 sm:min-w-44"
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Kuralları Kaydet
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4 xl:sticky xl:top-20">
        <Card className="border-primary/15 bg-primary/[0.025] shadow-xs">
          <CardHeader className="px-4 pb-3 pt-5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
              Geçerli Kural Özeti
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-5 sm:px-5">
            <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
              {settings.summary.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-1 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
          <div className="flex items-start gap-2.5">
            <Info className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">Güncel politika uygulanır</p>
              <p className="mt-1">
                Kaydettiğiniz iptal ve değişiklik süreleri mevcut randevuların
                sonraki çevrim içi işlemlerinde de geçerlidir.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          Tarih sınırları {settings.timezone} saat dilimine göre hesaplanır.
        </div>
      </div>
    </div>
  );
}
