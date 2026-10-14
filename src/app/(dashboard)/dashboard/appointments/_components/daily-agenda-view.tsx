"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FormattedDashboardAppointment } from "@/services/dashboard-appointments.service";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Phone, Loader2 } from "lucide-react";
import { completeAppointmentAction, markAppointmentNoShowAction, cancelAppointmentAction } from "@/actions/appointment-status.actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAppointmentStatusLabel, formatCurrency } from "@/lib/presentation";

interface DailyAgendaViewProps {
  appointments: FormattedDashboardAppointment[];
  selectedDate: string;
  staffList: { id: string; name: string }[];
  role: string;
  selectedStaffFilter?: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  CONFIRMED: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  COMPLETED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  NO_SHOW: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 border-zinc-500/30",
};

export function DailyAgendaView({
  appointments,
  selectedDate,
  staffList,
  role,
  selectedStaffFilter
}: DailyAgendaViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(t);
  }, []);

  const handleAction = async (id: string, actionType: "COMPLETE" | "NO_SHOW" | "CANCEL") => {
    if (actionType === "CANCEL") {
      if (!window.confirm("Bu randevuyu iptal etmek istediğinize emin misiniz?")) return;
    }
    if (actionType === "NO_SHOW") {
      if (!window.confirm("Müşterinin gelmediğini onaylıyor musunuz?")) return;
    }

    setLoadingId(id);
    try {
      let res;
      if (actionType === "COMPLETE") res = await completeAppointmentAction(id);
      else if (actionType === "NO_SHOW") res = await markAppointmentNoShowAction(id);
      else if (actionType === "CANCEL") res = await cancelAppointmentAction(id);

      if (res?.error) {
        alert(res.error);
      }
    } catch {
      alert("Bir hata oluştu.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDateChange = (days: number) => {
    const d = new Date(selectedDate);
    d.setUTCDate(d.getUTCDate() + days);
    const newDateStr = d.toISOString().split("T")[0];
    updateParams({ date: newDateStr });
  };

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    router.push(`/dashboard/appointments?${params.toString()}`);
  };

  const displayDate = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long"
  }).format(new Date(selectedDate));

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Randevu Ajandası</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Günlük randevu akışını, durumları ve personel atamalarını yönetin.
          </p>
        </div>
        <Link href="/dashboard/appointments/new" className={cn(buttonVariants({ size: "sm" }), "shadow-xs font-semibold gap-1.5")}>
          Randevu Ekle
        </Link>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-card p-2 rounded-xl shadow-2xs border border-border">
        <div className="flex items-center justify-between w-full md:w-auto md:flex-1 px-2">
          <Button variant="ghost" size="icon" onClick={() => handleDateChange(-1)} aria-label="Önceki Gün">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="text-sm font-semibold text-foreground text-center px-4 capitalize">
            {displayDate}
          </div>
          <Button variant="ghost" size="icon" onClick={() => handleDateChange(1)} aria-label="Sonraki Gün">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
        
        {(role === "OWNER" || role === "MANAGER") && (
          <div className="w-full md:w-64 shrink-0 px-2 md:px-0 md:pr-2">
            <select
              className="w-full bg-background p-2 text-sm border-border border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
              value={selectedStaffFilter || "all"}
              onChange={(e) => updateParams({ staff: e.target.value === "all" ? null : e.target.value })}
            >
              <option value="all">Tüm Personel</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-2">
        {appointments.length === 0 ? (
          <div className="col-span-full text-center text-muted-foreground p-12 bg-card rounded-2xl border border-dashed border-border flex flex-col items-center justify-center">
            <p className="text-base font-semibold text-foreground">{selectedStaffFilter ? "Bu personelin bu tarihte randevusu bulunmuyor." : "Bu tarihte randevu bulunmuyor."}</p>
            <p className="text-xs text-muted-foreground mt-1">Farklı bir tarih seçebilir veya yeni bir randevu oluşturabilirsiniz.</p>
          </div>
        ) : (
          appointments.map((app) => (
            <Card key={app.id} className="overflow-hidden border-border/60 shadow-sm hover:shadow-md transition-shadow">
              <div className="border-l-4 border-l-primary h-full flex flex-col">
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex justify-between items-start gap-4">
                    <div className="font-bold text-lg text-foreground flex items-center gap-2">
                      <span className="tabular-nums font-mono">{app.localStartTime}</span>
                      <span className="text-muted-foreground font-sans font-normal text-sm">–</span>
                      <span className="tabular-nums font-mono text-muted-foreground">{app.localEndTime}</span>
                    </div>
                    <Badge variant="secondary" className={cn(STATUS_COLORS[app.status] || "", "text-xs px-2 py-0.5 whitespace-nowrap")}>
                      {getAppointmentStatusLabel(app.status)}
                    </Badge>
                  </div>
                  
                  <div className="mt-2">
                    <div className="font-semibold text-base text-foreground">
                      {app.customer.firstName} {app.customer.lastName || ""}
                    </div>
                    <a href={`tel:${app.customer.phone}`} className="text-sm text-blue-600 flex items-center gap-1.5 mt-1 hover:underline">
                      <Phone className="w-3.5 h-3.5" />
                      {app.customer.phone}
                    </a>
                  </div>

                  <div className="text-sm text-muted-foreground mt-auto pt-4 flex flex-col gap-1 border-t border-border/50">
                    <div className="font-medium text-foreground">
                      {app.service.nameSnapshot} 
                      <span className="text-muted-foreground font-normal ml-1">
                        ({app.service.durationSnapshot} dk • {formatCurrency(app.service.priceSnapshot)})
                      </span>
                    </div>
                    {(role === "OWNER" || role === "MANAGER") && app.staff.displayName && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Personel:</span>
                        <span className="text-foreground">{app.staff.displayName}</span>
                      </div>
                    )}
                  </div>

                  {app.status === "CONFIRMED" || app.status === "PENDING" ? (
                    <div className="flex flex-wrap justify-end gap-2 mt-4 pt-3">
                      {now !== null && new Date(app.startAt).getTime() > now && (
                        <>
                          <Link href={`/dashboard/appointments/${app.id}/reschedule`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8")}>
                            Yeniden Planla
                          </Link>
                          {(role === "OWNER" || role === "MANAGER") && (
                            <Link href={`/dashboard/appointments/${app.id}/reassign`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs h-8")}>
                              Personel Değiştir
                            </Link>
                          )}
                        </>
                      )}

                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="text-xs h-8"
                        disabled={loadingId === app.id}
                        onClick={() => handleAction(app.id, "CANCEL")}
                      >
                        {loadingId === app.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        İptal Et
                      </Button>
                      
                      {app.status === "CONFIRMED" && now !== null && new Date(app.startAt).getTime() <= now && (
                        <>
                          <Button 
                            variant="secondary" 
                            size="sm"
                            className="text-xs h-8 bg-zinc-200 hover:bg-zinc-300 text-zinc-900"
                            disabled={loadingId === app.id}
                            onClick={() => handleAction(app.id, "NO_SHOW")}
                          >
                            {loadingId === app.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                            Gelmedi
                          </Button>
                          <Button 
                            variant="default" 
                            size="sm"
                            className="text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
                            disabled={loadingId === app.id}
                            onClick={() => handleAction(app.id, "COMPLETE")}
                          >
                            {loadingId === app.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                            Tamamlandı
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
