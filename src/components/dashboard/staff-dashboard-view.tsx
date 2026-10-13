"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Plus,
  User,
  CalendarCheck2,
  CheckCircle2,
  Phone,
  PhoneCall,
  XCircle,
  AlertCircle,
  Coffee,
  Trash2,
  Loader2,
  Scissors,
  CalendarSync,
  UserX,
  Check,
} from "lucide-react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  StaffWorkspaceData,
  StaffWorkspaceAgendaAppointment,
  StaffWorkspaceTimeBlock,
} from "@/types/staff-workspace";
import type { AvailabilitySlot } from "@/services/availability.service";
import { getAppointmentStatusLabel } from "@/lib/presentation";
import {
  completeAppointmentAction,
  markAppointmentNoShowAction,
  cancelAppointmentAction,
} from "@/actions/appointment-status.actions";
import {
  getRescheduleAvailabilityAction,
  rescheduleAppointmentAction,
} from "@/actions/appointment-reschedule.actions";
import {
  createStaffTimeBlockAction,
  deleteStaffTimeBlockAction,
} from "@/actions/time-blocks.actions";

export interface StaffDashboardAppointmentItem {
  id: string;
  localStartTime: string;
  localEndTime: string;
  customer: {
    firstName: string;
    lastName: string | null;
  };
  service: {
    nameSnapshot: string;
  };
  status: string;
}

interface StaffDashboardViewProps {
  workspace?: StaffWorkspaceData;
  businessName?: string;
  userName?: string;
  timezone?: string;
  todayDateStr?: string;
  todayAppointments?: StaffDashboardAppointmentItem[];
}

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" },
  CONFIRMED: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" },
  COMPLETED: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  CANCELLED: { bg: "bg-red-500/10", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" },
  NO_SHOW: { bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-400", border: "border-zinc-500/30" },
};

const BLOCK_TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  BREAK: { label: "Mola", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  TIME_OFF: { label: "İzin", bg: "bg-purple-500/10", text: "text-purple-700 dark:text-purple-400" },
  BLOCKED: { label: "Uygun Değil", bg: "bg-zinc-500/10", text: "text-zinc-700 dark:text-zinc-400" },
};

const DAY_SHORT_NAMES: Record<string, string> = {
  Pazartesi: "Pzt",
  Salı: "Sal",
  Çarşamba: "Çar",
  Perşembe: "Per",
  Cuma: "Cum",
  Cumartesi: "Cmt",
  Pazar: "Paz",
};

export function StaffDashboardView({
  workspace,
  businessName: propBusinessName,
  userName: propUserName,
  timezone: propTimezone,
  todayDateStr: propTodayDateStr,
}: StaffDashboardViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const businessName = workspace?.business.businessName ?? propBusinessName ?? "İşletme";
  const userName =
    workspace?.profile
      ? `${workspace.profile.firstName} ${workspace.profile.lastName || ""}`.trim()
      : propUserName ?? "Personel";
  const timezone = workspace?.business.timezone ?? propTimezone ?? "Europe/Istanbul";
  const todayDateStr = workspace?.business.localTodayDate ?? propTodayDateStr ?? "";

  // Selected Day State for 7-Day Ribbon
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    workspace?.selectedDayAgenda.dateStr ?? todayDateStr
  );

  // In-UI Feedback Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Status Action Dialog State
  const [statusDialogTarget, setStatusDialogTarget] = useState<{
    appointmentId: string;
    customerName: string;
    targetStatus: "COMPLETED" | "NO_SHOW" | "CANCELLED";
  } | null>(null);

  // Reschedule Modal State
  const [rescheduleTarget, setRescheduleTarget] = useState<{
    appointmentId: string;
    updatedAt: string;
    customerName: string;
    serviceName: string;
    currentDate: string;
    currentTime: string;
  } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(todayDateStr);
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Time Block Dialog State
  const [isTimeBlockModalOpen, setIsTimeBlockModalOpen] = useState(false);
  const [timeBlockType, setTimeBlockType] = useState<"BREAK" | "TIME_OFF" | "BLOCKED">("BREAK");
  const [timeBlockDate, setTimeBlockDate] = useState<string>(selectedDateStr || todayDateStr);
  const [timeBlockStartTime, setTimeBlockStartTime] = useState<string>("12:00");
  const [timeBlockEndTime, setTimeBlockEndTime] = useState<string>("13:00");
  const [timeBlockReason, setTimeBlockReason] = useState<string>("");
  const [timeBlockError, setTimeBlockError] = useState<string | null>(null);

  // Delete Time Block Dialog State
  const [deleteBlockTarget, setDeleteBlockTarget] = useState<StaffWorkspaceTimeBlock | null>(null);

  // Active day agenda resolution from 7-day ribbon or fallback
  const activeDayAgenda =
    workspace?.currentWeekAgenda.find((d) => d.dateStr === selectedDateStr) ??
    workspace?.selectedDayAgenda;

  const currentDayAppointments = activeDayAgenda?.appointments ?? [];
  const currentDayTimeBlocks = activeDayAgenda?.timeBlocks ?? [];

  // Combined and sorted chronological agenda stream
  type AgendaItem =
    | { kind: "APPOINTMENT"; time: string; data: StaffWorkspaceAgendaAppointment }
    | { kind: "TIME_BLOCK"; time: string; data: StaffWorkspaceTimeBlock };

  const combinedAgenda: AgendaItem[] = [
    ...currentDayAppointments.map((a) => ({
      kind: "APPOINTMENT" as const,
      time: a.localStartTime,
      data: a,
    })),
    ...currentDayTimeBlocks.map((tb) => ({
      kind: "TIME_BLOCK" as const,
      time: tb.localStartTime,
      data: tb,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  // Handlers for Status Transitions
  const handleConfirmStatusChange = () => {
    if (!statusDialogTarget) return;
    const { appointmentId, targetStatus } = statusDialogTarget;

    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);

      let res: { success: boolean; error?: string };
      if (targetStatus === "COMPLETED") {
        res = await completeAppointmentAction(appointmentId);
      } else if (targetStatus === "NO_SHOW") {
        res = await markAppointmentNoShowAction(appointmentId);
      } else {
        res = await cancelAppointmentAction(appointmentId);
      }

      if (!res.success) {
        setErrorMessage(res.error || "İşlem gerçekleştirilemedi.");
      } else {
        const label =
          targetStatus === "COMPLETED"
            ? "Randevu tamamlandı olarak işaretlendi."
            : targetStatus === "NO_SHOW"
            ? "Müşteri gelmedi olarak işaretlendi."
            : "Randevu başarıyla iptal edildi.";
        setSuccessMessage(label);
        router.refresh();
      }
      setStatusDialogTarget(null);
    });
  };

  // Handlers for Reschedule
  const openRescheduleModal = useCallback(
    async (target: {
      appointmentId: string;
      updatedAt: string;
      customerName: string;
      serviceName: string;
      currentDate: string;
      currentTime: string;
    }) => {
      setRescheduleTarget(target);
      setRescheduleDate(target.currentDate);
      setSelectedSlot(null);
      setRescheduleError(null);
      setIsLoadingSlots(true);

      const res = await getRescheduleAvailabilityAction(target.appointmentId, target.currentDate);
      setIsLoadingSlots(false);

      if (!res.success || !res.data) {
        setRescheduleError(res.error || "Müsait saatler alınamadı.");
        setRescheduleSlots([]);
      } else {
        if (res.data.reason === "CLOSED") {
          setRescheduleError("İşletme bu tarihte kapalı.");
        } else if (res.data.reason === "STAFF_NOT_BOOKABLE") {
          setRescheduleError("Personel bu tarihte uygun değil.");
        } else if (res.data.reason === "NO_AVAILABLE_SLOTS") {
          setRescheduleError("Bu tarihte boş randevu saati bulunmuyor.");
        }
        setRescheduleSlots(res.data.slots || []);
      }
    },
    []
  );

  const handleRescheduleDateChange = async (newDate: string) => {
    if (!rescheduleTarget) return;
    setRescheduleDate(newDate);
    setSelectedSlot(null);
    setRescheduleError(null);
    setIsLoadingSlots(true);

    const res = await getRescheduleAvailabilityAction(rescheduleTarget.appointmentId, newDate);
    setIsLoadingSlots(false);

    if (!res.success || !res.data) {
      setRescheduleError(res.error || "Müsait saatler alınamadı.");
      setRescheduleSlots([]);
    } else {
      if (res.data.reason === "CLOSED") {
        setRescheduleError("İşletme bu tarihte kapalı.");
      } else if (res.data.reason === "STAFF_NOT_BOOKABLE") {
        setRescheduleError("Personel bu tarihte uygun değil.");
      } else if (res.data.reason === "NO_AVAILABLE_SLOTS") {
        setRescheduleError("Bu tarihte boş randevu saati bulunmuyor.");
      }
      setRescheduleSlots(res.data.slots || []);
    }
  };

  const handleConfirmReschedule = () => {
    if (!rescheduleTarget || !selectedSlot) return;

    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await rescheduleAppointmentAction(
        rescheduleTarget.appointmentId,
        selectedSlot.startAt,
        rescheduleTarget.updatedAt
      );

      if (!res.success) {
        setRescheduleError(res.error || "Randevu saati değiştirilemedi.");
      } else {
        setSuccessMessage("Randevu saati başarıyla güncellendi.");
        setRescheduleTarget(null);
        router.refresh();
      }
    });
  };

  // Handlers for Time Block Creation
  const handleOpenTimeBlockModal = () => {
    setTimeBlockDate(selectedDateStr || todayDateStr);
    setTimeBlockStartTime("12:00");
    setTimeBlockEndTime("13:00");
    setTimeBlockReason("");
    setTimeBlockError(null);
    setIsTimeBlockModalOpen(true);
  };

  const handleConfirmCreateTimeBlock = () => {
    if (!workspace) return;
    if (!timeBlockStartTime || !timeBlockEndTime) {
      setTimeBlockError("Başlangıç ve bitiş saati gereklidir.");
      return;
    }
    if (timeBlockStartTime >= timeBlockEndTime) {
      setTimeBlockError("Bitiş saati başlangıç saatinden sonra olmalıdır.");
      return;
    }

    startTransition(async () => {
      setTimeBlockError(null);
      const res = await createStaffTimeBlockAction({
        staffId: workspace.profile.staffId,
        blockType: timeBlockType,
        startDate: timeBlockDate,
        startTime: timeBlockStartTime,
        endDate: timeBlockDate,
        endTime: timeBlockEndTime,
        reason: timeBlockReason.trim() || undefined,
      });

      if (!res.success) {
        setTimeBlockError(res.error || "Zaman bloğu eklenirken bir hata oluştu.");
      } else {
        setIsTimeBlockModalOpen(false);
        setSuccessMessage("Mola / uygun değil zamanı başarıyla eklendi.");
        router.refresh();
      }
    });
  };

  // Handlers for Time Block Deletion
  const handleConfirmDeleteTimeBlock = () => {
    if (!workspace || !deleteBlockTarget) return;

    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await deleteStaffTimeBlockAction({
        staffId: workspace.profile.staffId,
        blockId: deleteBlockTarget.id,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Zaman bloğu kaldırılamadı.");
      } else {
        setSuccessMessage("Zaman bloğu başarıyla kaldırıldı.");
        router.refresh();
      }
      setDeleteBlockTarget(null);
    });
  };

  const displayToday = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const nextAppt = workspace?.nextAppointment;

  return (
    <div className="space-y-6 pb-24 md:pb-12 max-w-5xl mx-auto">
      {/* ============================================================ */}
      {/* 0. IN-UI NOTIFICATION BANNERS                                 */}
      {/* ============================================================ */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setErrorMessage(null)}
            className="h-7 px-2 text-destructive hover:bg-destructive/10"
            aria-label="Kapat"
          >
            Tamam
          </Button>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSuccessMessage(null)}
            className="h-7 px-2 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            aria-label="Kapat"
          >
            Tamam
          </Button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. HEADER & QUICK PRIMARY ACTIONS                            */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {userName}
            </h1>
            <Badge variant="outline" className="text-xs bg-muted/40 font-semibold">
              Personel
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 capitalize">
            {displayToday} • <span className="font-medium text-foreground">{businessName}</span> • <span>{timezone.split("/")[1]?.replace("_", " ") || timezone}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/dashboard/appointments/new"
            className={cn(
              buttonVariants({ size: "sm" }),
              "shadow-xs font-semibold gap-1.5 min-h-[44px] px-4 rounded-xl"
            )}
          >
            <Plus className="h-4 w-4" />
            <span>Yeni Randevu</span>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenTimeBlockModal}
            className="gap-1.5 min-h-[44px] px-4 rounded-xl"
          >
            <Coffee className="h-4 w-4 text-muted-foreground" />
            <span>+ Mola Ekle</span>
          </Button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. HERO: NEXT APPOINTMENT FOCUS CARD                          */}
      {/* ============================================================ */}
      <section aria-labelledby="next-appointment-heading">
        <h2 id="next-appointment-heading" className="sr-only">
          Sıradaki Randevu
        </h2>

        {nextAppt ? (
          <Card className="border-primary/40 bg-card shadow-sm hover:border-primary transition-colors overflow-hidden">
            <div className="bg-primary/5 px-4 sm:px-6 py-2.5 border-b border-primary/20 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Sıradaki Randevu
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                  STATUS_BADGES[nextAppt.status]?.bg ?? "bg-blue-500/10",
                  STATUS_BADGES[nextAppt.status]?.text ?? "text-blue-700",
                  STATUS_BADGES[nextAppt.status]?.border ?? "border-blue-500/30"
                )}
              >
                {getAppointmentStatusLabel(nextAppt.status)}
              </span>
            </div>

            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-lg sm:text-xl font-bold text-foreground">
                      {nextAppt.customerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs sm:text-sm text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <Scissors className="h-3.5 w-3.5 text-primary" />
                      {nextAppt.serviceName}
                    </span>
                    <span>•</span>
                    <span className="font-mono font-medium text-foreground">
                      {nextAppt.localStartTime} – {nextAppt.localEndTime}
                    </span>
                    <span>•</span>
                    <span>{nextAppt.localDate === todayDateStr ? "Bugün" : nextAppt.localDate}</span>
                  </div>
                </div>

                {/* Telephone Call Button */}
                <a
                  href={`tel:${nextAppt.customerPhone}`}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-xs hover:bg-primary/90 transition-colors shrink-0"
                  title="Müşteriyi Doğrudan Ara"
                >
                  <PhoneCall className="h-4 w-4" />
                  <span>Ara ({nextAppt.customerPhone})</span>
                </a>
              </div>

              {/* Quick Operational Action Buttons */}
              <div className="pt-2 border-t border-border/60 flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    setStatusDialogTarget({
                      appointmentId: nextAppt.appointmentId,
                      customerName: nextAppt.customerName,
                      targetStatus: "COMPLETED",
                    })
                  }
                  className="min-h-[40px] text-xs font-semibold gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Tamamla</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    setStatusDialogTarget({
                      appointmentId: nextAppt.appointmentId,
                      customerName: nextAppt.customerName,
                      targetStatus: "NO_SHOW",
                    })
                  }
                  className="min-h-[40px] text-xs font-semibold gap-1.5 border-zinc-500/30 hover:bg-zinc-500/10 hover:text-zinc-700"
                >
                  <UserX className="h-3.5 w-3.5 text-zinc-600" />
                  <span>Gelmedi</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    openRescheduleModal({
                      appointmentId: nextAppt.appointmentId,
                      updatedAt: nextAppt.updatedAt,
                      customerName: nextAppt.customerName,
                      serviceName: nextAppt.serviceName,
                      currentDate: nextAppt.localDate,
                      currentTime: `${nextAppt.localStartTime} – ${nextAppt.localEndTime}`,
                    })
                  }
                  className="min-h-[40px] text-xs font-semibold gap-1.5 hover:bg-muted"
                >
                  <CalendarSync className="h-3.5 w-3.5 text-primary" />
                  <span>Saati Değiştir</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    setStatusDialogTarget({
                      appointmentId: nextAppt.appointmentId,
                      customerName: nextAppt.customerName,
                      targetStatus: "CANCELLED",
                    })
                  }
                  className="min-h-[40px] text-xs font-semibold gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>İptal Et</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border bg-card shadow-2xs">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <CalendarCheck2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Sırada bekleyen aktif randevunuz yok
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bugünkü tüm randevular tamamlandı veya planlanmış randevu bulunmuyor.
                </p>
              </div>
              <Link
                href="/dashboard/appointments/new"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs shrink-0")}
              >
                Yeni Randevu
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ============================================================ */}
      {/* 3. OPERATIONAL PULSE (ZERO FINANCIAL EXPOSURE)               */}
      {/* ============================================================ */}
      <section aria-labelledby="pulse-heading">
        <h2 id="pulse-heading" className="sr-only">
          Operasyonel Özet
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {/* Bugün Toplam */}
          <Card className="border-border shadow-2xs">
            <CardHeader className="p-3.5 sm:p-4 pb-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate block">
                <span className="sm:hidden">Bugün</span>
                <span className="hidden sm:inline">Bugün Toplam</span>
              </span>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-4 pt-0">
              <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                {workspace?.pulse.totalAppointmentsToday ?? currentDayAppointments.length}
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Randevu planlandı
              </span>
            </CardContent>
          </Card>

          {/* Kalan Randevular */}
          <Card className="border-border shadow-2xs">
            <CardHeader className="p-3.5 sm:p-4 pb-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate block">
                <span className="sm:hidden">Kalan</span>
                <span className="hidden sm:inline">Kalan Randevu</span>
              </span>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-4 pt-0">
              <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">
                {workspace?.pulse.remainingAppointmentsToday ?? 0}
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Bekleyen servis
              </span>
            </CardContent>
          </Card>

          {/* Tamamlanan */}
          <Card className="border-border shadow-2xs">
            <CardHeader className="p-3.5 sm:p-4 pb-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate block">
                Tamamlanan
              </span>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-4 pt-0">
              <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
                {workspace?.pulse.completedToday ?? 0}
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Servis bitti
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Pulse Info */}
        <div className="mt-2.5 px-1 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
          <span>
            Haftalık toplam:{" "}
            <strong className="text-foreground">
              {workspace?.pulse.weekCompletedAppointments ?? 0} /{" "}
              {workspace?.pulse.weekTotalAppointments ?? 0}
            </strong>{" "}
            tamamlandı
          </span>
          {((workspace?.pulse.cancelledToday ?? 0) > 0 || (workspace?.pulse.noShowToday ?? 0) > 0) && (
            <span className="text-muted-foreground/80">
              Bugün iptal: {workspace?.pulse.cancelledToday ?? 0} • Gelmedi:{" "}
              {workspace?.pulse.noShowToday ?? 0}
            </span>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. 7-DAY WEEK HORIZONTAL TOUCH RIBBON (Pzt - Paz)            */}
      {/* ============================================================ */}
      <section aria-labelledby="week-ribbon-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="week-ribbon-heading" className="text-sm font-bold tracking-tight text-foreground">
            Haftalık Akış
          </h2>
          <span className="text-xs text-muted-foreground">Pazartesi – Pazar</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {workspace?.currentWeekAgenda.map((day) => {
            const isSelected = day.dateStr === selectedDateStr;
            const isToday = day.dateStr === todayDateStr;
            const shortName = DAY_SHORT_NAMES[day.dayName] ?? day.dayName.slice(0, 3);
            const dayNum = day.dateStr.split("-")[2];

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => setSelectedDateStr(day.dateStr)}
                className={cn(
                  "flex flex-col items-center justify-center p-2 rounded-xl text-center transition-all min-h-[58px] sm:min-h-[64px] border",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                    : isToday
                    ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15"
                    : "bg-card text-foreground border-border hover:bg-muted/50"
                )}
                aria-pressed={isSelected}
                aria-label={`${day.dayName} ${dayNum}, ${day.totalAppointments} randevu`}
              >
                <span className="text-[10px] sm:text-xs uppercase tracking-tight opacity-80">
                  {shortName}
                </span>
                <span className="text-sm sm:text-base font-bold my-0.5">{dayNum}</span>
                <div className="flex items-center gap-1">
                  {day.totalAppointments > 0 ? (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.2 rounded-full font-semibold",
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-primary/15 text-primary"
                      )}
                    >
                      {day.totalAppointments}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "text-[10px] opacity-60",
                        !day.isWorkingDay && "text-muted-foreground"
                      )}
                    >
                      {day.isWorkingDay ? "—" : "İzin"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. SELECTED DAY AGENDA STREAM (Appointments + Time Blocks)   */}
      {/* ============================================================ */}
      <section aria-labelledby="agenda-stream-heading" className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 id="agenda-stream-heading" className="text-base font-bold tracking-tight text-foreground">
              {activeDayAgenda?.dayName},{" "}
              <span className="text-muted-foreground font-normal">{selectedDateStr}</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeDayAgenda?.isWorkingDay
                ? activeDayAgenda.workingHours
                  ? `Çalışma Saati: ${activeDayAgenda.workingHours.startTime} – ${activeDayAgenda.workingHours.endTime}`
                  : "Çalışma saatleri tanımlanmamış"
                : "Haftalık İzin / Tatil Günü"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenTimeBlockModal}
              className="text-xs gap-1 min-h-[36px]"
            >
              <Coffee className="h-3.5 w-3.5" />
              <span>Mola Ekle</span>
            </Button>
            <Link
              href={`/dashboard/appointments/new?date=${selectedDateStr}`}
              className={cn(buttonVariants({ size: "sm" }), "text-xs gap-1 min-h-[36px]")}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Randevu</span>
            </Link>
          </div>
        </div>

        {combinedAgenda.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 sm:p-10 text-center flex flex-col items-center justify-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
              <CalendarCheck2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Bu gün için planlanan randevu veya mola bulunmuyor
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Yeni bir müşteri randevusu oluşturabilir veya gün içine kişisel mola ekleyebilirsiniz.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Link
                href={`/dashboard/appointments/new?date=${selectedDateStr}`}
                className={cn(buttonVariants({ size: "sm" }), "shadow-xs")}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Randevu Oluştur
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenTimeBlockModal}
              >
                Mola Ekle
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border/60 overflow-hidden shadow-xs">
            {combinedAgenda.map((item, idx) => {
              if (item.kind === "TIME_BLOCK") {
                const tb = item.data;
                const blockInfo =
                  BLOCK_TYPE_LABELS[tb.blockType] || BLOCK_TYPE_LABELS.BREAK;

                return (
                  <div
                    key={`tb-${tb.id}-${idx}`}
                    className="p-4 bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <Coffee className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-sm text-foreground">
                            {tb.localStartTime} – {tb.localEndTime}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold",
                              blockInfo.bg,
                              blockInfo.text
                            )}
                          >
                            {blockInfo.label}
                          </span>
                        </div>
                        {tb.reason && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tb.reason}
                          </p>
                        )}
                      </div>
                    </div>

                    {!tb.isPast && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setDeleteBlockTarget(tb)}
                        className="text-xs text-muted-foreground hover:text-destructive h-8 px-2 self-end sm:self-center"
                        title="Zaman bloğunu kaldır"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        <span>Kaldır</span>
                      </Button>
                    )}
                  </div>
                );
              }

              // APPOINTMENT ITEM
              const app = item.data;
              const badge = STATUS_BADGES[app.status] || STATUS_BADGES.PENDING;
              const customerName = `${app.customer.firstName} ${app.customer.lastName || ""}`.trim();

              return (
                <div
                  key={`app-${app.appointmentId}-${idx}`}
                  className="p-4 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono font-bold text-sm sm:text-base text-foreground">
                        {app.localStartTime} – {app.localEndTime}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                          badge.bg,
                          badge.text,
                          badge.border
                        )}
                      >
                        {getAppointmentStatusLabel(app.status)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{customerName}</span>
                      </div>

                      {/* Direct Click-to-Call */}
                      <a
                        href={`tel:${app.customer.phone}`}
                        className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline bg-primary/5 px-2 py-0.5 rounded-md border border-primary/20"
                        title="Müşteriyi Ara"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{app.customer.phone}</span>
                      </a>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Scissors className="h-3 w-3 text-muted-foreground" />
                      <span>
                        {app.service.name} • {app.service.durationMinutes} dk
                      </span>
                    </div>
                  </div>

                  {/* Contextual Appointment Operational Actions */}
                  <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center">
                    {app.allowedActions.canComplete && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setStatusDialogTarget({
                            appointmentId: app.appointmentId,
                            customerName,
                            targetStatus: "COMPLETED",
                          })
                        }
                        className="h-8 text-xs font-medium border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700"
                      >
                        <Check className="h-3 w-3 mr-1 text-emerald-600" />
                        Tamamla
                      </Button>
                    )}

                    {app.allowedActions.canMarkNoShow && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setStatusDialogTarget({
                            appointmentId: app.appointmentId,
                            customerName,
                            targetStatus: "NO_SHOW",
                          })
                        }
                        className="h-8 text-xs font-medium border-zinc-500/30 hover:bg-zinc-500/10 hover:text-zinc-700"
                      >
                        <UserX className="h-3 w-3 mr-1 text-zinc-600" />
                        Gelmedi
                      </Button>
                    )}

                    {app.allowedActions.canReschedule && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          openRescheduleModal({
                            appointmentId: app.appointmentId,
                            updatedAt: app.updatedAt,
                            customerName,
                            serviceName: app.service.name,
                            currentDate: app.localDate,
                            currentTime: `${app.localStartTime} – ${app.localEndTime}`,
                          })
                        }
                        className="h-8 text-xs font-medium hover:bg-muted"
                      >
                        <CalendarSync className="h-3 w-3 mr-1 text-primary" />
                        Saati Değiştir
                      </Button>
                    )}

                    {app.allowedActions.canCancel && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          setStatusDialogTarget({
                            appointmentId: app.appointmentId,
                            customerName,
                            targetStatus: "CANCELLED",
                          })
                        }
                        className="h-8 text-xs font-medium text-destructive border-destructive/30 hover:bg-destructive/10"
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        İptal
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* 6. ASSIGNED SERVICES LIST (ZERO PRICES, READ ONLY)           */}
      {/* ============================================================ */}
      {workspace?.assignedServices && workspace.assignedServices.length > 0 && (
        <section aria-labelledby="services-heading" className="space-y-3 pt-4 border-t border-border/60">
          <div className="flex items-center justify-between">
            <h2 id="services-heading" className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <Scissors className="h-4 w-4 text-primary" />
              <span>Hizmetlerim ({workspace.assignedServices.length})</span>
            </h2>
            <span className="text-xs text-muted-foreground">Tanımlı hizmet listesi</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {workspace.assignedServices.map((svc) => (
              <div
                key={svc.id}
                className="p-3 rounded-xl border border-border bg-card flex items-center justify-between text-xs"
              >
                <div className="font-medium text-foreground truncate pr-2">
                  {svc.name}
                </div>
                <div className="font-mono text-muted-foreground shrink-0">
                  {svc.durationMinutes} dk
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/* 7. QUICK NAVIGATION SHORTCUTS                                */}
      {/* ============================================================ */}
      <div className="space-y-3 pt-4 border-t border-border/60">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Kısayollar
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/dashboard/appointments/new"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs min-h-[56px]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Plus className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Yeni Randevu</span>
              <span className="text-xs text-muted-foreground truncate">Manuel müşteri randevusu oluştur</span>
            </div>
          </Link>

          <Link
            href="/dashboard/appointments"
            className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/30 transition-all group shadow-2xs min-h-[56px]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">Randevu Ajandası</span>
              <span className="text-xs text-muted-foreground truncate">Detaylı ajanda takvimi</span>
            </div>
          </Link>
        </div>
      </div>

      {/* ============================================================ */}
      {/* DIALOG 1: STATUS ACTION CONFIRMATION (Base UI AlertDialog)    */}
      {/* ============================================================ */}
      <AlertDialog.Root
        open={statusDialogTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setStatusDialogTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    statusDialogTarget?.targetStatus === "CANCELLED"
                      ? "bg-destructive/10 text-destructive"
                      : statusDialogTarget?.targetStatus === "COMPLETED"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-zinc-500/10 text-zinc-600"
                  )}
                >
                  {statusDialogTarget?.targetStatus === "CANCELLED" ? (
                    <XCircle className="h-5 w-5" />
                  ) : statusDialogTarget?.targetStatus === "COMPLETED" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <UserX className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <AlertDialog.Title className="text-lg font-bold text-foreground">
                    {statusDialogTarget?.targetStatus === "COMPLETED"
                      ? "Randevuyu Tamamla"
                      : statusDialogTarget?.targetStatus === "NO_SHOW"
                      ? "Gelmedi Olarak İşaretle"
                      : "Randevuyu İptal Et"}
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {statusDialogTarget?.customerName} isimli müşterinin randevusunu{" "}
                    {statusDialogTarget?.targetStatus === "COMPLETED"
                      ? "tamamlandı olarak işaretlemek istiyor musunuz?"
                      : statusDialogTarget?.targetStatus === "NO_SHOW"
                      ? "müşteri gelmedi olarak işaretlemek istiyor musunuz?"
                      : "iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz."}
                  </AlertDialog.Description>
                </div>
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setStatusDialogTarget(null)}
                  className="min-h-[44px]"
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  variant={
                    statusDialogTarget?.targetStatus === "CANCELLED" ? "destructive" : "default"
                  }
                  disabled={isPending}
                  onClick={handleConfirmStatusChange}
                  className="min-h-[44px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      İşleniyor...
                    </>
                  ) : statusDialogTarget?.targetStatus === "CANCELLED" ? (
                    "İptal Et"
                  ) : statusDialogTarget?.targetStatus === "COMPLETED" ? (
                    "Tamamla"
                  ) : (
                    "Gelmedi Olarak İşaretle"
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* ============================================================ */}
      {/* DIALOG 2: RESCHEDULE MODAL ("Saati Değiştir")                 */}
      {/* ============================================================ */}
      <AlertDialog.Root
        open={rescheduleTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setRescheduleTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div>
                <AlertDialog.Title className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CalendarSync className="h-5 w-5 text-primary" />
                  <span>Randevu Saatini Değiştir</span>
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-xs text-muted-foreground">
                  {rescheduleTarget?.customerName} • {rescheduleTarget?.serviceName} (Mevcut:{" "}
                  {rescheduleTarget?.currentTime})
                </AlertDialog.Description>
              </div>

              {rescheduleError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{rescheduleError}</span>
                </div>
              )}

              {/* Date Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Yeni Tarih Seçin</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={todayDateStr}
                  onChange={(e) => handleRescheduleDateChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                />
              </div>

              {/* Available Slots */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Müsait Saatler</span>
                  {isLoadingSlots && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-normal">
                      <Loader2 className="h-3 w-3 animate-spin" /> Yükleniyor...
                    </span>
                  )}
                </label>

                {isLoadingSlots ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Müsait saatler kontrol ediliyor...
                  </div>
                ) : rescheduleSlots.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-xl p-4">
                    Bu tarih için uygun randevu saati bulunmuyor. Farklı bir tarih seçebilirsiniz.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 border rounded-xl">
                    {rescheduleSlots.map((slot) => {
                      const isChosen = selectedSlot?.startAt === slot.startAt;
                      return (
                        <button
                          key={slot.startAt}
                          type="button"
                          onClick={() => {
                            setSelectedSlot(slot);
                            setRescheduleError(null);
                          }}
                          className={cn(
                            "py-2 px-1 rounded-lg text-xs font-mono font-semibold transition-colors min-h-[40px] border",
                            isChosen
                              ? "bg-primary text-primary-foreground border-primary shadow-xs"
                              : "bg-muted/40 hover:bg-muted border-border text-foreground"
                          )}
                        >
                          {slot.localStartTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selection Summary */}
              {selectedSlot && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground space-y-1">
                  <div className="font-semibold text-primary">Yeni Randevu Zamanı:</div>
                  <div className="flex items-center gap-2 font-mono">
                    <span>{rescheduleDate}</span>
                    <span>•</span>
                    <span>
                      {selectedSlot.localStartTime} – {selectedSlot.localEndTime}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setRescheduleTarget(null)}
                  className="min-h-[44px]"
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  disabled={!selectedSlot || isPending || isLoadingSlots}
                  onClick={handleConfirmReschedule}
                  className="min-h-[44px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Güncelleniyor...
                    </>
                  ) : (
                    "Saati Güncelle"
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* ============================================================ */}
      {/* DIALOG 3: CREATE TIME BLOCK MODAL ("Mola / Blok Ekle")       */}
      {/* ============================================================ */}
      <AlertDialog.Root
        open={isTimeBlockModalOpen}
        onOpenChange={(open) => {
          if (!open && !isPending) setIsTimeBlockModalOpen(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6 space-y-4">
              <div>
                <AlertDialog.Title className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Coffee className="h-5 w-5 text-primary" />
                  <span>Kişisel Mola / Blok Ekle</span>
                </AlertDialog.Title>
                <AlertDialog.Description className="mt-1 text-xs text-muted-foreground">
                  Seçilen zaman aralığında randevu alınması engellenecektir.
                </AlertDialog.Description>
              </div>

              {timeBlockError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{timeBlockError}</span>
                </div>
              )}

              {/* Block Type Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Tür</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { type: "BREAK", label: "Mola" },
                      { type: "TIME_OFF", label: "İzin" },
                      { type: "BLOCKED", label: "Uygun Değil" },
                    ] as const
                  ).map((bt) => (
                    <button
                      key={bt.type}
                      type="button"
                      onClick={() => setTimeBlockType(bt.type)}
                      className={cn(
                        "py-2 px-2 rounded-xl text-xs font-semibold border transition-colors min-h-[44px]",
                        timeBlockType === bt.type
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-muted/30 border-border text-foreground hover:bg-muted"
                      )}
                    >
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Tarih</label>
                <input
                  type="date"
                  value={timeBlockDate}
                  min={todayDateStr}
                  onChange={(e) => setTimeBlockDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                />
              </div>

              {/* Time Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Başlangıç Saati</label>
                  <input
                    type="time"
                    value={timeBlockStartTime}
                    onChange={(e) => setTimeBlockStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Bitiş Saati</label>
                  <input
                    type="time"
                    value={timeBlockEndTime}
                    onChange={(e) => setTimeBlockEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                  />
                </div>
              </div>

              {/* Reason Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Açıklama (İsteğe Bağlı)</label>
                <input
                  type="text"
                  placeholder="Örn: Öğle molası, Kişisel iş"
                  value={timeBlockReason}
                  onChange={(e) => setTimeBlockReason(e.target.value)}
                  maxLength={100}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                />
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setIsTimeBlockModalOpen(false)}
                  className="min-h-[44px]"
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmCreateTimeBlock}
                  className="min-h-[44px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Ekleniyor...
                    </>
                  ) : (
                    "Mola Ekle"
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* ============================================================ */}
      {/* DIALOG 4: DELETE TIME BLOCK CONFIRMATION                      */}
      {/* ============================================================ */}
      <AlertDialog.Root
        open={deleteBlockTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setDeleteBlockTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <AlertDialog.Title className="text-lg font-bold text-foreground">
                    Zaman Bloğunu Kaldır
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {deleteBlockTarget?.localStartTime} – {deleteBlockTarget?.localEndTime} aralığındaki{" "}
                    {deleteBlockTarget?.blockType === "BREAK"
                      ? "molayı"
                      : deleteBlockTarget?.blockType === "TIME_OFF"
                      ? "izni"
                      : "engeli"}{" "}
                    kaldırmak istediğinizden emin misiniz?
                  </AlertDialog.Description>
                </div>
              </div>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setDeleteBlockTarget(null)}
                  className="min-h-[44px]"
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={handleConfirmDeleteTimeBlock}
                  className="min-h-[44px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Kaldırılıyor...
                    </>
                  ) : (
                    "Kaldır"
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
