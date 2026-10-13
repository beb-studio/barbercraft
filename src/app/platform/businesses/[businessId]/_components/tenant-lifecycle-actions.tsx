"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  suspendBusinessAction,
  reactivateBusinessAction,
} from "@/actions/platform-operations.actions";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { ShieldAlert, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TenantLifecycleActionsProps {
  businessId: string;
  businessName: string;
  isActive: boolean;
}

export function TenantLifecycleActions({
  businessId,
  businessName,
  isActive,
}: TenantLifecycleActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleOpenDialog = () => {
    setReason("");
    setError(null);
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setError("Lütfen en az 5 karakterden oluşan geçerli bir gerekçe belirtin.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = isActive
        ? await suspendBusinessAction(businessId, trimmedReason)
        : await reactivateBusinessAction(businessId, trimmedReason);

      if (result.success) {
        setDialogOpen(false);
        setReason("");
        router.refresh();
      } else {
        setError(result.error || "İşlem sırasında bir hata oluştu.");
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
        variant={isActive ? "destructive" : "default"}
        onClick={handleOpenDialog}
        className="h-10 min-h-[44px] px-4 font-medium flex items-center gap-2 cursor-pointer shadow-xs"
        data-testid="tenant-lifecycle-toggle-btn"
      >
        {isActive ? (
          <>
            <ShieldAlert className="w-4 h-4" />
            <span>İşletmeyi Askıya Al</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>İşletmeyi Aktifleştir</span>
          </>
        )}
      </Button>

      <AlertDialog.Root
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isLoading) {
            setDialogOpen(open);
            if (!open) {
              setReason("");
              setError(null);
            }
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-slate-950/50 backdrop-blur-xs transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center p-4 sm:p-6">
            <AlertDialog.Popup
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 sm:p-6"
              data-testid="tenant-lifecycle-dialog"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isActive
                      ? "bg-destructive/10 text-destructive"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <AlertDialog.Title className="text-lg font-semibold text-foreground">
                    {isActive ? "İşletmeyi Askıya Al" : "İşletmeyi Aktifleştir"}
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {isActive ? (
                      <>
                        <strong className="text-foreground">{businessName}</strong> adlı işletmeyi askıya almak üzeresiniz.
                        <span className="block mt-2 font-medium text-amber-700 dark:text-amber-400">
                          İşletme askıya alındığında yeni herkese açık randevu oluşturulamaz. Mevcut randevular ve veriler korunur. Mevcut işletme kullanıcılarının panel erişimi bu işlemle otomatik olarak kaldırılmaz.
                        </span>
                      </>
                    ) : (
                      <>
                        <strong className="text-foreground">{businessName}</strong> adlı işletmeyi yeniden aktifleştirmek üzeresiniz.
                        <span className="block mt-2 font-medium text-emerald-700 dark:text-emerald-400">
                          İşletmeyi yeniden aktifleştirmek, işletmenin herkese açık randevu erişilebilirliğini mevcut işletme ayarlarına göre tekrar kullanılabilir hale getirir. Mevcut veriler ve iç operasyon kayıtları değişmez.
                        </span>
                      </>
                    )}
                  </AlertDialog.Description>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <label className="block text-sm font-medium text-foreground">
                  İşlem Gerekçesi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Denetim günlüğü için bu işlemin resmi gerekçesini belirtin (en az 5 karakter)..."
                  className="w-full min-h-[90px] rounded-lg border border-input bg-background p-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  disabled={isLoading}
                  data-testid="lifecycle-reason-input"
                />
                {error && (
                  <div
                    className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg dark:bg-rose-950/40 dark:border-rose-900/60 dark:text-rose-400"
                    data-testid="lifecycle-error-msg"
                  >
                    {error}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Close
                  disabled={isLoading}
                  className="h-11 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
                >
                  Vazgeç
                </AlertDialog.Close>
                <Button
                  type="button"
                  variant={isActive ? "destructive" : "default"}
                  className="h-11 min-h-[44px]"
                  onClick={handleConfirm}
                  disabled={isLoading || reason.trim().length < 5}
                  data-testid="lifecycle-confirm-btn"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      İşleniyor...
                    </>
                  ) : isActive ? (
                    "Onayla ve Askıya Al"
                  ) : (
                    "Onayla ve Aktifleştir"
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
