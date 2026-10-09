import Link from "next/link";
import {
  PublicBookingService,
  parsePublicStaffSelection,
} from "@/services/public-booking.service";
import { PublicBookingRepository } from "@/repositories/public-booking.repository";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Scissors, MapPin, Phone, Check } from "lucide-react";
import { BookingForm } from "./booking-form";

export interface ConfirmPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    service?: string;
    staff?: string;
    start?: string;
  }>;
}

export default async function ConfirmPage({
  params,
  searchParams,
}: ConfirmPageProps) {
  const { slug } = await params;
  const { service: serviceId, staff: staffId, start: startAt } = await searchParams;

  const staffSelection = parsePublicStaffSelection(staffId);

  const scheduleBackUrl = serviceId && staffSelection
    ? `/book/${slug}/schedule?service=${encodeURIComponent(serviceId)}&staff=${encodeURIComponent(staffSelection.kind === "ANY" ? "any" : staffSelection.staffId)}`
    : `/book/${slug}`;

  if (!serviceId || !staffSelection || !startAt) {
    return (
      <div className="flex flex-col min-h-screen max-w-xl mx-auto p-4 sm:p-6 justify-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">
            Eksik veya Geçersiz Parametre
          </h1>
          <p className="text-sm text-muted-foreground">
            Lütfen önce hizmet, personel, tarih ve saat seçimi yapınız.
          </p>
          <Link
            href={scheduleBackUrl}
            className={buttonVariants({ variant: "outline", className: "mt-2 inline-flex items-center" })}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Randevu Seçimine Dön
          </Link>
        </div>
      </div>
    );
  }

  // Revalidate the selected slot against the authoritative Availability Engine
  const validation =
    staffSelection.kind === "ANY"
      ? await PublicBookingService.validatePublicAnyStaffSlotSelection({
          slug,
          serviceId,
          startAt,
        })
      : await PublicBookingService.validatePublicSlotSelection({
          slug,
          serviceId,
          staffId: staffSelection.staffId,
          startAt,
        });

  if (
    !validation.valid ||
    !validation.business ||
    !validation.service ||
    !validation.staff ||
    !validation.slot
  ) {
    return (
      <div className="flex flex-col min-h-screen max-w-xl mx-auto p-4 sm:p-6 justify-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">
            Saat Artık Uygun Değil
          </h1>
          <p className="text-sm text-muted-foreground">
            {validation.error || "Seçilen randevu saati artık uygun değil veya süresi doldu."}
          </p>
          <Link
            href={scheduleBackUrl}
            className={buttonVariants({ variant: "outline", className: "mt-2 inline-flex items-center" })}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Farklı Bir Saat Seç
          </Link>
        </div>
      </div>
    );
  }

  const { business, service, staff, slot } = validation;

  // Resolve business timezone for authoritative display formatting
  const bizRow = await PublicBookingRepository.findPublicBusinessBySlug(slug);
  const timezone = bizRow?.timezone || "Europe/Istanbul";

  const startInstant = new Date(slot.startAt);
  const formattedStart = formatInstantInBusinessTimezone(startInstant, timezone);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-background">
      {/* LEFT PANEL: Business Summary (Desktop Fixed, Mobile Header) */}
      <div className="w-full lg:w-[400px] xl:w-[480px] lg:border-r border-border bg-card/40 lg:fixed lg:h-full lg:overflow-y-auto">
        <div className="p-6 lg:p-10 lg:pt-16 flex flex-col gap-8">
          {/* Mobile Back Button */}
          <Link
            href={scheduleBackUrl}
            className="lg:hidden inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Geri Dön</span>
          </Link>

          {/* Business Info */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Scissors className="h-6 w-6" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {business.name}
              </h1>
            </div>
            
            <div className="space-y-3 text-sm text-muted-foreground mt-6">
              {bizRow?.address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-foreground/70" />
                  <span>{bizRow.address}</span>
                </div>
              )}
              {bizRow?.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-foreground/70" />
                  <span>{bizRow.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress / Step Indicator */}
          <div className="hidden lg:block mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Randevu Adımları</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs"><Check className="h-3 w-3" /></div>
                <span>Hizmet & Personel</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs"><Check className="h-3 w-3" /></div>
                <span>Tarih & Saat</span>
              </div>
              <div className="flex items-center gap-3 text-primary font-medium">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">3</div>
                <span>Bilgiler & Onay</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Form */}
      <div className="flex-1 lg:ml-[400px] xl:ml-[480px] p-4 sm:p-6 lg:p-12 pb-32">
        <BookingForm
          slug={slug}
          serviceId={serviceId}
          staffId={staffSelection.kind === "ANY" ? "any" : staffSelection.staffId}
          startAt={startAt}
          business={business}
          service={service}
          staff={staff}
          slot={slot}
          formattedStart={formattedStart}
          scheduleBackUrl={scheduleBackUrl}
          isAnyStaff={staffSelection.kind === "ANY"}
        />
      </div>
    </div>
  );
}
