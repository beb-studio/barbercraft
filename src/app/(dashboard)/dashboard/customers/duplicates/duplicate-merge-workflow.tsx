"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ExternalLink,
  Loader2,
  Merge,
  Phone,
} from "lucide-react";
import { mergeCustomersAction } from "@/actions/customer.actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ReviewCustomer {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  createdAt: Date;
  appointmentCount: number;
  lastAppointmentDate: Date | null;
}

interface ReviewGroup {
  confidence: "HIGH" | "POSSIBLE";
  reason: string;
  customers: ReviewCustomer[];
}

interface DuplicateMergeWorkflowProps {
  groups: ReviewGroup[];
}

const ERROR_MESSAGES = {
  CUSTOMER_MERGE_NOT_ELIGIBLE:
    "Bu kayıtlar artık birleştirme koşullarını karşılamıyor. Güncel kayıtları yeniden kontrol edin.",
  CUSTOMER_MERGE_STALE:
    "Müşteri kayıtları değişti. Güncel kayıtları yeniden kontrol edin.",
  CUSTOMER_MERGE_CONFLICT:
    "Kayıtlar aynı anda değiştirildi. Birleştirme yapılmadı; güncel kayıtları yeniden kontrol edin.",
  CUSTOMER_NOT_FOUND:
    "Müşteri kaydı bulunamadı. Güncel kayıtları yeniden kontrol edin.",
  FORBIDDEN: "Bu işlem için yetkiniz yok.",
} as const;

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function CustomerFacts({ customer }: { customer: ReviewCustomer }) {
  return (
    <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide">Toplam Randevu</span>
        <span className="font-medium text-foreground">{customer.appointmentCount}</span>
      </span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide">Son Randevu</span>
        <span className="font-medium text-foreground">{formatDate(customer.lastAppointmentDate)}</span>
      </span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-wide">Oluşturulma</span>
        <span className="font-medium text-foreground">{formatDate(customer.createdAt)}</span>
      </span>
    </div>
  );
}

function Consequences() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-950">
      <p className="font-semibold">Birleştirme sonrası</p>
      <ul className="mt-2 list-disc space-y-1.5 pl-4">
        <li>Seçilen birincil müşterinin mevcut profil bilgileri korunur.</li>
        <li>Diğer kayıtlar bağlı eski kayıtlar olarak saklanır ve listede ayrı görünmez.</li>
        <li>Eski randevular yeniden yazılmaz; notlar fiziksel olarak taşınmaz.</li>
        <li>Randevu ve not geçmişleri birincil müşteri altında birlikte gösterilir.</li>
        <li>Gelecekte eşleşen rezervasyonlar birincil müşteriye bağlanır.</li>
        <li>Bu sürümde birleştirmeyi geri alma işlemi yoktur.</li>
      </ul>
    </div>
  );
}

function MergeGroup({ group, index }: { group: ReviewGroup; index: number }) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCustomer = group.customers.find(
    (customer) => customer.id === selectedCanonicalId
  );

  function startReview() {
    setFeedback(null);
    setSelectedCanonicalId(null);
    setReviewing(true);
  }

  function cancelReview() {
    if (isPending) return;
    setReviewing(false);
    setSelectedCanonicalId(null);
    setFeedback(null);
  }

  function submitMerge() {
    if (!selectedCanonicalId || isPending) return;

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await mergeCustomersAction(
          selectedCanonicalId,
          group.customers.map((customer) => customer.id)
        );

        if (result.success) {
          router.push(
            `/dashboard/customers/${result.data.canonicalCustomerId}?merged=1`
          );
          router.refresh();
          return;
        }

        setDialogOpen(false);
        setSelectedCanonicalId(null);
        setFeedback(
          ERROR_MESSAGES[result.code as keyof typeof ERROR_MESSAGES] ??
            "Müşteri kayıtları birleştirilemedi. Güncel kayıtları yeniden kontrol edin."
        );
        router.refresh();
      } catch {
        setDialogOpen(false);
        setFeedback(
          "Müşteri kayıtları birleştirilemedi. Güncel kayıtları yeniden kontrol edin."
        );
        router.refresh();
      }
    });
  }

  return (
    <Card
      className="overflow-hidden border-border shadow-xs"
      data-testid={`duplicate-group-${index}`}
    >
      <CardHeader className="border-b border-border/60 bg-muted/30 p-4 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <span className="inline-flex items-center rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {group.confidence === "HIGH" ? "Yüksek Güvenilirlik" : "Olası Eşleşme"}
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">{group.reason}</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {group.customers.length} kayıt
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {group.customers.map((customer) => (
            <div
              key={customer.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {customer.firstName[0]}
                    {(customer.lastName || "")[0] || ""}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {customer.firstName} {customer.lastName || ""}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-foreground">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {customer.phone}
                    </p>
                  </div>
                </div>
                <CustomerFacts customer={customer} />
              </div>
              <Link
                href={`/dashboard/customers/${customer.id}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "h-9 self-end text-xs sm:self-auto",
                })}
              >
                Profili İncele
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>

        {feedback && (
          <div
            role="alert"
            className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium leading-relaxed text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {feedback}
          </div>
        )}

        {!reviewing ? (
          <div className="flex justify-end border-t border-border/60 bg-muted/15 p-4">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full border-amber-300 text-amber-800 hover:bg-amber-50 sm:w-auto"
              onClick={startReview}
            >
              <Merge className="h-4 w-4" />
              Kayıtları Birleştir
            </Button>
          </div>
        ) : (
          <div
            className="border-t border-border bg-muted/15 p-4 sm:p-5"
            data-testid={`merge-review-${index}`}
          >
            <fieldset disabled={isPending}>
              <legend className="text-base font-semibold text-foreground">
                Birincil Müşteri
              </legend>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Profil bilgileri korunacak kaydı seçin. Sistem sizin yerinize seçim yapmaz.
              </p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {group.customers.map((customer) => {
                  const selected = customer.id === selectedCanonicalId;
                  return (
                    <label
                      key={customer.id}
                      className={cn(
                        "relative cursor-pointer rounded-xl border bg-card p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                        selected
                          ? "border-primary ring-1 ring-primary"
                          : "border-border hover:border-primary/50 hover:bg-primary/[0.02]",
                        isPending && "cursor-not-allowed opacity-60"
                      )}
                    >
                      <input
                        type="radio"
                        name={`canonical-customer-${index}`}
                        value={customer.id}
                        checked={selected}
                        onChange={() => setSelectedCanonicalId(customer.id)}
                        className="peer sr-only"
                      />
                      <span className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background"
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">
                            {customer.firstName} {customer.lastName || ""}
                          </span>
                          <span className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </span>
                          <CustomerFacts customer={customer} />
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-4">
              <Consequences />
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={cancelReview}
                disabled={isPending}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                className="h-10"
                disabled={!selectedCanonicalId || isPending}
                onClick={() => setDialogOpen(true)}
              >
                Birleştirmeyi Gözden Geçir
              </Button>
            </div>
          </div>
        )}
      </CardContent>

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
              className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:p-6"
              data-testid="merge-confirmation"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <Merge className="h-5 w-5" />
                </div>
                <div>
                  <AlertDialog.Title className="text-lg font-semibold text-foreground">
                    Müşteri kayıtları birleştirilsin mi?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Bu kayıtlar tek müşteri görünümünde birleştirilecek. Eski
                    randevu ve not kayıtları değiştirilmeden korunacak.
                  </AlertDialog.Description>
                </div>
              </div>

              {selectedCustomer && (
                <div className="my-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Birincil Müşteri
                  </p>
                  <p className="mt-1 font-semibold text-foreground">
                    {selectedCustomer.firstName} {selectedCustomer.lastName || ""}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {selectedCustomer.phone}
                  </p>
                </div>
              )}

              <div className="mb-5 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Geçmiş randevular ve notlar yerinde kalır; birincil müşteri profilinde
                  birlikte görünür. Bu sürümde geri alma işlemi yoktur.
                </span>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Close
                  disabled={isPending}
                  className={buttonVariants({
                    variant: "outline",
                    className: "h-10",
                  })}
                >
                  Vazgeç
                </AlertDialog.Close>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-10"
                  onClick={submitMerge}
                  disabled={isPending || !selectedCanonicalId}
                  aria-busy={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Birleştiriliyor...
                    </>
                  ) : (
                    <>
                      <Merge className="h-4 w-4" />
                      Müşterileri Birleştir
                    </>
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Card>
  );
}

export function DuplicateMergeWorkflow({ groups }: DuplicateMergeWorkflowProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Tespit Edilen Olası Mükerrer Grup: {groups.length}</span>
      </div>
      {groups.map((group, index) => (
        <MergeGroup key={`${group.customers[0]?.id ?? "group"}-${index}`} group={group} index={index} />
      ))}
    </div>
  );
}
