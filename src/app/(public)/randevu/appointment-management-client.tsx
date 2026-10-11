"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  ReceiptText,
  Scissors,
  TriangleAlert,
  UserRound,
  XCircle,
} from "lucide-react";
import {
  cancelAppointmentAccessAction,
  resolveAppointmentAccessAction,
} from "@/actions/appointment-access.actions";
import { StatusBadge } from "@/components/common/status-badge";
import { InvalidAppointmentLink } from "@/components/public/invalid-appointment-link";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const tokenRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [isPending, startTransition] = useTransition();
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
    tokenRef.current = rawToken || null;

    void resolveAppointmentAccessAction(rawToken).then((result) => {
      if (!result.success) tokenRef.current = null;
      setState(
        result.success
          ? { status: "ready", appointment: result.data }
          : { status: "invalid" }
      );
    });
  }, []);

  function submitCancellation() {
    const rawToken = tokenRef.current;
    if (!rawToken || isPending) return;

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await cancelAppointmentAccessAction(rawToken);
        if (result.success) {
          setState({ status: "ready", appointment: result.data });
          setFeedback({ kind: "success", message: result.message });
          setDialogOpen(false);
          return;
        }

        if (result.type === "NOT_CANCELLABLE") {
          setState({ status: "ready", appointment: result.data });
          setFeedback({ kind: "error", message: result.message });
          setDialogOpen(false);
          return;
        }

        tokenRef.current = null;
        setState({ status: "invalid" });
        setDialogOpen(false);
      } catch {
        setFeedback({
          kind: "error",
          message: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
        });
        setDialogOpen(false);
      }
    });
  }

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

        {feedback && (
          <div
            className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${
              feedback.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
            role={feedback.kind === "success" ? "status" : "alert"}
            aria-live={feedback.kind === "success" ? "polite" : "assertive"}
          >
            {feedback.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <p className="font-medium">{feedback.message}</p>
          </div>
        )}

        {appointment.canCancel && (
          <div className="mt-5 flex justify-center">
            <Button
              type="button"
              variant="destructive"
              className="h-11 w-full sm:w-auto sm:min-w-52"
              onClick={() => setDialogOpen(true)}
              disabled={isPending}
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Randevuyu İptal Et
            </Button>
          </div>
        )}

        <p className="mx-auto mt-5 max-w-lg text-center text-xs leading-5 text-muted-foreground sm:text-sm">
          Bu bağlantı randevunuza özeldir. Güvenliğiniz için başkalarıyla paylaşmayın.
        </p>
      </div>

      <AlertDialog.Root
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isPending) setDialogOpen(open);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup
              className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:p-6"
              data-testid="cancellation-confirmation"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <XCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <AlertDialog.Title className="text-lg font-semibold text-foreground">
                    Randevu iptal edilsin mi?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Bu randevuyu iptal etmek istediğinizden emin misiniz?
                  </AlertDialog.Description>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Close
                  disabled={isPending}
                  className={buttonVariants({
                    variant: "outline",
                    className: "h-11",
                  })}
                >
                  Vazgeç
                </AlertDialog.Close>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11"
                  onClick={submitCancellation}
                  disabled={isPending}
                  aria-busy={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      İptal Ediliyor...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      Randevuyu İptal Et
                    </>
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </main>
  );
}
