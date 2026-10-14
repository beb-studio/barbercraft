"use client";

import { useState, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  Check,
  Loader2,
  ArrowLeft,
  User,
  Scissors,
  AlertCircle,
  Phone,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AvailabilitySlot } from "@/services/availability.service";
import {
  getInternalAvailabilityAction,
  createInternalAppointmentAction,
} from "@/actions/manual-booking.actions";
import { searchCustomersForBookingAction } from "@/actions/customer.actions";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/presentation";

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

export function ManualBookingFlow({
  role,
  targetStaffId,
  services,
  staff,
  assignments,
  initialDate,
}: {
  role: string;
  targetStaffId: string | null;
  services: { id: string; name: string; durationMinutes: number; price?: string }[];
  staff: { id: string; firstName: string; lastName: string }[];
  assignments: { staffId: string; serviceId: string }[];
  initialDate: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(targetStaffId);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  // Existing customer selection state
  const [customerMode, setCustomerMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string;
    appointmentCount?: number;
    lastAppointmentDate?: Date | null;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string;
    appointmentCount?: number;
    lastAppointmentDate?: Date | null;
  }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleSearchCustomers = async (q: string) => {
    setIsSearching(true);
    setHasSearched(true);
    const res = await searchCustomersForBookingAction(q);
    if (res.success && res.data) {
      setSearchResults(res.data);
    } else {
      setSearchResults([]);
    }
    setIsSearching(false);
  };

  const loadSlots = async (svcId: string, stfId: string, dt: string) => {
    setIsLoadingSlots(true);
    setAvailabilityError(null);
    setSlots([]);
    setSelectedSlot(null);

    const res = await getInternalAvailabilityAction(stfId, svcId, dt);
    if (!res.success || !res.data) {
      setAvailabilityError(res.error || "Müsaitlik durumu alınamadı.");
    } else {
      if (res.data.reason) {
        if (res.data.reason === "CLOSED") setAvailabilityError("İşletme bu tarihte kapalı.");
        else if (res.data.reason === "STAFF_NOT_BOOKABLE") setAvailabilityError("Personel bu tarihte müsait değil.");
        else if (res.data.reason === "NO_AVAILABLE_SLOTS") setAvailabilityError("Bu tarihte uygun randevu saati bulunmuyor.");
      }
      setSlots(res.data.slots || []);
    }
    setIsLoadingSlots(false);
  };

  const handleSelectService = (id: string) => {
    setSelectedServiceId(id);
    if (selectedStaffId) {
      const isValid = assignments.some((a) => a.staffId === selectedStaffId && a.serviceId === id);
      if (!isValid) {
        if (role !== "STAFF") {
          setSelectedStaffId(null);
        }
      } else {
        loadSlots(id, selectedStaffId, selectedDate);
      }
    }
  };

  const handleSelectStaff = (id: string) => {
    setSelectedStaffId(id);
    if (selectedServiceId) {
      loadSlots(selectedServiceId, id, selectedDate);
    }
  };

  const handleSelectDate = (dt: string) => {
    setSelectedDate(dt);
    if (selectedServiceId && selectedStaffId) {
      loadSlots(selectedServiceId, selectedStaffId, dt);
    }
  };

  const handleSubmit = () => {
    if (!selectedServiceId || !selectedStaffId || !selectedSlot) {
      return;
    }

    if (customerMode === "EXISTING" && !selectedCustomer) {
      return;
    }

    if (customerMode === "NEW" && (!customerFirstName.trim() || !customerPhone.trim())) {
      return;
    }

    startTransition(async () => {
      setSubmitError(null);
      const res = await createInternalAppointmentAction(
        customerMode === "EXISTING"
          ? {
              staffId: selectedStaffId,
              serviceId: selectedServiceId,
              startAt: selectedSlot.startAt,
              mode: "EXISTING",
              existingCustomerId: selectedCustomer!.id,
              notes: customerNotes.trim() || undefined,
            }
          : {
              staffId: selectedStaffId,
              serviceId: selectedServiceId,
              startAt: selectedSlot.startAt,
              mode: "NEW",
              customer: {
                firstName: customerFirstName.trim(),
                lastName: customerLastName.trim() || undefined,
                phone: customerPhone.trim(),
                notes: customerNotes.trim() || undefined,
              },
              notes: customerNotes.trim() || undefined,
            }
      );

      if (!res.success) {
        setSubmitError(res.error || "Randevu oluşturulamadı.");
      } else {
        router.push(`/dashboard/appointments?date=${selectedDate}`);
        router.refresh();
      }
    });
  };

  if (!hydrated) return null;

  const upcomingDates = generateUpcomingDates(initialDate, 14);

  // Filter available services / staff based on assignments
  const eligibleStaff = selectedServiceId
    ? staff.filter((s) => assignments.some((a) => a.staffId === s.id && a.serviceId === selectedServiceId))
    : staff;

  const eligibleServices = selectedStaffId
    ? services.filter((s) => assignments.some((a) => a.staffId === selectedStaffId && a.serviceId === s.id))
    : services;

  const selectedService = services.find((s) => s.id === selectedServiceId);
  const selectedStaffMember = staff.find((s) => s.id === selectedStaffId);

  const canSubmit =
    Boolean(selectedServiceId) &&
    Boolean(selectedStaffId) &&
    Boolean(selectedSlot) &&
    (customerMode === "EXISTING"
      ? Boolean(selectedCustomer)
      : customerFirstName.trim() !== "" && customerPhone.trim() !== "");

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
            Yeni Randevu Oluştur
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            İşletme içi veya telefonla gelen müşteri randevusunu sisteme kaydedin.
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
        {/* Left Column: Form Steps */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* 1. Hizmet Seçimi */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Scissors className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">1. Hizmet Seçin</CardTitle>
                  <CardDescription className="text-xs">
                    Uygulanacak hizmeti belirleyin
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {eligibleServices.map((svc) => {
                  const isSelected = selectedServiceId === svc.id;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => handleSelectService(svc.id)}
                      className={cn(
                        "p-3.5 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all cursor-pointer min-h-[72px]",
                        isSelected
                          ? "border-primary bg-primary/10 ring-1 ring-primary shadow-2xs"
                          : "border-border hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn("font-semibold text-sm", isSelected ? "text-primary" : "text-foreground")}>
                          {svc.name}
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{svc.durationMinutes} dakika</span>
                        {svc.price && <span className="font-medium text-foreground">{formatCurrency(svc.price)}</span>}
                      </div>
                    </button>
                  );
                })}
                {eligibleServices.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3 border rounded-lg bg-muted/20 col-span-full">
                    Uygun hizmet bulunamadı.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 2. Personel Seçimi (For OWNER & MANAGER) */}
          {role !== "STAFF" && (
            <Card className="border-border shadow-xs">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">2. Personel Seçin</CardTitle>
                    <CardDescription className="text-xs">
                      İşlemi gerçekleştirecek ekip üyesini belirleyin
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {eligibleStaff.map((stf) => {
                    const isSelected = selectedStaffId === stf.id;
                    return (
                      <button
                        key={stf.id}
                        type="button"
                        onClick={() => handleSelectStaff(stf.id)}
                        className={cn(
                          "p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer min-h-[52px]",
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-2xs"
                            : "border-border hover:border-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <span className={cn("font-semibold text-sm", isSelected ? "text-primary" : "text-foreground")}>
                          {stf.firstName} {stf.lastName}
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  {eligibleStaff.length === 0 && (
                    <p className="text-xs text-muted-foreground p-3 border rounded-lg bg-muted/20 col-span-full">
                      Seçilen hizmeti sunabilen personel bulunamadı.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Tarih ve Saat Seçimi */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">3. Tarih ve Saat</CardTitle>
                  <CardDescription className="text-xs">
                    {formattedSelectedDate}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-4">
              {/* Horizontal Date Picker */}
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

              {/* Time Slots Grid */}
              <div className="pt-2 border-t border-border/60">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Uygun Saatler
                  </span>
                </div>

                {!selectedServiceId || !selectedStaffId ? (
                  <div className="p-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                    Müsait saatleri listelemek için lütfen önce hizmet ve personel seçin.
                  </div>
                ) : isLoadingSlots ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border bg-card/40 p-8 text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span>Saatler hesaplanıyor...</span>
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
                          onClick={() => setSelectedSlot(slot)}
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
              </div>
            </CardContent>
          </Card>

          {/* 4. Müşteri Bilgileri / Seçimi */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">4. Müşteri</CardTitle>
                    <CardDescription className="text-xs">
                      Mevcut müşterilerden seçin veya yeni müşteri bilgisi girin
                    </CardDescription>
                  </div>
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/60 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCustomerMode("EXISTING")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                      customerMode === "EXISTING"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Mevcut Müşteri
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerMode("NEW")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                      customerMode === "NEW"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Yeni Müşteri
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              {customerMode === "EXISTING" ? (
                <div className="space-y-4">
                  {selectedCustomer ? (
                    /* Selected Customer Summary Card */
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {selectedCustomer.firstName[0]}
                            {(selectedCustomer.lastName || "")[0] || ""}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground text-sm">
                                {selectedCustomer.firstName} {selectedCustomer.lastName || ""}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                                Mevcut Müşteri
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Phone className="h-3 w-3" />
                              <span className="font-mono">{selectedCustomer.phone}</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCustomer(null)}
                          className="h-8 text-xs cursor-pointer"
                        >
                          Müşteriyi Değiştir
                        </Button>
                      </div>

                      {/* Operational Context Stats & CRM Link */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                          {selectedCustomer.appointmentCount !== undefined && (
                            <span>
                              Toplam: <strong className="text-foreground">{selectedCustomer.appointmentCount} randevu</strong>
                            </span>
                          )}
                          {selectedCustomer.lastAppointmentDate && (
                            <span>
                              Son Randevu:{" "}
                              <strong className="text-foreground">
                                {new Intl.DateTimeFormat("tr-TR", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }).format(new Date(selectedCustomer.lastAppointmentDate))}
                              </strong>
                            </span>
                          )}
                        </div>

                        {role !== "STAFF" && (
                          <Link
                            href={`/dashboard/customers/${selectedCustomer.id}`}
                            target="_blank"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <span>Müşteri Profilini Gör</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Searchable Customer Selector */
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Müşteri adı veya telefon ara..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            handleSearchCustomers(e.target.value);
                          }}
                          className="pl-9 h-10"
                        />
                        {isSearching && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>

                      {/* Search Results Dropdown List */}
                      <div className="space-y-1 max-h-56 overflow-y-auto rounded-xl border border-border p-1 bg-card">
                        {searchResults.length === 0 ? (
                          <div className="py-6 text-center text-xs text-muted-foreground">
                            {isSearching ? (
                              "Müşteriler aranıyor..."
                            ) : hasSearched && searchQuery.trim() ? (
                              "Eşleşen müşteri bulunamadı. Yeni müşteri için 'Yeni Müşteri' sekmesine geçebilirsiniz."
                            ) : (
                              "Arama yapmak için müşteri adı veya telefon numarası yazın."
                            )}
                          </div>
                        ) : (
                          searchResults.map((cust) => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(cust);
                              }}
                              className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-semibold text-xs shrink-0 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                  {cust.firstName[0]}
                                  {(cust.lastName || "")[0] || ""}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-foreground truncate">
                                    {cust.firstName} {cust.lastName || ""}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate font-mono">
                                    {cust.phone}
                                  </div>
                                </div>
                              </div>
                              {cust.appointmentCount !== undefined && cust.appointmentCount > 0 && (
                                <div className="text-[11px] text-muted-foreground shrink-0">
                                  {cust.appointmentCount} randevu
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Optional Appointment Note for Existing Customer */}
                  <div className="space-y-1.5 pt-2">
                    <label htmlFor="customer-notes-existing" className="text-xs font-semibold text-foreground">
                      Randevu Notu <span className="text-muted-foreground font-normal">(İsteğe bağlı)</span>
                    </label>
                    <Input
                      id="customer-notes-existing"
                      placeholder="Randevu ile ilgili özel not veya açıklama..."
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              ) : (
                /* NEW Customer Form */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="customer-first-name" className="text-xs font-semibold text-foreground">
                      Ad *
                    </label>
                    <Input
                      id="customer-first-name"
                      placeholder="Müşteri adı"
                      value={customerFirstName}
                      onChange={(e) => setCustomerFirstName(e.target.value)}
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="customer-last-name" className="text-xs font-semibold text-foreground">
                      Soyad <span className="text-muted-foreground font-normal">(İsteğe bağlı)</span>
                    </label>
                    <Input
                      id="customer-last-name"
                      placeholder="Müşteri soyadı"
                      value={customerLastName}
                      onChange={(e) => setCustomerLastName(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="customer-phone" className="text-xs font-semibold text-foreground">
                      Telefon *
                    </label>
                    <Input
                      id="customer-phone"
                      placeholder="05XX XXX XX XX"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="h-10"
                      required
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="customer-notes-new" className="text-xs font-semibold text-foreground">
                      Randevu Notu <span className="text-muted-foreground font-normal">(İsteğe bağlı)</span>
                    </label>
                    <Input
                      id="customer-notes-new"
                      placeholder="Randevu ile ilgili özel not veya açıklama..."
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Operational Summary */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 space-y-4">
          <Card className="border-border shadow-xs bg-card overflow-hidden">
            <CardHeader className="p-5 pb-3 bg-muted/30 border-b border-border/60">
              <CardTitle className="text-base font-semibold text-foreground">
                Randevu Özeti
              </CardTitle>
              <CardDescription className="text-xs">
                Seçilen detaylar ve teyit
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Service & Price */}
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Hizmet</span>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {selectedService ? selectedService.name : "Seçilmedi"}
                  </span>
                  {selectedService && (
                    <span className="text-xs text-muted-foreground">
                      {selectedService.durationMinutes} dk
                      {selectedService.price && ` • ${formatCurrency(selectedService.price)}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Staff */}
              <div className="space-y-1 pt-3 border-t border-border/60">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Personel</span>
                <div className="text-sm font-semibold text-foreground">
                  {selectedStaffMember
                    ? `${selectedStaffMember.firstName} ${selectedStaffMember.lastName}`
                    : "Seçilmedi"}
                </div>
              </div>

              {/* Date & Time */}
              <div className="space-y-1 pt-3 border-t border-border/60">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tarih & Saat</span>
                <div className="text-sm font-semibold text-foreground">
                  {selectedSlot ? (
                    <span className="inline-flex items-center gap-1.5 font-mono">
                      <span>{selectedSlot.localStartTime}</span>
                      <span className="font-sans text-xs text-muted-foreground font-normal">•</span>
                      <span className="font-sans text-xs">{selectedDate}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-normal text-xs">Saat seçilmedi</span>
                  )}
                </div>
              </div>

              {/* Customer */}
              <div className="space-y-1 pt-3 border-t border-border/60">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Müşteri</span>
                <div className="text-sm font-semibold text-foreground">
                  {customerMode === "EXISTING" && selectedCustomer ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>{selectedCustomer.firstName} {selectedCustomer.lastName || ""}</span>
                        <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">Mevcut</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span className="font-mono">{selectedCustomer.phone}</span>
                      </div>
                    </div>
                  ) : customerMode === "NEW" && customerFirstName ? (
                    <div className="space-y-0.5">
                      <div>{customerFirstName} {customerLastName}</div>
                      {customerPhone && (
                        <div className="text-xs text-muted-foreground font-normal flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span className="font-mono">{customerPhone}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground font-normal text-xs">Müşteri seçilmedi</span>
                  )}
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-4 border-t border-border/60 space-y-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={!canSubmit || isPending}
                  onClick={handleSubmit}
                  className="w-full min-h-[44px] font-semibold text-sm shadow-xs"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Randevu Kaydediliyor...
                    </>
                  ) : (
                    "Randevuyu Onayla ve Oluştur"
                  )}
                </Button>

                {!canSubmit && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Lütfen hizmet, personel, saat ve müşteri bilgilerini tamamlayın.
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
