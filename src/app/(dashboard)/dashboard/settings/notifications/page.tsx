import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BellRing } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { minutesToReminderDuration } from "@/lib/notification-settings";
import { NotificationPlannerService } from "@/services/notification-planner.service";
import { NotificationSettingsForm } from "./notification-settings-form";

export default async function NotificationSettingsPage() {
  const membership = (await getMemberships())[0];
  if (!membership) redirect("/login");
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    redirect("/dashboard");
  }
  const record = await NotificationPlannerService.getSettingsForBusiness(
    membership.business_id
  );

  return (
    <div className="w-full space-y-6 pb-10">
      <div className="border-b border-border/60 pb-5">
        <Link
          href="/dashboard"
          className="mb-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Panele Dön
        </Link>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Bildirimler
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Müşterilere gönderilecek randevu bildirimlerini ve hatırlatma zamanlarını belirleyin.
            </p>
          </div>
        </div>
      </div>
      <NotificationSettingsForm
        key={record.version}
        initialSettings={{
          version: record.version,
          values: {
            customerNotificationsEnabled: record.customerNotificationsEnabled,
            appointmentCreatedEnabled: record.appointmentCreatedEnabled,
            appointmentRescheduledEnabled: record.appointmentRescheduledEnabled,
            appointmentCancelledEnabled: record.appointmentCancelledEnabled,
            reminderRules: record.reminderMinutes.map(minutesToReminderDuration),
          },
        }}
      />
    </div>
  );
}
