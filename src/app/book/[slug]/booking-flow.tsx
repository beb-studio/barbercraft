"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PublicBusiness,
  PublicService,
  PublicStaff,
  PublicStaffSelection,
} from "@/services/public-booking.service";
import { getEligibleStaffAction } from "@/actions/public-booking.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Phone,
  Clock,
  Check,
  User,
  Users,
  ArrowRight,
  AlertCircle,
  Loader2,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/presentation";

interface BookingFlowProps {
  business: PublicBusiness;
  services: PublicService[];
}

export function BookingFlow({ business, services }: BookingFlowProps) {
  const router = useRouter();
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [staffSelection, setStaffSelection] = useState<PublicStaffSelection | null>(null);
  const [staffList, setStaffList] = useState<PublicStaff[]>([]);
  const [hasFetchedStaff, setHasFetchedStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedService = services.find((s) => s.id === selectedServiceId) || null;
  const selectedStaff =
    staffSelection?.kind === "SPECIFIC"
      ? staffList.find((st) => st.id === staffSelection.staffId) || null
      : null;

  const handleSelectService = (serviceId: string) => {
    if (selectedServiceId === serviceId) {
      return;
    }

    setSelectedServiceId(serviceId);
    setStaffSelection(null);
    setStaffError(null);
    setHasFetchedStaff(false);

    startTransition(async () => {
      const res = await getEligibleStaffAction(business.slug, serviceId);
      if (res.success && res.staff) {
        setStaffList(res.staff);
        setHasFetchedStaff(true);
      } else {
        setStaffError(res.error || "Personel listesi alınamadı.");
        setStaffList([]);
        setHasFetchedStaff(true);
      }
    });
  };

  const handleSelectStaff = (selection: PublicStaffSelection) => {
    setStaffSelection(selection);
  };

  const handleContinue = () => {
    if (!selectedServiceId || !staffSelection) return;
    const staffParam =
      staffSelection.kind === "ANY" ? "any" : staffSelection.staffId;
    router.push(
      `/book/${business.slug}/schedule?service=${encodeURIComponent(
        selectedServiceId
      )}&staff=${encodeURIComponent(staffParam)}`
    );
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-background">
      {/* LEFT PANEL: Business Summary (Desktop Fixed, Mobile Header) */}
      <div className="w-full lg:w-[400px] xl:w-[480px] lg:border-r border-border bg-card/40 lg:fixed lg:h-full lg:overflow-y-auto">
        <div className="p-6 lg:p-10 lg:pt-16 flex flex-col gap-8">
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

          {/* Progress / Step Indicator */}
          <div className="hidden lg:block mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Randevu Adımları</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-primary font-medium">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</div>
                <span>Hizmet & Personel</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-xs">2</div>
                <span>Tarih & Saat</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-xs">3</div>
                <span>Onay</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Active Step */}
      <div className="flex-1 lg:ml-[400px] xl:ml-[480px] p-4 sm:p-6 lg:p-12 pb-32">
        <div className="max-w-3xl mx-auto space-y-10">
          
          {/* STEP 1: Service */}
          <section aria-labelledby="step-service-heading" className="space-y-4">
            <div className="flex items-center gap-2 mb-2 lg:hidden">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
              <span className="text-sm font-semibold text-muted-foreground">Adım 1 / 3</span>
            </div>
            
            <h2 id="step-service-heading" className="text-2xl font-bold tracking-tight text-foreground">
              Hizmet Seçimi
            </h2>

            {services.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground bg-muted/20">
                Şu anda rezervasyona açık hizmet bulunmuyor.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Hizmet Listesi">
                {services.map((svc) => {
                  const isSelected = selectedServiceId === svc.id;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectService(svc.id)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer min-h-[120px]",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex justify-between items-start w-full gap-2">
                        <span className="font-semibold text-foreground">{svc.name}</span>
                        <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")}>
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                      </div>
                      
                      {svc.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {svc.description}
                        </p>
                      )}
                      
                      <div className="mt-4 flex items-center gap-3 text-sm font-medium">
                        <span className="text-foreground">{formatCurrency(svc.price, business.currency)}</span>
                        <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {svc.durationMinutes} dk</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* STEP 2: Staff */}
          <section aria-labelledby="step-staff-heading" className="space-y-4 transition-opacity duration-300" style={{ opacity: selectedServiceId ? 1 : 0.4, pointerEvents: selectedServiceId ? "auto" : "none" }}>
            <h2 id="step-staff-heading" className="text-2xl font-bold tracking-tight text-foreground">
              Personel Seçimi
            </h2>

            {!selectedServiceId ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                Lütfen önce bir hizmet seçin.
              </div>
            ) : isPending ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/40 p-12 text-center text-muted-foreground gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span>Uygun personeller aranıyor...</span>
              </div>
            ) : staffError ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{staffError}</span>
              </div>
            ) : hasFetchedStaff && staffList.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-6 text-muted-foreground justify-center">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>Bu hizmet için uygun personel bulunmuyor.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Personel Listesi">
                {/* Any Staff Option */}
                {(() => {
                  const isAnySelected = staffSelection?.kind === "ANY";
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isAnySelected}
                      onClick={() => handleSelectStaff({ kind: "ANY" })}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer min-h-[80px]",
                        isAnySelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                          <Users className="h-6 w-6" />
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-foreground text-base block">
                            Fark Etmez
                          </span>
                          <span className="text-sm text-muted-foreground block truncate">
                            Uygun olan ilk personel
                          </span>
                        </div>
                      </div>
                      <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors", isAnySelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")}>
                        {isAnySelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })()}

                {/* Specific Staff */}
                {staffList.map((st) => {
                  const isSelected = staffSelection?.kind === "SPECIFIC" && staffSelection.staffId === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleSelectStaff({ kind: "SPECIFIC", staffId: st.id })}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-4 cursor-pointer min-h-[80px]",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground border border-border">
                          {st.profileImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={st.profileImageUrl} alt={st.displayName} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <User className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-foreground text-base">
                            {st.displayName}
                          </span>
                        </div>
                      </div>
                      <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors", isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")}>
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>

      {/* Floating CTA Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/90 backdrop-blur-md px-4 py-4 lg:left-[400px] xl:left-[480px]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {selectedService ? (
              <div className="truncate">
                <div className="font-medium text-sm text-foreground truncate">
                  {selectedService.name}
                  {staffSelection?.kind === "ANY"
                    ? " • Fark Etmez"
                    : selectedStaff
                    ? ` • ${selectedStaff.displayName}`
                    : ""}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatCurrency(selectedService.price, business.currency)} • {selectedService.durationMinutes} dk
                </div>
              </div>
            ) : (
              <div className="text-sm font-medium text-muted-foreground">
                Lütfen seçim yapınız
              </div>
            )}
          </div>

          <Button
            type="button"
            size="lg"
            disabled={!selectedServiceId || !staffSelection || isPending}
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
