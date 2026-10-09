"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, Loader2, ArrowLeft, User, Scissors, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getEligibleTargetStaffAction, reassignAppointmentAction } from "@/actions/appointment-reassign.actions";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function ReassignFlow({
  appointmentId,
  expectedUpdatedAt,
  currentStaffName,
  serviceName,
  localDate,
  startLocalTime,
  endLocalTime,
  customerName,
}: {
  appointmentId: string;
  expectedUpdatedAt: string;
  currentStaffName: string;
  serviceName: string;
  localDate: string;
  startLocalTime: string;
  endLocalTime: string;
  customerName: string;
}) {
  const router = useRouter();
  const [isReassigning, startReassigning] = useTransition();
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);

  const [eligibleStaff, setEligibleStaff] = useState<{ id: string; name: string }[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchStaff() {
      setIsLoadingStaff(true);
      setFetchError(null);
      const res = await getEligibleTargetStaffAction(appointmentId);
      if (!mounted) return;
      if (!res.success) {
        setFetchError(res.error || "Personel listesi yüklenemedi.");
      } else {
        setEligibleStaff(res.data || []);
      }
      setIsLoadingStaff(false);
    }
    fetchStaff();
    return () => {
      mounted = false;
    };
  }, [appointmentId]);

  const handleSubmit = () => {
    if (!selectedStaffId) return;

    setSubmitError(null);
    startReassigning(async () => {
      const res = await reassignAppointmentAction(
        appointmentId,
        selectedStaffId,
        expectedUpdatedAt
      );

      if (!res.success) {
        setSubmitError(res.error || "İşlem başarısız.");
        return;
      }

      router.push(`/dashboard/appointments?date=${localDate}`);
    });
  };

  const displayDate = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(new Date(localDate));

  const selectedStaff = eligibleStaff.find((s) => s.id === selectedStaffId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href={`/dashboard/appointments?date=${localDate}`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Randevulara Dön</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Personel Değiştir
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Mevcut randevuyu uygun başka bir ekip üyesine devredin.
          </p>
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive font-medium flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Current Details & Eligible Staff Selection */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* Current Appointment Card */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">Mevcut Randevu Bilgileri</CardTitle>
              <CardDescription className="text-xs">
                Devredilecek randevunun zaman ve müşteri detayları
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-2 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Müşteri</span>
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{customerName}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Hizmet</span>
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-muted-foreground" />
                    <span>{serviceName}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tarih & Saat</span>
                  <div className="font-semibold text-foreground flex items-center gap-2 font-mono">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{startLocalTime} – {endLocalTime}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{displayDate}</div>
                </div>

                <div className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-1">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Şu Anki Personel</span>
                  <div className="font-semibold text-foreground">
                    {currentStaffName}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Staff Selector */}
          <Card className="border-border shadow-xs">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-base font-semibold">Yeni Personel Seçin</CardTitle>
              <CardDescription className="text-xs">
                Bu randevu saatinde ve hizmette uygun olan ekip üyeleri listelenmektedir
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              {isLoadingStaff ? (
                <div className="flex justify-center items-center py-12 text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm">Personel uygunlukları kontrol ediliyor...</span>
                </div>
              ) : fetchError ? (
                <div className="p-4 text-sm text-center text-destructive bg-destructive/10 rounded-xl border border-destructive/20 font-medium">
                  {fetchError}
                </div>
              ) : eligibleStaff.length === 0 ? (
                <div className="p-8 text-center bg-muted/20 border border-dashed rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    Bu randevu saatinde ve bu hizmet için atanabilecek uygun başka bir personel bulunamadı.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {eligibleStaff.map((stf) => {
                    const isSelected = selectedStaffId === stf.id;
                    return (
                      <button
                        key={stf.id}
                        type="button"
                        onClick={() => setSelectedStaffId(stf.id)}
                        disabled={isReassigning}
                        className={cn(
                          "flex items-center justify-between p-3.5 rounded-xl border transition-all text-left cursor-pointer min-h-[56px]",
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary shadow-2xs"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "flex items-center justify-center w-8 h-8 rounded-full font-semibold text-xs shrink-0",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {stf.name.charAt(0).toUpperCase()}
                          </div>
                          <span className={cn("font-semibold text-sm truncate", isSelected ? "text-primary" : "text-foreground")}>
                            {stf.name}
                          </span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Assignment Summary & Confirm */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 space-y-4">
          <Card className="border-border shadow-xs bg-card overflow-hidden">
            <CardHeader className="p-5 pb-3 bg-muted/30 border-b border-border/60">
              <CardTitle className="text-base font-semibold text-foreground">
                Atama Özeti
              </CardTitle>
              <CardDescription className="text-xs">
                Personel transfer detayı
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Mevcut Personel</span>
                <div className="text-sm font-semibold text-foreground">
                  {currentStaffName}
                </div>
              </div>

              <div className="space-y-1 pt-3 border-t border-border/60">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Yeni Atanacak Personel</span>
                <div className="text-sm font-semibold text-primary">
                  {selectedStaff ? selectedStaff.name : "Henüz seçilmedi"}
                </div>
              </div>

              <div className="pt-4 border-t border-border/60 space-y-2">
                <Button
                  type="button"
                  size="lg"
                  disabled={!selectedStaffId || isReassigning || isLoadingStaff || eligibleStaff.length === 0}
                  onClick={handleSubmit}
                  className="w-full min-h-[44px] font-semibold text-sm shadow-xs"
                >
                  {isReassigning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Atanıyor...
                    </>
                  ) : (
                    "Personeli Değiştir"
                  )}
                </Button>

                <Button
                  variant="outline"
                  type="button"
                  onClick={() => router.push(`/dashboard/appointments?date=${localDate}`)}
                  disabled={isReassigning}
                  className="w-full"
                >
                  Vazgeç
                </Button>

                {!selectedStaffId && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Lütfen yeni personeli seçin.
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
