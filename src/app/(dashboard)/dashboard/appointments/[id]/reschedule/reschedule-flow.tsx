"use client";

import { useState, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock, Check, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AvailabilitySlot } from "@/services/availability.service";
import {
  rescheduleAppointmentAction,
  getRescheduleAvailabilityAction,
} from "@/actions/appointment-reschedule.actions";
import Link from "next/link";
import { cn } from "@/lib/utils";

function generateUpcomingDates(startDateStr: string, days: number = 14) {
  const dates = [];
  const start = new Date(startDateStr);
  const formatter = new Intl.DateTimeFormat("tr-TR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const parts = formatter.formatToParts(d);

    let dayName = "";
    let dayNum = "";
    let monthName = "";

    for (const part of parts) {
      if (part.type === "weekday") dayName = part.value;
      if (part.type === "day") dayNum = part.value;
      if (part.type === "month") monthName = part.value;
    }

    dates.push({ dateStr, dayName, dayNum, monthName, rawDate: d });
  }
  return dates;
}

export function RescheduleFlow({
  appointmentId,
  expectedUpdatedAt,
  staffName,
  serviceName,
  initialDate,
  initialSlots,
}: {
  appointmentId: string;
  expectedUpdatedAt: string;
  staffName: string;
  serviceName: string;
  initialDate: string;
  initialSlots: AvailabilitySlot[];
}) {
  const router = useRouter();
  const [isRescheduling, startRescheduling] = useTransition();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [slots, setSlots] = useState<AvailabilitySlot[]>(initialSlots);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleSelectDate = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setAvailabilityError(null);
    setSubmitError(null);
    setIsLoadingSlots(true);

    const res = await getRescheduleAvailabilityAction(appointmentId, dateStr);

    if (!res.success || !res.data) {
      setAvailabilityError(res.error || "Müsaitlik durumu alınamadı.");
      setSlots([]);
    } else {
      if (res.data.reason) {
        if (res.data.reason === "CLOSED") setAvailabilityError("İşletme bu tarihte kapalı.");
        else if (res.data.reason === "STAFF_NOT_BOOKABLE") setAvailabilityError("Personel bu tarihte uygun değil.");
        else if (res.data.reason === "NO_AVAILABLE_SLOTS") setAvailabilityError("Bu tarihte boş randevu saati bulunmuyor.");
      }
      setSlots(res.data.slots || []);
    }

    setIsLoadingSlots(false);
  };

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    setSelectedSlot(slot);
    setSubmitError(null);
  };

  const handleReschedule = () => {
    if (!selectedSlot) return;

    startRescheduling(async () => {
      setSubmitError(null);
      const res = await rescheduleAppointmentAction(
        appointmentId,
        selectedSlot.startAt,
        expectedUpdatedAt
      );

      if (!res.success) {
        setSubmitError(res.error || "Randevu yeniden planlanamadı.");
        return;
      }

      router.push(`/dashboard/appointments?date=${selectedDate}`);
    });
  };

  if (!hydrated) return null;

  const upcomingDates = generateUpcomingDates(initialDate, 14);

  const formattedSelectedDate = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(selectedDate));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard/appointments"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Randevulara Dön</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Randevuyu Yeniden Planla
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {staffName} • <span className="font-medium text-foreground">{serviceName}</span>
          </p>
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive font-medium flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Operational 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Date & Slot Pickers */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* 1. Tarih Seç */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">1. Yeni Tarih Seçin</CardTitle>
                    <CardDescription className="text-xs">
                      {formattedSelectedDate}
                    </CardDescription>
                  </div>
                </div>

                <div className="relative">
                  <label
                    htmlFor="custom-date-picker"
                    className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1 hover:text-foreground border px-2 py-1 rounded-md"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Takvimden Seç</span>
                  </label>
                  <input
                    id="custom-date-picker"
                    type="date"
                    min={initialDate}
                    value={selectedDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSelectDate(e.target.value);
                      }
                    }}
                    className="w-full h-full opacity-0 absolute inset-0 cursor-pointer"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              <div className="flex gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-2 px-2">
                {upcomingDates.map((item) => {
                  const isSelected = selectedDate === item.dateStr;
                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => handleSelectDate(item.dateStr)}
                      className={cn(
                        "flex flex-col items-center justify-center min-w-[62px] py-2.5 px-2 rounded-xl border min-h-[64px] shrink-0 transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary shadow-2xs font-semibold"
                          : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <span className={cn("text-[11px] font-medium", isSelected ? "text-primary" : "text-muted-foreground")}>
                        {item.dayName}
                      </span>
                      <span className="text-base font-bold my-0.5">{item.dayNum}</span>
                      <span className={cn("text-[10px]", isSelected ? "text-primary" : "text-muted-foreground")}>
                        {item.monthName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 2. Saat Seç */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">2. Yeni Saat Seçin</CardTitle>
                  <CardDescription className="text-xs">
                    Müsait randevu slotunu belirleyin
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              {isLoadingSlots ? (
                <div className="flex flex-col items-center justify-center rounded-xl border bg-card/40 p-8 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Saatler yükleniyor...</span>
                </div>
              ) : availabilityError ? (
                <div className="p-4 border border-destructive/30 bg-destructive/10 text-sm text-destructive rounded-xl">
                  {availabilityError}
                </div>
              ) : slots.length === 0 ? (
                <div className="p-6 border border-dashed rounded-xl text-center text-sm text-muted-foreground bg-muted/10">
                  Bu tarihte boş randevu saati bulunmuyor.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startAt === slot.startAt;
                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className={cn(
                          "flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl border font-semibold text-sm min-h-[44px] transition-all cursor-pointer font-mono",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-xs"
                            : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/40"
                        )}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                        <span>{slot.localStartTime}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Summary */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 space-y-4">
          <Card className="border-border shadow-xs bg-card overflow-hidden">
            <CardHeader className="p-5 pb-3 bg-muted/30 border-b border-border/60">
              <CardTitle className="text-base font-semibold text-foreground">
                Plan Değişikliği Özeti
              </CardTitle>
              <CardDescription className="text-xs">
                Mevcut randevu ve yeni zaman teyidi
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Hizmet & Personel</span>
                <div className="text-sm font-semibold text-foreground">
                  {serviceName}
                </div>
                <div className="text-xs text-muted-foreground">
                  Personel: <strong className="text-foreground">{staffName}</strong>
                </div>
              </div>

              <div className="space-y-1 pt-3 border-t border-border/60">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Yeni Tarih & Saat</span>
                <div className="text-sm font-semibold text-foreground">
                  {selectedSlot ? (
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <span>{selectedSlot.localStartTime}</span>
                      <span className="font-sans text-xs text-muted-foreground font-normal">•</span>
                      <span className="font-sans text-xs">{selectedDate}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-normal text-xs">Henüz saat seçilmedi</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border/60 space-y-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={!selectedSlot || isRescheduling}
                  onClick={handleReschedule}
                  className="w-full min-h-[44px] font-semibold text-sm shadow-xs"
                >
                  {isRescheduling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Yeniden Planlanıyor...
                    </>
                  ) : (
                    "Randevu Saatini Güncelle"
                  )}
                </Button>

                {!selectedSlot && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Lütfen yeni bir tarih ve saat seçin.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
