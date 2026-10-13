"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  requeueTerminalOutboxAction,
  requeueTerminalDeliveryAction,
} from "@/actions/platform-operations.actions";
import { PlatformTerminalFailureDetail } from "@/types/platform-operations";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { RotateCcw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TerminalFailureRecoveryProps {
  failure: PlatformTerminalFailureDetail;
}

export function TerminalFailureRecovery({ failure }: TerminalFailureRecoveryProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isOutbox = failure.type === "OUTBOX";
  const typeLabel = isOutbox ? "Bildirim Dış Kutusu (Outbox)" : "SMS Teslimatı";

  const handleRequeue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = isOutbox
        ? await requeueTerminalOutboxAction(failure.id)
        : await requeueTerminalDeliveryAction(failure.id);

      if (result.success) {
        setDialogOpen(false);
        router.refresh();
      } else {
        setError(result.error || "Yeniden sıraya alma işlemi başarısız oldu.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setDialogOpen(true);
        }}
        className="h-8 px-2.5 text-xs font-medium text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 transition-colors flex items-center gap-1.5 cursor-pointer min-h-[44px] sm:min-h-[32px]"
        data-testid={`requeue-btn-${failure.id}`}
      >
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Yeniden Kuyruğa Al</span>
      </Button>

      <AlertDialog.Root
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isLoading) {
            setDialogOpen(open);
            if (!open) setError(null);
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/50 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup
              className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:p-6"
              data-testid={`requeue-dialog-${failure.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <AlertDialog.Title className="text-lg font-semibold text-foreground">
                    {isOutbox ? "Bildirimi Yeniden Kuyruğa Al" : "SMS Teslimatını Yeniden Kuyruğa Al"}
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {isOutbox ? (
                      <>
                        Bu işlem kalıcı başarısız olmuş kaydı tekrar işlenmek üzere bildirim dış kutusuna alır. Randevu veya müşteri durumu değişmez.
                        <span className="block mt-2 font-medium text-amber-700 dark:text-amber-400">
                          Yeniden kuyruğa alma işlemi yeni bir bildirim işleme denemesi oluşturabilir.
                        </span>
                      </>
                    ) : (
                      <>
                        Bu işlem kalıcı başarısız olmuş kaydı tekrar işlenmek üzere teslimat kuyruğuna alır. Randevu veya müşteri durumu değişmez.
                        <span className="block mt-2 font-medium text-amber-700 dark:text-amber-400">
                          Yeniden kuyruğa alma işlemi yeni bir SMS gönderim denemesi oluşturabilir.
                        </span>
                      </>
                    )}
                  </AlertDialog.Description>
                </div>
              </div>

              <div className="mt-4 p-3 bg-muted/40 rounded-lg text-xs space-y-1.5 border border-border/50">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kayıt Türü:</span>
                  <span className="font-medium text-foreground">{typeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kayıt Kimliği:</span>
                  <span className="font-mono text-foreground">{failure.id.slice(0, 18)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Önceki Deneme:</span>
                  <span className="font-medium text-foreground">{failure.attemptCount}</span>
                </div>
                {failure.lastErrorCode && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hata Kodu:</span>
                    <span className="font-mono text-rose-600 dark:text-rose-400 font-medium">
                      {failure.lastErrorCode}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Close
                  disabled={isLoading}
                  className="h-11 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  Vazgeç
                </AlertDialog.Close>
                <Button
                  type="button"
                  className="h-11 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleRequeue}
                  disabled={isLoading}
                  data-testid="requeue-confirm-btn"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Kuyruğa Alınıyor...
                    </>
                  ) : (
                    "Yeniden Kuyruğa Al"
                  )}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
