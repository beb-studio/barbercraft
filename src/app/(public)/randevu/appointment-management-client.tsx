"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { addDays, format, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarClock,
  Check,
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
  getAppointmentRescheduleAvailabilityAction,
  rescheduleAppointmentAccessAction,
  resolveAppointmentAccessAction,
} from "@/actions/appointment-access.actions";
import { StatusBadge } from "@/components/common/status-badge";
import { InvalidAppointmentLink } from "@/components/public/invalid-appointment-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatCurrency } from "@/lib/presentation";
import type {
  AppointmentManagementView,
  AppointmentRescheduleSlot,
} from "@/services/appointment-access.service";
import { cn } from "@/lib/utils";

function formatLocalDate(localDate: string): string {
  const parsed = parseISO(localDate);
  return Number.isNaN(parsed.getTime())
    ? localDate
    : format(parsed, "d MMMM yyyy, EEEE", { locale: tr });
}

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
  const availabilityRequestId = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<AppointmentRescheduleSlot[]>([]);
  const [selectedSlot, setSelectedSlot] =
    useState<AppointmentRescheduleSlot | null>(null);
  const [availabilityState, setAvailabilityState] = useState<
    | { status: "idle" | "loading" }
    | { status: "ready"; message?: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [feedback, setFeedback] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);
  const [isCancelling, startCancellation] = useTransition();
  const [isRescheduling, startRescheduling] = useTransition();
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
    if (!rawToken || isCancelling || isRescheduling) return;

    setFeedback(null);
    startCancellation(async () => {
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

  async function loadAvailability(localDate: string) {
    const rawToken = tokenRef.current;
    if (!rawToken) return;

    const requestId = ++availabilityRequestId.current;
    setSelectedDate(localDate);
    setSelectedSlot(null);
    setSlots([]);
    setAvailabilityState({ status: "loading" });

    const result = await getAppointmentRescheduleAvailabilityAction(
      rawToken,
      localDate
    );
    if (availabilityRequestId.current !== requestId) return;

    if (result.success) {
      setState({ status: "ready", appointment: result.data.appointment });
      setSlots(result.data.slots);
      setAvailabilityState({
        status: "ready",
        message:
          result.data.reason === "CLOSED"
            ? "Personel bu tarihte çalışmıyor."
            : result.data.reason === "NO_AVAILABLE_SLOTS"
              ? "Bu tarihte uygun saat bulunmuyor."
              : undefined,
      });
      return;
    }

    if (result.type === "INVALID_CAPABILITY") {
      tokenRef.current = null;
      setState({ status: "invalid" });
      return;
    }

    if (result.data) {
      setState({ status: "ready", appointment: result.data });
    }
    setAvailabilityState({ status: "error", message: result.message });
    if (
      result.type === "NOT_RESCHEDULABLE" ||
      result.type === "ONLINE_UNAVAILABLE"
    ) {
      setRescheduleOpen(false);
      setFeedback({ kind: "error", message: result.message });
    }
  }

  function openReschedule(appointment: AppointmentManagementView) {
    if (isCancelling || isRescheduling) return;
    setFeedback(null);
    setRescheduleOpen(true);
    void loadAvailability(appointment.localDate);
  }

  function submitReschedule() {
    const rawToken = tokenRef.current;
    if (!rawToken || !selectedSlot || isCancelling || isRescheduling) return;

    const requestedStartAt = selectedSlot.startAt;
    setFeedback(null);
    startRescheduling(async () => {
      try {
        const result = await rescheduleAppointmentAccessAction(
          rawToken,
          requestedStartAt
        );
        if (result.success) {
          setState({ status: "ready", appointment: result.data });
          setFeedback({ kind: "success", message: result.message });
          setRescheduleDialogOpen(false);
          setRescheduleOpen(false);
          setSelectedSlot(null);
          setSlots([]);
          return;
        }

        if (result.type === "INVALID_CAPABILITY") {
          tokenRef.current = null;
          setState({ status: "invalid" });
          setRescheduleDialogOpen(false);
          return;
        }

        setState({ status: "ready", appointment: result.data });
        setFeedback({ kind: "error", message: result.message });
        setRescheduleDialogOpen(false);
        setSelectedSlot(null);

        if (
          (result.type === "SLOT_UNAVAILABLE" ||
            result.type === "UNCHANGED") &&
          result.data.canReschedule
        ) {
          await loadAvailability(selectedDate);
        } else {
          setRescheduleOpen(false);
        }
      } catch {
        setFeedback({
          kind: "error",
          message: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
        });
        setRescheduleDialogOpen(false);
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
  const upcomingDates = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(parseISO(appointment.businessLocalToday), index);
    return {
      localDate: format(date, "yyyy-MM-dd"),
      weekday: index === 0 ? "Bugün" : format(date, "EEE", { locale: tr }),
      day: format(date, "d"),
      month: format(date, "MMM", { locale: tr }),
    };
  }).filter(
    (item) =>
      appointment.maximumRescheduleLocalDate === null ||
      item.localDate <= appointment.maximumRescheduleLocalDate
  );

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

        {(appointment.canReschedule || appointment.canCancel) && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {appointment.canReschedule && (
              <Button
                type="button"
                className="h-11 w-full sm:w-auto sm:min-w-56"
                onClick={() => openReschedule(appointment)}
                disabled={isCancelling || isRescheduling}
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Randevu Saatini Değiştir
              </Button>
            )}
            {appointment.canCancel && (
              <Button
                type="button"
                variant="destructive"
                className="h-11 w-full sm:w-auto sm:min-w-52"
                onClick={() => setDialogOpen(true)}
                disabled={isCancelling || isRescheduling}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Randevuyu İptal Et
              </Button>
            )}
          </div>
        )}

        {(appointment.cancellationWindowClosed ||
          appointment.rescheduleWindowClosed) && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            {appointment.cancellationWindowClosed && (
              <p>
                Çevrim içi iptal süresi doldu. İşletmeyle iletişime
                geçebilirsiniz.
              </p>
            )}
            {appointment.rescheduleWindowClosed && (
              <p>
                Çevrim içi değişiklik süresi doldu. İşletmeyle
                iletişime geçebilirsiniz.
              </p>
            )}
          </div>
        )}

        {rescheduleOpen && appointment.canReschedule && (
          <section
            className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
            aria-labelledby="reschedule-heading"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="reschedule-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  Yeni Tarih ve Saat
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Hizmetiniz ve personeliniz değişmeden yeni bir saat seçin.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={() => {
                  availabilityRequestId.current += 1;
                  setRescheduleOpen(false);
                  setSelectedSlot(null);
                }}
                disabled={isRescheduling}
              >
                Kapat
              </Button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                Tarih Seçin
              </h3>
              <div className="relative">
                <label
                  htmlFor="public-reschedule-date"
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
                >
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Takvimden Seç
                </label>
                <input
                  id="public-reschedule-date"
                  type="date"
                  min={appointment.businessLocalToday}
                  max={appointment.maximumRescheduleLocalDate ?? undefined}
                  value={selectedDate}
                  onChange={(event) => {
                    if (event.target.value) {
                      void loadAvailability(event.target.value);
                    }
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  disabled={isRescheduling}
                />
              </div>
            </div>

            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2">
              {upcomingDates.map((item) => {
                const isSelected = selectedDate === item.localDate;
                return (
                  <button
                    key={item.localDate}
                    type="button"
                    onClick={() => void loadAvailability(item.localDate)}
                    aria-pressed={isSelected}
                    disabled={isRescheduling}
                    className={cn(
                      "flex min-h-20 min-w-[68px] shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    )}
                  >
                    <span className="text-[11px] font-medium uppercase">
                      {item.weekday}
                    </span>
                    <span className="my-0.5 text-xl font-bold">{item.day}</span>
                    <span className="text-[11px]">{item.month}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-foreground">
                Saat Seçin
              </h3>
              {availabilityState.status === "loading" ? (
                <div
                  className="mt-3 flex min-h-28 items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Uygun saatler kontrol ediliyor...
                </div>
              ) : availabilityState.status === "error" ? (
                <div
                  className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                  role="alert"
                >
                  {availabilityState.message}
                </div>
              ) : slots.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  {availabilityState.status === "ready" &&
                  availabilityState.message
                    ? availabilityState.message
                    : "Bu tarihte uygun saat bulunmuyor."}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.startAt === slot.startAt;
                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        aria-pressed={isSelected}
                        disabled={isRescheduling}
                        className={cn(
                          "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 font-mono text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        )}
                      >
                        {isSelected && (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                        {slot.localStartTime}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedSlot && (
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Mevcut Randevu
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {appointment.dateLabel}
                    </p>
                    <p className="mt-0.5 font-mono text-sm text-foreground">
                      {appointment.localStartTime} - {appointment.localEndTime}
                    </p>
                  </div>
                  <ArrowRight
                    className="hidden h-5 w-5 text-muted-foreground sm:block"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Yeni Randevu
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatLocalDate(selectedDate)}
                    </p>
                    <p className="mt-0.5 font-mono text-sm text-foreground">
                      {selectedSlot.localStartTime} - {selectedSlot.localEndTime}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  className="mt-4 h-11 w-full"
                  onClick={() => setRescheduleDialogOpen(true)}
                  disabled={isRescheduling}
                >
                  Değişikliği Gözden Geçir
                </Button>
              </div>
            )}
          </section>
        )}

        <p className="mx-auto mt-5 max-w-lg text-center text-xs leading-5 text-muted-foreground sm:text-sm">
          Bu bağlantı randevunuza özeldir. Güvenliğiniz için başkalarıyla paylaşmayın.
        </p>
      </div>

      <AlertDialog.Root
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isCancelling) setDialogOpen(open);
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
                  disabled={isCancelling}
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
                  disabled={isCancelling}
                  aria-busy={isCancelling}
                >
                  {isCancelling ? (
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

      {selectedSlot && (
        <AlertDialog.Root
          open={rescheduleDialogOpen}
          onOpenChange={(open) => {
            if (!isRescheduling) setRescheduleDialogOpen(open);
          }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/45 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
            <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
              <AlertDialog.Popup
                className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:p-6"
                data-testid="reschedule-confirmation"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarClock className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <AlertDialog.Title className="text-lg font-semibold text-foreground">
                      Randevu saati değiştirilsin mi?
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Hizmet ve personel aynı kalacak; yalnızca randevu tarihi ve saati değişecek.
                    </AlertDialog.Description>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Mevcut Randevu
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {appointment.dateLabel}
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {appointment.localStartTime} - {appointment.localEndTime}
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Yeni Randevu
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {formatLocalDate(selectedDate)}
                    </p>
                    <p className="mt-1 font-mono text-sm text-foreground">
                      {selectedSlot.localStartTime} - {selectedSlot.localEndTime}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialog.Close
                    disabled={isRescheduling}
                    className={buttonVariants({
                      variant: "outline",
                      className: "h-11",
                    })}
                  >
                    Vazgeç
                  </AlertDialog.Close>
                  <Button
                    type="button"
                    className="h-11"
                    onClick={submitReschedule}
                    disabled={isRescheduling}
                    aria-busy={isRescheduling}
                  >
                    {isRescheduling ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Randevu Değiştiriliyor...
                      </>
                    ) : (
                      <>
                        <CalendarClock className="h-4 w-4" aria-hidden="true" />
                        Randevuyu Değiştir
                      </>
                    )}
                  </Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Viewport>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    </main>
  );
}
