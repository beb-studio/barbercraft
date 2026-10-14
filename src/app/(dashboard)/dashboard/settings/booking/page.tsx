import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCog } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import {
  bookingPolicyToFormValues,
  getBusinessBookingPolicySummary,
} from "@/lib/business-booking-policy-presentation";
import { BusinessBookingPolicyService } from "@/services/business-booking-policy.service";
import { BookingPolicySettingsForm } from "./booking-policy-settings-form";

export default async function BookingPolicySettingsPage() {
  const memberships = await getMemberships();
  const membership = memberships[0];

  if (!membership) redirect("/login");
  if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const record = await BusinessBookingPolicyService.getForBusiness(
    membership.business_id
  );
  const settings = {
    version: record.version,
    timezone: record.businessTimezone,
    values: bookingPolicyToFormValues(record),
    summary: getBusinessBookingPolicySummary(record),
  };

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
            <CalendarCog className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Randevu Kuralları
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Müşterilerin ne zaman randevu alabileceğini, iptal edebileceğini
              ve değiştirebileceğini belirleyin.
            </p>
          </div>
        </div>
      </div>

      <BookingPolicySettingsForm key={record.version} initialSettings={settings} />
    </div>
  );
}
