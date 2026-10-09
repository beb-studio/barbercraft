"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleBusinessActiveAction } from "@/actions/platform-admin.actions";
import { ShieldAlert, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export function BusinessStatusToggle({
  businessId,
  businessName,
  isActive,
}: {
  businessId: string;
  businessName: string;
  isActive: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleToggle = async () => {
    if (!reason.trim()) {
      setError("Lütfen bir neden belirtin.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await toggleBusinessActiveAction(businessId, !isActive, reason);

    if (result.success) {
      setIsOpen(false);
      setReason("");
      router.refresh();
    } else {
      setError(result.error || "İşlem sırasında bir hata oluştu.");
    }
    
    setIsLoading(false);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
          isActive
            ? "border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
            : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
        }`}
      >
        {isActive ? <ShieldAlert className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        {isActive ? "İşletmeyi Pasife Al" : "İşletmeyi Aktife Al"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md p-6 rounded-lg shadow-lg border">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <AlertTriangle className={isActive ? "text-rose-500" : "text-emerald-500"} />
              {isActive ? "İşletmeyi Pasife Al" : "İşletmeyi Aktife Al"}
            </h2>
            
            <p className="text-sm text-muted-foreground mb-4">
              <strong>{businessName}</strong> adlı işletmenin durumunu {isActive ? "pasif" : "aktif"} olarak değiştiriyorsunuz.
              {isActive && " Bu işlem işletmenin randevu almasını durduracaktır, ancak yönetici paneline erişimleri devam eder."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  İşlem Nedeni <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Bu değişikliğin nedenini girin (denetim kaydı için zorunludur)..."
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {error && (
                <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-md dark:bg-rose-900/30 dark:text-rose-400">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleToggle}
                  disabled={isLoading}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white transition-colors disabled:opacity-50 ${
                    isActive ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Onayla ve {isActive ? "Pasife Al" : "Aktife Al"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
