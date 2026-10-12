"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PublicBusiness,
  PublicService,
  PublicStaff,
  PublicAvailabilitySlot,
  PublicStaffSelection,
} from "@/services/public-booking.service";
import {
  getPublicAvailabilityAction,
  getPublicAnyStaffAvailabilityAction,
} from "@/actions/public-booking.actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Scissors,
  Clock,
  User,
  Users,
  ArrowLeft,
  ArrowRight,
  Calendar,
  AlertCircle,
  Loader2,
  Check,
  MapPin,
  Phone
} from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/presentation";

interface ScheduleFlowProps {
  business: PublicBusiness;
  service: PublicService;
  staff: PublicStaff;
  staffSelection?: PublicStaffSelection;
  initialDate: string; // YYYY-MM-DD
  initialSlots: PublicAvailabilitySlot[];
  maximumLocalDate: string | null;
  minimumLeadGuidance: string | null;
}

export function ScheduleFlow({
  business,
  service,
  staff,
  staffSelection,
  initialDate,
  initialSlots,
  maximumLocalDate,
  minimumLeadGuidance,
}: ScheduleFlowProps) {
  const router = useRouter();
  const isAnyStaff = staffSelection?.kind === "ANY" || staff.id === "any";

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [slots, setSlots] = useState<PublicAvailabilitySlot[]>(initialSlots);
  const [selectedSlot, setSelectedSlot] = useState<PublicAvailabilitySlot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [, startTransition] = useTransition();
  const requestIdRef = useRef<number>(0);

  const initialBaseDate = parseISO(initialDate);
  const upcomingDates = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(initialBaseDate, i);
    const dateStr = format(d, "yyyy-MM-dd");
    const isToday = i === 0;
    const dayName = isToday ? "Bugün" : format(d, "EEE", { locale: tr });
    const dayNum = format(d, "d");
    const monthName = format(d, "MMM", { locale: tr });
    return { dateStr, dayName, dayNum, monthName };
  }).filter(
    (item) => maximumLocalDate === null || item.dateStr <= maximumLocalDate
  );

  const handleSelectDate = (dateStr: string) => {
    if (selectedDate === dateStr) return;
    if (maximumLocalDate !== null && dateStr > maximumLocalDate) return;

    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setAvailabilityError(null);
    setIsLoadingSlots(true);

    const currentReqId = ++requestIdRef.current;

    startTransition(async () => {
      const res = isAnyStaff
        ? await getPublicAnyStaffAvailabilityAction({
            slug: business.slug,
            serviceId: service.id,
            localDate: dateStr,
          })
        : await getPublicAvailabilityAction({
            slug: business.slug,
            serviceId: service.id,
            staffId: staff.id,
            localDate: dateStr,
          });

      if (requestIdRef.current !== currentReqId) {
        return;
      }

      setIsLoadingSlots(false);
      if (res.success && res.slots) {
        setSlots(res.slots);
      } else {
        setAvailabilityError(res.error || "Müsaitlik bilgisi alınamadı.");
        setSlots([]);
      }
    });
  };

  const handleSelectSlot = (slot: PublicAvailabilitySlot) => {
    setSelectedSlot(slot);
  };

  const handleContinue = () => {
    if (!selectedSlot) return;

    const staffParam = isAnyStaff ? "any" : staff.id;

    router.push(
      `/book/${business.slug}/confirm?service=${encodeURIComponent(
        service.id
      )}&staff=${encodeURIComponent(staffParam)}&start=${encodeURIComponent(
        selectedSlot.startAt
      )}`
    );
  };

  const selectedDateObj = parseISO(selectedDate);
  const formattedSelectedDate = isNaN(selectedDateObj.getTime())
    ? selectedDate
    : format(selectedDateObj, "d MMMM yyyy, EEEE", { locale: tr });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-background">
      {/* LEFT PANEL: Business Summary (Desktop Fixed, Mobile Header) */}
      <div className="w-full lg:w-[400px] xl:w-[480px] lg:border-r border-border bg-card/40 lg:fixed lg:h-full lg:overflow-y-auto">
        <div className="p-6 lg:p-10 lg:pt-16 flex flex-col gap-8">
          <Link
            href={`/book/${business.slug}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit text-sm font-medium gap-1.5 -ml-3 text-muted-foreground hover:text-foreground")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Geri Dön</span>
          </Link>

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
              {business.address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-foreground/70" />
                  <span>{business.address}</span>
                </div>
              )}
              {business.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-foreground/70" />
                  <span>{business.phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="hidden lg:block mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Randevu Adımları</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs"><Check className="w-3 h-3" /></div>
                <span>Hizmet & Personel</span>
              </div>
              <div className="flex items-center gap-3 text-primary font-medium">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">2</div>
                <span>Tarih & Saat</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-xs">3</div>
                <span>Onay</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-4 space-y-4 mt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seçimleriniz</h4>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0"><Scissors className="w-4 h-4"/></div>
              <div>
                <div className="font-medium">{service.name}</div>
                <div className="text-muted-foreground text-xs">{service.durationMinutes} dk • {formatCurrency(service.price, business.currency)}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-secondary text-secondary-foreground border flex items-center justify-center shrink-0">
                {isAnyStaff ? <Users className="w-4 h-4 text-muted-foreground" /> : (staff.profileImageUrl ? <img src={staff.profileImageUrl} alt="" className="w-full h-full rounded-lg object-cover" /> : <User className="w-4 h-4 text-muted-foreground" />)}
              </div>
              <div>
                <div className="font-medium">{isAnyStaff ? "Fark Etmez" : staff.displayName}</div>
                <div className="text-muted-foreground text-xs">{isAnyStaff ? "Uygun olan ilk personel" : "Seçili Personel"}</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* RIGHT PANEL: Active Step */}
      <div className="flex-1 lg:ml-[400px] xl:ml-[480px] p-4 sm:p-6 lg:p-12 pb-32">
        <div className="max-w-3xl mx-auto space-y-10">
          
          <section aria-labelledby="step-date-heading" className="space-y-4">
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
              <span className="text-sm font-semibold text-muted-foreground">Adım 2 / 3</span>
            </div>
              <div className="flex items-center justify-between">
              <h2 id="step-date-heading" className="text-2xl font-bold tracking-tight text-foreground">Tarih Seçimi</h2>
              <div className="flex items-center gap-1 relative">
                <label htmlFor="custom-date-picker" className="text-sm text-primary font-medium cursor-pointer flex items-center gap-1.5 hover:underline bg-primary/5 px-3 py-1.5 rounded-md">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Takvimden Seç</span>
                </label>
                <input
                  id="custom-date-picker"
                  type="date"
                  min={initialDate}
                  max={maximumLocalDate ?? undefined}
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) handleSelectDate(e.target.value);
                  }}
                  className="w-full h-full opacity-0 absolute cursor-pointer inset-0"
                />
              </div>
            </div>

            {(minimumLeadGuidance || maximumLocalDate) && (
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
                {minimumLeadGuidance && <p>{minimumLeadGuidance}</p>}
                {maximumLocalDate && (
                  <p>
                    Randevu tarihleri en geç {format(parseISO(maximumLocalDate), "d MMMM yyyy", { locale: tr })} gününe kadar seçilebilir.
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
              {upcomingDates.map((item) => {
                const isSelected = selectedDate === item.dateStr;
                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => handleSelectDate(item.dateStr)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[72px] py-3 px-2 rounded-xl border transition-all cursor-pointer min-h-[80px] shrink-0 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isSelected ? "border-primary bg-primary text-primary-foreground shadow-md scale-105" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <span className={cn("text-[11px] font-medium uppercase tracking-wider", isSelected ? "text-primary-foreground/90 font-semibold" : "text-muted-foreground")}>{item.dayName}</span>
                    <span className="text-2xl font-bold my-0.5">{item.dayNum}</span>
                    <span className={cn("text-[11px] font-medium", isSelected ? "text-primary-foreground/90" : "text-muted-foreground")}>{item.monthName}</span>
                  </button>
                );
              })}
            </div>
            
            <div className="text-sm font-medium text-foreground bg-secondary/50 px-4 py-2.5 rounded-lg flex items-center gap-2 border border-border/50">
              <Calendar className="h-4 w-4 text-primary" />
              <span>Seçilen Gün: <strong>{formattedSelectedDate}</strong></span>
            </div>
          </section>

          <section aria-labelledby="step-time-heading" className="space-y-4 transition-opacity duration-300">
            <h2 id="step-time-heading" className="text-2xl font-bold tracking-tight text-foreground">Saat Seçimi</h2>

            {isLoadingSlots ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/40 p-12 text-center text-muted-foreground gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Uygun saatler kontrol ediliyor...</span>
              </div>
            ) : availabilityError ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{availabilityError}</span>
              </div>
            ) : slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center space-y-3">
                <Clock className="h-10 w-10 text-muted-foreground/40" />
                <div className="text-base font-semibold text-foreground">Bu tarihte uygun saat bulunmuyor.</div>
                <p className="text-sm text-muted-foreground max-w-sm">Lütfen takvimden farklı bir gün seçin veya personel/hizmet tercihini değiştirin.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.startAt === slot.startAt;
                  return (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => handleSelectSlot(slot)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex items-center justify-center py-3.5 px-2 rounded-xl border font-bold text-sm sm:text-base transition-all cursor-pointer min-h-[56px] select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isSelected ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30 shadow-md scale-[1.02]" : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted/40"
                      )}
                    >
                      <span>{slot.localStartTime}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-md px-4 py-4 lg:left-[400px] xl:left-[480px]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {selectedSlot ? (
              <div className="truncate">
                <div className="font-semibold text-sm text-foreground truncate">
                  {selectedSlot.localStartTime} • {formattedSelectedDate}
                </div>
                <div className="text-sm text-muted-foreground">
                  Seçilen Randevu Zamanı
                </div>
              </div>
            ) : (
              <div className="text-sm font-medium text-muted-foreground">
                Lütfen uygun bir randevu saati seçiniz
              </div>
            )}
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!selectedSlot || isLoadingSlots}
            onClick={handleContinue}
            className="shrink-0 font-bold px-8 shadow-md"
          >
            <span>İleri</span>
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
