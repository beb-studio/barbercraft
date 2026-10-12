"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CheckCircle2,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  updateBusinessNotificationSettingsAction,
  type NotificationSettingsDto,
  type NotificationSettingsValues,
} from "@/actions/business-notification-settings.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  MAXIMUM_REMINDER_RULES,
  type NotificationReminderTimeUnit,
  type ReminderDurationInput,
} from "@/lib/notification-settings";

const units: Array<{ value: NotificationReminderTimeUnit; label: string }> = [
  { value: "MINUTE", label: "Dakika" },
  { value: "HOUR", label: "Saat" },
  { value: "DAY", label: "Gün" },
];

function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border bg-background px-3 py-3 sm:px-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-semibold text-foreground">
          {label}
        </Label>
        <p id={`${id}-description`} className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={`${id}-description`}
      />
    </div>
  );
}

function ReminderRow({
  index,
  value,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  value: ReminderDurationInput;
  disabled: boolean;
  onChange: (value: ReminderDurationInput) => void;
  onRemove: () => void;
}) {
  const id = `reminder-rule-${index}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_110px_44px] gap-2 rounded-xl border border-border bg-background p-2 sm:grid-cols-[minmax(0,180px)_130px_44px]">
      <div>
        <Label htmlFor={`${id}-amount`} className="sr-only">Hatırlatma miktarı</Label>
        <Input
          id={`${id}-amount`}
          className="h-11 font-mono"
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={value.amount}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
        />
      </div>
      <div>
        <Label htmlFor={`${id}-unit`} className="sr-only">Hatırlatma birimi</Label>
        <select
          id={`${id}-unit`}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          value={value.unit}
          disabled={disabled}
          onChange={(event) => onChange({
            ...value,
            unit: event.target.value as NotificationReminderTimeUnit,
          })}
        >
          {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
        </select>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        onClick={onRemove}
        aria-label="Hatırlatmayı kaldır"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function NotificationSettingsForm({
  initialSettings,
}: {
  initialSettings: NotificationSettingsDto;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [values, setValues] = useState<NotificationSettingsValues>(initialSettings.values);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const controlsDisabled = isPending || !values.customerNotificationsEnabled;

  function applyServerSettings(next: NotificationSettingsDto) {
    setSettings(next);
    setValues(next.values);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await updateBusinessNotificationSettingsAction({
        expectedVersion: settings.version,
        ...values,
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] xl:items-start">
      <Card className="border-border shadow-xs">
        <CardHeader className="border-b border-border/70 px-4 py-5 sm:px-6">
          <CardTitle className="text-lg">Müşteri Bildirimleri</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Bu ayarlar müşterilerin çevrim içi randevu bildirimlerini yönetir.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form className="space-y-6" noValidate onSubmit={submit}>
            {feedback && (
              <div
                role={feedback.kind === "success" ? "status" : "alert"}
                aria-live={feedback.kind === "success" ? "polite" : "assertive"}
                className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${feedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              >
                {feedback.kind === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
                <p className="font-medium">{feedback.message}</p>
              </div>
            )}

            <ToggleRow
              id="customer-notifications-enabled"
              label="Müşteri bildirimlerini etkinleştir"
              description="Etkin değilken yeni müşteri bildirimi veya hatırlatması planlanmaz."
              checked={values.customerNotificationsEnabled}
              disabled={isPending}
              onCheckedChange={(customerNotificationsEnabled) => setValues((current) => ({ ...current, customerNotificationsEnabled }))}
            />

            <fieldset disabled={controlsDisabled} className="space-y-3 border-t border-border/70 pt-6 disabled:opacity-60">
              <legend className="text-sm font-semibold text-foreground">Randevu olayları</legend>
              <ToggleRow id="appointment-created-enabled" label="Randevu oluşturulduğunda" description="Yeni randevu için işlem bildirimi planlanır." checked={values.appointmentCreatedEnabled} disabled={controlsDisabled} onCheckedChange={(appointmentCreatedEnabled) => setValues((current) => ({ ...current, appointmentCreatedEnabled }))} />
              <ToggleRow id="appointment-rescheduled-enabled" label="Randevu değiştirildiğinde" description="Tarih veya saat değişikliği için işlem bildirimi planlanır." checked={values.appointmentRescheduledEnabled} disabled={controlsDisabled} onCheckedChange={(appointmentRescheduledEnabled) => setValues((current) => ({ ...current, appointmentRescheduledEnabled }))} />
              <ToggleRow id="appointment-cancelled-enabled" label="Randevu iptal edildiğinde" description="İptal edilen randevu için işlem bildirimi planlanır." checked={values.appointmentCancelledEnabled} disabled={controlsDisabled} onCheckedChange={(appointmentCancelledEnabled) => setValues((current) => ({ ...current, appointmentCancelledEnabled }))} />
            </fieldset>

            <fieldset disabled={controlsDisabled} className="space-y-3 border-t border-border/70 pt-6 disabled:opacity-60">
              <div>
                <legend className="text-sm font-semibold text-foreground">Randevu Hatırlatmaları</legend>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">Hatırlatmalar randevu başlangıcından önce, seçtiğiniz zamanlara göre planlanır.</p>
              </div>
              <div className="space-y-2">
                {values.reminderRules.map((rule, index) => (
                  <ReminderRow key={`${index}-${rule.amount}-${rule.unit}`} index={index} value={rule} disabled={controlsDisabled} onChange={(next) => setValues((current) => ({ ...current, reminderRules: current.reminderRules.map((item, itemIndex) => itemIndex === index ? next : item) }))} onRemove={() => setValues((current) => ({ ...current, reminderRules: current.reminderRules.filter((_, itemIndex) => itemIndex !== index) }))} />
                ))}
              </div>
              <Button type="button" variant="outline" className="h-11" disabled={controlsDisabled || values.reminderRules.length >= MAXIMUM_REMINDER_RULES} onClick={() => setValues((current) => ({ ...current, reminderRules: [...current.reminderRules, { amount: "24", unit: "HOUR" }] }))}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Hatırlatma Ekle
              </Button>
              <p className="text-xs text-muted-foreground">En fazla üç hatırlatma ekleyebilirsiniz. En erken hatırlatma randevudan 5 dakika öncedir.</p>
            </fieldset>

            <div className="flex justify-end border-t border-border/70 pt-6">
              <Button type="submit" className="h-11 min-w-44" disabled={isPending} aria-busy={isPending}>
                {isPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Kaydediliyor...</> : <><Save className="h-4 w-4" aria-hidden="true" />Ayarları Kaydet</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-4 xl:sticky xl:top-20">
        <Card className="border-primary/15 bg-primary/[0.025] shadow-xs">
          <CardHeader className="px-4 pb-3 pt-5 sm:px-5"><CardTitle className="flex items-center gap-2 text-base"><BellRing className="h-4 w-4 text-primary" aria-hidden="true" />Geçerli Bildirim Durumu</CardTitle></CardHeader>
          <CardContent className="px-4 pb-5 text-sm leading-6 text-muted-foreground sm:px-5">
            {settings.values.customerNotificationsEnabled ? "Müşteri bildirimleri açık. Kaydettiğiniz kurallar gelecekteki planlara uygulanır." : "Müşteri bildirimleri kapalı. Alt ayarlar korunur ancak yeni aktif plan oluşturulmaz."}
          </CardContent>
        </Card>
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground"><div className="flex items-start gap-2.5"><Info className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><p>Bu ayarlar mevcut randevuların gelecekteki, henüz gönderilmemiş hatırlatmalarına da uygulanır.</p></div></div>
      </div>
    </div>
  );
}
