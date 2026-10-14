import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Phone, Calendar as CalendarIcon, Clock, CheckCircle2, Link2 } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getCustomerDetailAction } from "@/actions/customer.actions";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";
import { getAppointmentStatusLabel, getAppointmentSourceLabel, formatCurrency } from "@/lib/presentation";
import { Badge } from "@/components/ui/badge";
import { EditCustomerForm } from "./edit-customer-form";
import { CustomerNotes } from "./customer-notes";
import { getCustomerNotesAction } from "@/actions/customer.actions";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ merged?: string }>;
}) {
  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: STAFF is strictly forbidden
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const { customerId } = await params;
  const result = await getCustomerDetailAction(customerId, currentMembership.business_id);

  if (!result.success) {
    if (result.error === "Müşteri bulunamadı.") {
      notFound();
    }
    return (
      <div className="p-6 text-center text-red-500">
        Hata: {result.error}
      </div>
    );
  }

  if (result.customer.id !== customerId) {
    redirect(`/dashboard/customers/${result.customer.id}`);
  }

  const { customer, stats, history, lineage } = result;
  const showMergeSuccess = (await searchParams).merged === "1";
  
  const notesResult = await getCustomerNotesAction(customerId);
  const notes = notesResult.success ? notesResult.notes : [];

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Top navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <Link
          href="/dashboard/customers"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Müşterilere Dön</span>
        </Link>
      </div>

      {showMergeSuccess && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Müşteri kayıtları birleştirildi.
        </div>
      )}

      {/* Header Profile */}
      <div className="bg-card border border-border shadow-xs rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0 border border-primary/20">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {customer.firstName} {customer.lastName || ""}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-4 w-4" />
                  <span className="font-mono">{customer.phone}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <EditCustomerForm customerId={customer.id} initialData={{ firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone }} />
          </div>
        </div>
      </div>

      {lineage.length > 0 && (
        <section
          aria-labelledby="merged-records-heading"
          className="rounded-xl border border-border bg-card p-5 shadow-xs sm:p-6"
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h2 id="merged-records-heading" className="font-semibold text-foreground">
                Birleştirilen Kayıtlar
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Bu eski kimlikler korunur; randevu ve not geçmişleri yukarıdaki
                birincil müşteri altında birlikte gösterilir.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border/60 rounded-lg border border-border/70">
            {lineage.map((alias, index) => (
              <div
                key={`${alias.phone}-${alias.mergedAt?.toISOString() ?? index}`}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {alias.firstName} {alias.lastName || ""}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {alias.phone}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="block font-medium text-foreground">Birleştirme tarihi</span>
                  {alias.mergedAt
                    ? new Intl.DateTimeFormat("tr-TR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(alias.mergedAt)
                    : "—"}
                </div>
                {alias.mergedByName && (
                  <div className="text-xs text-muted-foreground sm:text-right">
                    <span className="block font-medium text-foreground">Birleştiren</span>
                    {alias.mergedByName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      
      {/* Customer Notes */}
      <div className="bg-card border border-border shadow-xs rounded-xl p-6">
        <CustomerNotes customerId={customer.id} initialNotes={notes} />
      </div>

      {/* Operational Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border shadow-xs rounded-xl p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Toplam Randevu
          </h3>
          <p className="text-2xl font-bold font-mono">{stats.appointmentCount}</p>
        </div>
        
        <div className="bg-card border border-border shadow-xs rounded-xl p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            İptal / Gelmedi
          </h3>
          <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats.cancelledCount}
          </p>
        </div>

        <div className="bg-card border border-border shadow-xs rounded-xl p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Son Randevu
          </h3>
          <p className="text-sm font-medium">
            {stats.lastAppointmentDate ? (
              formatInstantInBusinessTimezone(new Date(stats.lastAppointmentDate), "Europe/Istanbul").dateStr
            ) : "—"}
          </p>
        </div>

        <div className="bg-card border border-border shadow-xs rounded-xl p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Yaklaşan Randevu
          </h3>
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {stats.nextAppointmentDate ? (
              formatInstantInBusinessTimezone(new Date(stats.nextAppointmentDate), "Europe/Istanbul").displayStr
            ) : "—"}
          </p>
        </div>
      </div>

      {/* Appointment History */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Randevu Geçmişi</h2>

        {(!history || history.length === 0) ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-muted/10">
            <CalendarIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-medium text-foreground mb-1">Randevu bulunamadı.</h3>
            <p className="text-xs text-muted-foreground">Müşterinin henüz randevu kaydı yok.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Tarih</th>
                    <th className="py-3 px-4 font-semibold">Hizmet</th>
                    <th className="py-3 px-4 font-semibold">Personel</th>
                    <th className="py-3 px-4 font-semibold">Tutar</th>
                    <th className="py-3 px-4 font-semibold">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {history.map((apt) => {
                    const isUpcoming = apt.startTime > new Date() && apt.status !== "CANCELLED" && apt.status !== "NO_SHOW";
                    return (
                      <tr key={apt.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {isUpcoming ? (
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-[10px]">
                                YAKLAŞAN
                              </Badge>
                            ) : null}
                            <span className="font-medium">
                              {formatInstantInBusinessTimezone(new Date(apt.startTime), "Europe/Istanbul").dateStr}
                            </span>
                            <span className="text-muted-foreground ml-1">
                              {formatInstantInBusinessTimezone(new Date(apt.startTime), "Europe/Istanbul").timeStr}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-medium">{apt.serviceNameSnapshot}</span>
                          <span className="text-xs text-muted-foreground ml-2">({apt.serviceDurationSnapshot} dk)</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          {apt.staff.firstName} {apt.staff.lastName || ""}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {formatCurrency(apt.servicePriceSnapshot)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] font-medium ${
                              apt.status === "CONFIRMED" ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:bg-emerald-950/20" :
                              apt.status === "COMPLETED" ? "border-slate-200 text-slate-700 bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:bg-slate-900/50" :
                              apt.status === "CANCELLED" || apt.status === "NO_SHOW" ? "border-red-200 text-red-700 bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:bg-red-950/20" :
                              "text-muted-foreground"
                            }`}
                          >
                            {getAppointmentStatusLabel(apt.status)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border/60">
              {history.map((apt) => {
                const isUpcoming = apt.startTime > new Date() && apt.status !== "CANCELLED" && apt.status !== "NO_SHOW";
                return (
                  <div key={apt.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base">
                            {formatInstantInBusinessTimezone(new Date(apt.startTime), "Europe/Istanbul").dateStr}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {formatInstantInBusinessTimezone(new Date(apt.startTime), "Europe/Istanbul").timeStr}
                          </span>
                          {isUpcoming && (
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-[9px] px-1.5">
                              YAKLAŞAN
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium">{apt.serviceNameSnapshot}</p>
                      </div>
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] font-medium shrink-0 ${
                          apt.status === "CONFIRMED" ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-400 dark:bg-emerald-950/20" :
                          apt.status === "COMPLETED" ? "border-slate-200 text-slate-700 bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:bg-slate-900/50" :
                          apt.status === "CANCELLED" || apt.status === "NO_SHOW" ? "border-red-200 text-red-700 bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:bg-red-950/20" :
                          "text-muted-foreground"
                        }`}
                      >
                        {getAppointmentStatusLabel(apt.status)}
                      </Badge>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/50">
                      <div>
                        <span className="uppercase tracking-wider text-[9px] font-semibold block mb-0.5 opacity-70">Personel</span>
                        <span className="font-medium text-foreground">{apt.staff.firstName} {apt.staff.lastName || ""}</span>
                      </div>
                      <div>
                        <span className="uppercase tracking-wider text-[9px] font-semibold block mb-0.5 opacity-70">Tutar</span>
                        <span className="font-mono">{formatCurrency(apt.servicePriceSnapshot)}</span>
                      </div>
                      <div>
                        <span className="uppercase tracking-wider text-[9px] font-semibold block mb-0.5 opacity-70">Süre</span>
                        <span className="font-mono">{apt.serviceDurationSnapshot} dk</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
