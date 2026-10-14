"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CalendarOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Scissors,
  Save,
  Clock,
  Sparkles,
  Building2,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getTimeBlockTypeLabel, getTimeBlockStatusLabel, formatCurrency } from "@/lib/presentation";
import {
  assignStaffServicesAction,
  toggleStaffPublicBookingAction,
  saveStaffWorkingHoursAction,
  setStaffScheduleModeAction,
} from "@/actions/staff.actions";
import {
  createStaffTimeBlockAction,
  updateStaffTimeBlockAction,
  deleteStaffTimeBlockAction,
} from "@/actions/time-blocks.actions";
import type { StaffProfileDetail } from "@/repositories/staff.repository";
import type { BookingReadinessResult } from "@/services/staff.service";
import type { FormattedTimeBlock } from "@/services/time-blocks.service";
import type { Service, TimeBlockType } from "@/db/schema";

export interface BusinessWorkingHourItem {
  id?: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  isClosed: boolean;
}

interface CustomDayState {
  dayOfWeek: number;
  name: string;
  isWorking: boolean;
  startTime: string;
  endTime: string;
}

const ORDERED_DAYS: Array<{ dayOfWeek: number; name: string }> = [
  { dayOfWeek: 1, name: "Pazartesi" },
  { dayOfWeek: 2, name: "Salı" },
  { dayOfWeek: 3, name: "Çarşamba" },
  { dayOfWeek: 4, name: "Perşembe" },
  { dayOfWeek: 5, name: "Cuma" },
  { dayOfWeek: 6, name: "Cumartesi" },
  { dayOfWeek: 0, name: "Pazar" },
];

interface StaffDetailClientProps {
  initialStaff: StaffProfileDetail;
  availableActiveServices: Service[];
  initialBookingReadiness: BookingReadinessResult;
  businessWorkingHours: BusinessWorkingHourItem[];
  initialTimeBlocks: FormattedTimeBlock[];
  businessTimezone: string;
  callerRole: "OWNER" | "MANAGER";
}

export function StaffDetailClient({
  initialStaff,
  availableActiveServices,
  initialBookingReadiness,
  businessWorkingHours,
  initialTimeBlocks,
  businessTimezone,
}: StaffDetailClientProps) {
  const [staff, setStaff] = useState<StaffProfileDetail>(initialStaff);
  const [readiness, setReadiness] = useState<BookingReadinessResult>(initialBookingReadiness);
  const [timeBlocks, setTimeBlocks] = useState<FormattedTimeBlock[]>(initialTimeBlocks);

  // Initialize selected service IDs from currently assigned services
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(
    new Set(initialStaff.assignedServices.map((s) => s.id))
  );

  const [isSavingServices, setIsSavingServices] = useState(false);
  const [isTogglingBooking, setIsTogglingBooking] = useState(false);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Time Block State
  const [isBlockFormOpen, setIsBlockFormOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockFormData, setBlockFormData] = useState<{
    blockType: TimeBlockType;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    reason: string;
  }>({
    blockType: "TIME_OFF",
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "18:00",
    reason: "",
  });
  const [isSavingBlock, setIsSavingBlock] = useState(false);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
  const [blockFormError, setBlockFormError] = useState<string | null>(null);

  // Custom schedule state initialized from saved custom hours, business hours (UX prefill), or defaults
  const [customSchedule, setCustomSchedule] = useState<CustomDayState[]>(() => {
    return ORDERED_DAYS.map((def) => {
      // 1. Check if staff already has saved customWorkingHours
      const savedCustom = initialStaff.customWorkingHours?.find(
        (h) => h.dayOfWeek === def.dayOfWeek
      );
      if (savedCustom) {
        return {
          dayOfWeek: def.dayOfWeek,
          name: def.name,
          isWorking: savedCustom.isWorking,
          startTime: savedCustom.startTime ? savedCustom.startTime.slice(0, 5) : "09:00",
          endTime: savedCustom.endTime ? savedCustom.endTime.slice(0, 5) : "18:00",
        };
      }

      // 2. UX-only prefill from businessWorkingHours (NOT saved to DB until user clicks save)
      const bwh = businessWorkingHours?.find((h) => h.dayOfWeek === def.dayOfWeek);
      if (bwh) {
        return {
          dayOfWeek: def.dayOfWeek,
          name: def.name,
          isWorking: !bwh.isClosed,
          startTime: bwh.startTime ? bwh.startTime.slice(0, 5) : "09:00",
          endTime: bwh.endTime ? bwh.endTime.slice(0, 5) : "18:00",
        };
      }

      // 3. Fallback defaults
      return {
        dayOfWeek: def.dayOfWeek,
        name: def.name,
        isWorking: def.dayOfWeek !== 0, // Closed on Sunday
        startTime: "09:00",
        endTime: "18:00",
      };
    });
  });

  // Identify any legacy inactive services that are assigned to this staff member
  const inactiveAssignedServices = staff.assignedServices.filter((s) => !s.active);

  // Toggle service selection
  const handleToggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  };

  // Handle saving service assignments
  const handleSaveServices = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSavingServices(true);

    try {
      const activeServiceIds = availableActiveServices
        .filter((s) => selectedServiceIds.has(s.id))
        .map((s) => s.id);
      const removeInactiveServiceIds = inactiveAssignedServices
        .filter((s) => !selectedServiceIds.has(s.id))
        .map((s) => s.id);

      const res = await assignStaffServicesAction({
        staffId: staff.id,
        serviceIds: activeServiceIds,
        removeInactiveServiceIds,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Hizmetler atanırken bir hata oluştu.");
      } else {
        if (res.staff) {
          setStaff(res.staff);
        }
        if (res.bookingReadiness) {
          setReadiness(res.bookingReadiness);
        }

        if (res.publicBookingAutoDisabled) {
          setSuccessMsg(
            "Hizmet atamaları güncellendi. Personele ait aktif hizmet kalmadığı için herkese açık randevu alma otomatik olarak kapatıldı."
          );
        } else {
          setSuccessMsg("Hizmet atamaları başarıyla güncellendi.");
        }
      }
    } catch {
      setErrorMsg("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSavingServices(false);
    }
  };

  // Handle toggling public booking
  const handleTogglePublicBooking = async (newEnabled: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsTogglingBooking(true);

    try {
      const res = await toggleStaffPublicBookingAction({
        staffId: staff.id,
        enabled: newEnabled,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Randevu durumu güncellenemedi.");
      } else {
        if (res.staff) {
          setStaff(res.staff);
        }
        if (res.bookingReadiness) {
          setReadiness(res.bookingReadiness);
        }
        setSuccessMsg(
          newEnabled
            ? "Herkese açık randevu alma başarıyla aktif edildi."
            : "Herkese açık randevu alma kapatıldı."
        );
      }
    } catch {
      setErrorMsg("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsTogglingBooking(false);
    }
  };

  // Handle switching schedule mode (İşletme vs Özel)
  const handleSwitchScheduleMode = async (targetUsesBusinessHours: boolean) => {
    if (targetUsesBusinessHours === staff.usesBusinessHours) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsUpdatingMode(true);

    try {
      const res = await setStaffScheduleModeAction({
        staffId: staff.id,
        usesBusinessHours: targetUsesBusinessHours,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Çalışma saati modu güncellenemedi.");
      } else {
        if (res.staff) {
          setStaff(res.staff);
        } else {
          setStaff((prev) => ({ ...prev, usesBusinessHours: targetUsesBusinessHours }));
        }
        if (res.bookingReadiness) {
          setReadiness(res.bookingReadiness);
        }

        if (res.publicBookingAutoDisabled) {
          setSuccessMsg(
            "Çalışma saati modu değiştirildi. Geçerli çalışma takvimi randevu için uygun olmadığından herkese açık randevu alma otomatik olarak kapatıldı."
          );
        } else {
          setSuccessMsg(
            targetUsesBusinessHours
              ? "Çalışma saatleri modu: İşletme çalışma saatleri olarak güncellendi."
              : "Çalışma saatleri modu: Özel çalışma saatleri olarak güncellendi."
          );
        }
      }
    } catch {
      setErrorMsg("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsUpdatingMode(false);
    }
  };

  // Handle custom schedule input updates
  const handleToggleWorkingDay = (dayOfWeek: number, isWorking: boolean) => {
    setCustomSchedule((prev) =>
      prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, isWorking } : day))
    );
  };

  const handleTimeChange = (
    dayOfWeek: number,
    field: "startTime" | "endTime",
    value: string
  ) => {
    setCustomSchedule((prev) =>
      prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, [field]: value } : day))
    );
  };

  // Handle saving custom working hours
  const handleSaveCustomHours = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    // Client-side pre-validation
    for (const day of customSchedule) {
      if (day.isWorking) {
        if (!day.startTime || !day.endTime) {
          setErrorMsg(`${day.name} için açılış ve kapanış saatleri zorunludur.`);
          return;
        }
        if (day.startTime >= day.endTime) {
          setErrorMsg(
            `${day.name} için açılış saati (${day.startTime}), kapanış saatinden (${day.endTime}) önce olmalıdır.`
          );
          return;
        }
      }
    }

    setIsSavingHours(true);

    try {
      const schedulePayload = customSchedule.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isWorking: day.isWorking,
        startTime: day.isWorking ? day.startTime : null,
        endTime: day.isWorking ? day.endTime : null,
      }));

      const res = await saveStaffWorkingHoursAction({
        staffId: staff.id,
        schedule: schedulePayload,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Özel çalışma saatleri kaydedilemedi.");
      } else {
        if (res.staff) {
          setStaff(res.staff);
        }
        if (res.bookingReadiness) {
          setReadiness(res.bookingReadiness);
        }

        if (res.publicBookingAutoDisabled) {
          setSuccessMsg(
            "Özel çalışma saatleri kaydedildi. Personelin hiçbir açık çalışma günü kalmadığı için herkese açık randevu alma otomatik olarak kapatıldı."
          );
        } else {
          setSuccessMsg("Özel çalışma saatleri başarıyla kaydedildi.");
        }
      }
    } catch {
      setErrorMsg("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSavingHours(false);
    }
  };

  // Time Block Handlers
  const handleOpenCreateBlock = () => {
    const today = new Date().toISOString().split("T")[0];
    setBlockFormData({
      blockType: "TIME_OFF",
      startDate: today,
      startTime: "09:00",
      endDate: today,
      endTime: "18:00",
      reason: "",
    });
    setEditingBlockId(null);
    setBlockFormError(null);
    setIsBlockFormOpen(true);
  };

  const handleStartEditBlock = (block: FormattedTimeBlock) => {
    if (block.status === "PAST") return;
    setBlockFormData({
      blockType: block.blockType,
      startDate: block.startFormatted.dateStr,
      startTime: block.startFormatted.timeStr,
      endDate: block.endFormatted.dateStr,
      endTime: block.endFormatted.timeStr,
      reason: block.reason ?? "",
    });
    setEditingBlockId(block.id);
    setBlockFormError(null);
    setIsBlockFormOpen(true);
  };

  const handleCancelBlockForm = () => {
    setIsBlockFormOpen(false);
    setEditingBlockId(null);
    setBlockFormError(null);
  };

  const handleSaveBlock = async () => {
    setBlockFormError(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!blockFormData.startDate || !blockFormData.startTime) {
      setBlockFormError("Başlangıç tarihi ve saati zorunludur.");
      return;
    }
    if (!blockFormData.endDate || !blockFormData.endTime) {
      setBlockFormError("Bitiş tarihi ve saati zorunludur.");
      return;
    }

    setIsSavingBlock(true);

    try {
      if (editingBlockId) {
        const res = await updateStaffTimeBlockAction({
          staffId: staff.id,
          blockId: editingBlockId,
          blockType: blockFormData.blockType,
          startDate: blockFormData.startDate,
          startTime: blockFormData.startTime,
          endDate: blockFormData.endDate,
          endTime: blockFormData.endTime,
          reason: blockFormData.reason,
        });

        if (!res.success || !res.block) {
          setBlockFormError(res.error || "Zaman bloğu güncellenemedi.");
        } else {
          const updated = res.block;
          setTimeBlocks((prev) =>
            prev.map((b) => (b.id === updated.id ? updated : b))
          );
          setIsBlockFormOpen(false);
          setEditingBlockId(null);
          setSuccessMsg("Zaman bloğu başarıyla güncellendi.");
        }
      } else {
        const res = await createStaffTimeBlockAction({
          staffId: staff.id,
          blockType: blockFormData.blockType,
          startDate: blockFormData.startDate,
          startTime: blockFormData.startTime,
          endDate: blockFormData.endDate,
          endTime: blockFormData.endTime,
          reason: blockFormData.reason,
        });

        if (!res.success || !res.block) {
          setBlockFormError(res.error || "Zaman bloğu oluşturulamadı.");
        } else {
          const created = res.block;
          setTimeBlocks((prev) => [...prev, created]);
          setIsBlockFormOpen(false);
          setEditingBlockId(null);
          setSuccessMsg("Zaman bloğu başarıyla oluşturuldu.");
        }
      }
    } catch {
      setBlockFormError("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setIsSavingBlock(false);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setDeletingBlockId(blockId);

    try {
      const res = await deleteStaffTimeBlockAction({
        staffId: staff.id,
        blockId,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Zaman bloğu silinemedi.");
      } else {
        setTimeBlocks((prev) => prev.filter((b) => b.id !== blockId));
        setSuccessMsg("Zaman bloğu başarıyla silindi.");
      }
    } catch {
      setErrorMsg("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setDeletingBlockId(null);
    }
  };

  const displayName = `${staff.firstName} ${staff.lastName}`.trim() || staff.member.userName;

  // Sort blocks: active & upcoming first (ordered chronologically), then past blocks
  const sortedBlocks = [...timeBlocks].sort((a, b) => {
    const aIsPast = a.status === "PAST";
    const bIsPast = b.status === "PAST";
    if (aIsPast && !bIsPast) return 1;
    if (!aIsPast && bIsPast) return -1;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return (
    <div className="space-y-6 w-full">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard/staff"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Personel Listesine Dön</span>
            </Link>
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {displayName}
            </h1>
            <Badge variant="outline" className="text-xs">
              {staff.member.role === "OWNER"
                ? "İşletme Sahibi"
                : staff.member.role === "MANAGER"
                ? "İşletme Yöneticisi"
                : "Personel"}
            </Badge>
            <Badge
              variant={staff.active && staff.member.active ? "default" : "outline"}
              className={cn(
                "text-xs",
                staff.active && staff.member.active
                  ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                  : "text-muted-foreground"
              )}
            >
              {staff.active && staff.member.active ? "Aktif" : "Pasif"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{staff.member.userEmail}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span>
              {staff.usesBusinessHours
                ? "İşletme çalışma saatlerini kullanıyor"
                : "Özel çalışma saatleri kullanıyor"}
            </span>
            <span className="text-muted-foreground/60">•</span>
            <span className="font-mono text-[11px]">{businessTimezone}</span>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMsg && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>İşlem Başarısız</AlertTitle>
          <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert className="border-emerald-500 text-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Başarılı</AlertTitle>
          <AlertDescription className="text-xs">{successMsg}</AlertDescription>
        </Alert>
      )}

      {/* 1. Booking Readiness Card */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Randevu Uygunluğu</CardTitle>
            </div>
            <Badge
              variant="outline"
              className={
                readiness.isReady
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 text-xs px-2 py-0.5"
                  : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 text-xs px-2 py-0.5"
              }
            >
              {readiness.isReady ? "Randevuya Hazır" : "Randevuya Hazır Değil"}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            {readiness.isReady
              ? "Bu personel tüm randevu gereksinimlerini karşılamaktadır ve müşteriler tarafından seçilebilir."
              : "Personelin randevuya açılabilmesi için aşağıdaki eksikliklerin tamamlanması gerekmektedir:"}
          </CardDescription>
        </CardHeader>
        {!readiness.isReady && readiness.reasons.length > 0 && (
          <CardContent className="pt-0">
            <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/30 p-2.5 rounded-md border border-amber-200/60 dark:border-amber-900/40">
              {readiness.reasons.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-amber-600">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>

      {/* 2. Public Booking Toggle Card */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Herkese Açık Randevu
              </CardTitle>
              <CardDescription className="text-xs">
                Müşterilerin bu personel için online randevu almasına izin ver.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isTogglingBooking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={staff.publicBookingEnabled}
                onCheckedChange={(checked) => handleTogglePublicBooking(Boolean(checked))}
                disabled={isTogglingBooking}
                aria-label="Herkese açık randevu toggle"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-[11px] text-muted-foreground">
            {staff.publicBookingEnabled
              ? "Açık: Personel internet üzerinden randevu alımlarına açıktır."
              : "Kapalı: Personel internet randevularında müşterilere sunulmaz."}
          </p>
        </CardContent>
      </Card>

      {/* 3. Working Hours Card (Mode Selection & Schedule Management) */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Çalışma Saatleri
              </CardTitle>
              <CardDescription className="text-xs">
                Personelin randevu kabul edeceği haftalık takvim modunu seçin ve yapılandırın.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Switcher Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSwitchScheduleMode(true)}
              disabled={isUpdatingMode}
              className={cn(
                "flex flex-col text-left p-3 rounded-lg border transition-all min-h-[56px] cursor-pointer",
                staff.usesBusinessHours
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                  : "border-border hover:bg-muted/40 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <Building2
                  className={cn(
                    "h-4 w-4 shrink-0",
                    staff.usesBusinessHours ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="text-xs font-semibold text-foreground">
                  İşletme Çalışma Saatleri
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1">
                İşletmenin haftalık takvimini devralır
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchScheduleMode(false)}
              disabled={isUpdatingMode}
              className={cn(
                "flex flex-col text-left p-3 rounded-lg border transition-all min-h-[56px] cursor-pointer",
                !staff.usesBusinessHours
                  ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                  : "border-border hover:bg-muted/40 text-muted-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                <UserCheck
                  className={cn(
                    "h-4 w-4 shrink-0",
                    !staff.usesBusinessHours ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="text-xs font-semibold text-foreground">
                  Özel Çalışma Saatleri
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1">
                Personele özgü haftalık takvim tanımlanır
              </span>
            </button>
          </div>

          {isUpdatingMode && (
            <div className="flex items-center justify-center py-2 text-xs text-muted-foreground gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Çalışma saatleri modu güncelleniyor...</span>
            </div>
          )}

          {/* Mode A: Inherited Business Hours View */}
          {staff.usesBusinessHours ? (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Devralınan İşletme Takvimi
                </span>
                <Badge variant="outline" className="text-[11px]">
                  Aktif Takvim
                </Badge>
              </div>

              {businessWorkingHours.length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-md border border-amber-200">
                  İşletmenin çalışma saatleri henüz tanımlanmamış. İşletme Ayarları bölümünden tanımlayabilirsiniz.
                </p>
              ) : (
                <div className="space-y-1 rounded-lg border bg-muted/20 p-3">
                  {ORDERED_DAYS.map((dayDef) => {
                    const bwh = businessWorkingHours.find((h) => h.dayOfWeek === dayDef.dayOfWeek);
                    const isOpen = bwh && !bwh.isClosed && bwh.startTime && bwh.endTime;
                    return (
                      <div
                        key={dayDef.dayOfWeek}
                        className="flex items-center justify-between text-xs py-1.5 px-1 border-b border-border/30 last:border-0"
                      >
                        <span className="font-medium text-foreground">{dayDef.name}</span>
                        {isOpen ? (
                          <span className="text-muted-foreground font-mono">
                            {bwh.startTime?.slice(0, 5)} - {bwh.endTime?.slice(0, 5)}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Kapalı
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Bu personel işletmenin genel çalışma saatlerine tabidir. Personele özel saatler belirlemek için yukarıdan &quot;Özel Çalışma Saatleri&quot; modunu seçebilirsiniz.
              </p>
            </div>
          ) : (
            /* Mode B: Custom Working Hours 7-Day Editor */
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Özel Haftalık Takvim
                </span>
                <Badge variant="default" className="text-[11px] bg-primary">
                  Özel Mod Aktif
                </Badge>
              </div>

              <div className="space-y-2.5">
                {customSchedule.map((day) => (
                  <div
                    key={day.dayOfWeek}
                    className="p-3.5 rounded-lg border border-border/60 bg-card text-card-foreground shadow-xs transition-colors"
                  >
                    <div className="flex items-center justify-between min-h-[44px]">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm text-foreground">
                          {day.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {day.isWorking ? "Çalışıyor (Açık)" : "Çalışmıyor (Kapalı)"}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 min-h-[44px]">
                        <label
                          htmlFor={`staff-toggle-${day.dayOfWeek}`}
                          className="text-xs font-medium cursor-pointer select-none"
                        >
                          {day.isWorking ? "Açık" : "Kapalı"}
                        </label>
                        <Switch
                          id={`staff-toggle-${day.dayOfWeek}`}
                          checked={day.isWorking}
                          onCheckedChange={(checked) =>
                            handleToggleWorkingDay(day.dayOfWeek, checked)
                          }
                          disabled={isSavingHours}
                          aria-label={`${day.name} açık/kapalı`}
                        />
                      </div>
                    </div>

                    {day.isWorking && (
                      <div className="grid grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-border/40">
                        <div className="space-y-1">
                          <label
                            htmlFor={`staff-start-${day.dayOfWeek}`}
                            className="text-[11px] font-medium text-muted-foreground"
                          >
                            Başlangıç Saati
                          </label>
                          <Input
                            id={`staff-start-${day.dayOfWeek}`}
                            type="time"
                            value={day.startTime}
                            onChange={(e) =>
                              handleTimeChange(day.dayOfWeek, "startTime", e.target.value)
                            }
                            className="h-11 text-center font-medium"
                            required
                            disabled={isSavingHours}
                          />
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor={`staff-end-${day.dayOfWeek}`}
                            className="text-[11px] font-medium text-muted-foreground"
                          >
                            Bitiş Saati
                          </label>
                          <Input
                            id={`staff-end-${day.dayOfWeek}`}
                            type="time"
                            value={day.endTime}
                            onChange={(e) =>
                              handleTimeChange(day.dayOfWeek, "endTime", e.target.value)
                            }
                            className="h-11 text-center font-medium"
                            required
                            disabled={isSavingHours}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Save Button for Custom Hours */}
              <div className="pt-2">
                <Button
                  onClick={handleSaveCustomHours}
                  disabled={isSavingHours}
                  className="w-full h-11 min-h-[44px] text-sm font-medium"
                >
                  {isSavingHours ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      <span>Özel Saatleri Kaydet</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Time Off / Break / Block Management Card (Müsait Olmadığı Zamanlar) */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-primary" />
                Müsait Olmadığı Zamanlar
              </CardTitle>
              <CardDescription className="text-xs">
                İzinler, molalar ve randevu dışı meşguliyet aralıkları.
              </CardDescription>
            </div>
            {!isBlockFormOpen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleOpenCreateBlock}
                className="h-9 px-2.5 text-xs gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Yeni Blok</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create / Edit Form */}
          {isBlockFormOpen && (
            <Card className="border border-primary/30 bg-muted/10 p-3.5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-xs font-semibold text-foreground">
                  {editingBlockId ? "Zaman Bloğunu Düzenle" : "Yeni Zaman Bloğu Ekle"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelBlockForm}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {blockFormError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs ml-1.5">{blockFormError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                {/* Block Type Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Blok Türü</label>
                    <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setBlockFormData((p) => ({ ...p, blockType: "TIME_OFF" }))}
                      className={cn(
                        "h-10 px-1 rounded-md border text-xs font-medium transition-colors cursor-pointer",
                        blockFormData.blockType === "TIME_OFF"
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary"
                          : "border-border hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      İzin
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlockFormData((p) => ({ ...p, blockType: "BREAK" }))}
                      className={cn(
                        "h-10 px-1 rounded-md border text-xs font-medium transition-colors cursor-pointer",
                        blockFormData.blockType === "BREAK"
                          ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold ring-1 ring-amber-500"
                          : "border-border hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      Mola
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlockFormData((p) => ({ ...p, blockType: "BLOCKED" }))}
                      className={cn(
                        "h-10 px-1 rounded-md border text-xs font-medium transition-colors cursor-pointer",
                        blockFormData.blockType === "BLOCKED"
                          ? "border-slate-500 bg-slate-500/10 text-slate-700 dark:text-slate-300 font-semibold ring-1 ring-slate-500"
                          : "border-border hover:bg-muted/40 text-muted-foreground"
                      )}
                    >
                      Kapalı Zaman
                    </button>
                  </div>
                </div>

                {/* Start Date and Time */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Başlangıç Tarihi
                    </label>
                    <Input
                      type="date"
                      value={blockFormData.startDate}
                      onChange={(e) =>
                        setBlockFormData((p) => ({ ...p, startDate: e.target.value }))
                      }
                      className="h-11 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Başlangıç Saati
                    </label>
                    <Input
                      type="time"
                      value={blockFormData.startTime}
                      onChange={(e) =>
                        setBlockFormData((p) => ({ ...p, startTime: e.target.value }))
                      }
                      className="h-11 text-center font-medium"
                      required
                    />
                  </div>
                </div>

                {/* End Date and Time */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Bitiş Tarihi
                    </label>
                    <Input
                      type="date"
                      value={blockFormData.endDate}
                      onChange={(e) =>
                        setBlockFormData((p) => ({ ...p, endDate: e.target.value }))
                      }
                      className="h-11 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Bitiş Saati
                    </label>
                    <Input
                      type="time"
                      value={blockFormData.endTime}
                      onChange={(e) =>
                        setBlockFormData((p) => ({ ...p, endTime: e.target.value }))
                      }
                      className="h-11 text-center font-medium"
                      required
                    />
                  </div>
                </div>

                {/* Reason / Note */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Açıklama / Not (Opsiyonel)
                  </label>
                  <Input
                    type="text"
                    placeholder="Örn: Yıllık izin, doktor randevusu, öğle arası"
                    value={blockFormData.reason}
                    onChange={(e) =>
                      setBlockFormData((p) => ({ ...p, reason: e.target.value }))
                    }
                    className="h-11 text-xs"
                    maxLength={500}
                  />
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-2 pt-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelBlockForm}
                    disabled={isSavingBlock}
                    className="flex-1 h-11 text-xs"
                  >
                    Vazgeç
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveBlock}
                    disabled={isSavingBlock}
                    className="flex-1 h-11 text-xs font-medium"
                  >
                    {isSavingBlock ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        <span>Kaydediliyor...</span>
                      </>
                    ) : (
                      <span>{editingBlockId ? "Güncelle" : "Kaydet"}</span>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Time Block List */}
          {sortedBlocks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">
              Tanımlı bir izin, mola veya meşguliyet bloğu bulunmuyor.
            </p>
          ) : (
            <div className="space-y-2.5">
              {sortedBlocks.map((block) => (
                <div
                  key={block.id}
                  className={cn(
                    "p-3 rounded-lg border text-card-foreground shadow-xs transition-colors flex flex-col gap-2",
                    block.status === "PAST"
                      ? "bg-muted/30 border-border/50 opacity-70"
                      : block.status === "ACTIVE"
                      ? "bg-emerald-50/40 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900"
                      : "bg-card border-border/70"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Type badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-semibold",
                          block.blockType === "TIME_OFF"
                            ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : block.blockType === "BREAK"
                            ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        )}
                      >
                        {getTimeBlockTypeLabel(block.blockType)}
                      </Badge>

                      {/* Status badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          block.status === "ACTIVE"
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : block.status === "UPCOMING"
                            ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                            : "border-muted-foreground/30 text-muted-foreground"
                        )}
                      >
                        {getTimeBlockStatusLabel(block.status)}
                      </Badge>
                    </div>

                    {/* Actions: Edit / Delete for Active & Upcoming, or Read-only for Past */}
                    {block.status !== "PAST" ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEditBlock(block)}
                          disabled={isSavingBlock || deletingBlockId === block.id}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                          aria-label="Bloku Düzenle"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteBlock(block.id)}
                          disabled={isSavingBlock || deletingBlockId === block.id}
                          className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          aria-label="Bloku Sil"
                        >
                          {deletingBlockId === block.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">
                        Geçmiş (Salt Okunur)
                      </span>
                    )}
                  </div>

                  {/* Date/Time display in business timezone */}
                  <div className="text-xs font-medium text-foreground">
                    <span>{block.startFormatted.displayStr}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span>{block.endFormatted.displayStr}</span>
                  </div>

                  {/* Reason / Note if present */}
                  {block.reason && (
                    <p className="text-[11px] text-muted-foreground italic bg-muted/30 px-2 py-1 rounded">
                      {block.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Service Assignment Card */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Scissors className="h-4 w-4 text-primary" />
                Hizmet Atamaları
              </CardTitle>
              <CardDescription className="text-xs">
                Bu personelin verebileceği hizmetleri seçin.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {selectedServiceIds.size} Seçili
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Services List */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aktif Hizmetler ({availableActiveServices.length})
            </h3>

            {availableActiveServices.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 italic">
                İşletmede tanımlı aktif hizmet bulunmuyor. Hizmetler sayfasından hizmet ekleyebilirsiniz.
              </p>
            ) : (
              <div className="space-y-2">
                {availableActiveServices.map((svc) => {
                  const isChecked = selectedServiceIds.has(svc.id);
                  return (
                    <label
                      key={svc.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer min-h-[48px]",
                        isChecked
                          ? "bg-primary/5 border-primary/40 dark:bg-primary/10"
                          : "bg-card hover:bg-muted/40 border-border"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleService(svc.id)}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground leading-tight">
                            {svc.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {svc.durationMinutes} dk
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {formatCurrency(svc.price)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legacy Inactive Services (if any) */}
          {inactiveAssignedServices.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Eski / Pasif Hizmetler ({inactiveAssignedServices.length})
                </h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Bu hizmetler daha önce atanmış ancak şu an işletmede pasife alınmıştır. Randevu uygunluğuna etki etmezler. Kaldırmak için seçimi kaldırabilirsiniz.
              </p>

              <div className="space-y-2">
                {inactiveAssignedServices.map((svc) => {
                  const isChecked = selectedServiceIds.has(svc.id);
                  return (
                    <label
                      key={svc.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer min-h-[48px]",
                        isChecked
                          ? "bg-amber-50/60 border-amber-300 dark:bg-amber-950/20 dark:border-amber-900/50"
                          : "bg-muted/30 border-dashed border-border opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => handleToggleService(svc.id)}
                        />
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground line-through opacity-80 leading-tight">
                              {svc.name}
                            </span>
                            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                              Pasif
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {svc.durationMinutes} dk
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatCurrency(svc.price)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save Button for Services */}
          <div className="pt-2">
            <Button
              onClick={handleSaveServices}
              disabled={isSavingServices}
              className="w-full h-11 min-h-[44px] text-sm font-medium"
            >
              {isSavingServices ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  <span>Hizmetleri Kaydet</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
