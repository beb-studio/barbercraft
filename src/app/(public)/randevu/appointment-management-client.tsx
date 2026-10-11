"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  CalendarDays,
  Clock3,
  Loader2,
  ReceiptText,
  Scissors,
  UserRound,
} from "lucide-react";
import { resolveAppointmentAccessAction } from "@/actions/appointment-access.actions";
import { StatusBadge } from "@/components/common/status-badge";
import { InvalidAppointmentLink } from "@/components/public/invalid-appointment-link";
import { formatCurrency } from "@/lib/presentation";
import type { AppointmentManagementView } from "@/services/appointment-access.service";

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/70 py-4 last:border-b-0">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-1 break-words text-sm font-semibold text-foreground sm:text-base">
          {value}
        </dd>
      </div>
    </div>
  );
}

export function AppointmentManagementClient() {
  const started = useRef(false);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "invalid" }
    | { status: "ready"; appointment: AppointmentManagementView }
  >({ status: "loading" });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const rawToken = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);

    void resolveAppointmentAccessAction(rawToken).then((result) => {
      setState(
        result.success
          ? { status: "ready", appointment: result.data }
          : { status: "invalid" }
      );
    });
  }, []);

  if (state.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="text-center" role="status" aria-live="polite">
          <Loader2
            className="mx-auto h-7 w-7 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Randevu bilgileri yükleniyor...
          </p>
        </div>
      </main>
    );
  }

  if (state.status === "invalid") {
    return <InvalidAppointmentLink />;
  }

  const { appointment } = state;
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            BarberCraft
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Randevunuz
          </h1>
          <div className="mt-4 flex justify-center">
            <StatusBadge status={appointment.status} />
          </div>
        </header>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <h2 className="text-base font-semibold text-foreground">
            Randevu Bilgileri
          </h2>
          <dl className="mt-3">
            <DetailRow
              icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              label="İşletme"
              value={appointment.businessName}
            />
            <DetailRow
              icon={<Scissors className="h-4 w-4" aria-hidden="true" />}
              label="Hizmet"
              value={appointment.serviceName}
            />
            <DetailRow
              icon={<UserRound className="h-4 w-4" aria-hidden="true" />}
              label="Personel"
              value={appointment.staffDisplayName}
            />
            <DetailRow
              icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
              label="Tarih"
              value={appointment.dateLabel}
            />
            <DetailRow
              icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
              label="Saat ve Süre"
              value={`${appointment.localStartTime} - ${appointment.localEndTime} · ${appointment.durationMinutes} dakika`}
            />
            <DetailRow
              icon={<ReceiptText className="h-4 w-4" aria-hidden="true" />}
              label="Tutar"
              value={formatCurrency(appointment.price, appointment.currency)}
            />
          </dl>
        </section>

        <p className="mx-auto mt-5 max-w-lg text-center text-xs leading-5 text-muted-foreground sm:text-sm">
          Bu bağlantı randevunuza özeldir. Güvenliğiniz için başkalarıyla paylaşmayın.
        </p>
      </div>
    </main>
  );
}
