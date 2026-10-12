import Link from "next/link";
import {
  PublicBookingService,
  parsePublicStaffSelection,
} from "@/services/public-booking.service";
import { PublicBookingRepository } from "@/repositories/public-booking.repository";
import { getBusinessLocalToday } from "@/lib/timezone";
import { getMaximumPublicBookingLocalDate } from "@/lib/business-booking-policy";
import { formatPolicyMinutes } from "@/lib/business-booking-policy-presentation";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { ScheduleFlow } from "./schedule-flow";

export interface SchedulePageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    service?: string;
    staff?: string;
  }>;
}

export default async function SchedulePage({
  params,
  searchParams,
}: SchedulePageProps) {
  const { slug } = await params;
  const { service: serviceId, staff: staffId } = await searchParams;

  const staffSelection = parsePublicStaffSelection(staffId);

  if (!serviceId || !staffSelection) {
    return (
      <div className="flex flex-col min-h-screen max-w-xl mx-auto p-4 sm:p-6 justify-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">
            Eksik veya Geçersiz Parametre
          </h1>
          <p className="text-sm text-muted-foreground">
            Lütfen önce bir hizmet ve personel seçiniz.
          </p>
          <Link
            href={`/book/${slug}`}
            className={buttonVariants({ variant: "outline", className: "mt-2 inline-flex items-center" })}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Seçim Ekranına Dön
          </Link>
        </div>
      </div>
    );
  }

  const validation =
    staffSelection.kind === "ANY"
      ? await PublicBookingService.validatePublicAnyStaffSelection(slug, serviceId)
      : await PublicBookingService.validatePublicSelection(
          slug,
          serviceId,
          staffSelection.staffId
        );

  if (!validation.valid || !validation.business || !validation.service || !validation.staff) {
    return (
      <div className="flex flex-col min-h-screen max-w-xl mx-auto p-4 sm:p-6 justify-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">
            Geçersiz veya Süresi Dolmuş Seçim
          </h1>
          <p className="text-sm text-muted-foreground">
            {validation.error || "Seçilen hizmet veya personel artık uygun değil."}
          </p>
          <Link
            href={`/book/${slug}`}
            className={buttonVariants({ variant: "outline", className: "mt-2 inline-flex items-center" })}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Hizmet ve Personel Seçimine Dön
          </Link>
        </div>
      </div>
    );
  }

  const { business, service, staff } = validation;

  // Resolve business timezone authoritatively from database
  const bizRow = await PublicBookingRepository.findPublicBusinessBySlug(slug);
  const timezone = bizRow?.timezone || "Europe/Istanbul";

  // Derive business-local today
  const referenceNow = new Date();
  const businessLocalToday = getBusinessLocalToday(timezone, referenceNow);
  const maximumLocalDate = getMaximumPublicBookingLocalDate({
    referenceNow,
    businessTimezone: timezone,
    maximumAdvanceBookingDays: bizRow?.maximumAdvanceBookingDays ?? null,
  });
  const minimumLeadGuidance = bizRow?.minimumBookingLeadMinutes
    ? `Randevular en erken ${formatPolicyMinutes(bizRow.minimumBookingLeadMinutes)} sonrası için alınabilir.`
    : null;

  // Fetch initial available slots for business-local today
  const initialAvailability =
    staffSelection.kind === "ANY"
      ? await PublicBookingService.getPublicAnyStaffAvailability({
          slug,
          serviceId: service.id,
          localDate: businessLocalToday,
        })
      : await PublicBookingService.getPublicAvailability({
          slug,
          serviceId: service.id,
          staffId: staff.id,
          localDate: businessLocalToday,
        });

  const initialSlots = initialAvailability.success ? initialAvailability.slots : [];

  return (
    <ScheduleFlow
      business={business}
      service={service}
      staff={staff}
      staffSelection={staffSelection}
      initialDate={businessLocalToday}
      initialSlots={initialSlots}
      maximumLocalDate={maximumLocalDate}
      minimumLeadGuidance={minimumLeadGuidance}
    />
  );
}
