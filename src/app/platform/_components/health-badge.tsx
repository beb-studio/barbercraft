import { cn } from "@/lib/utils";
import {
  BUSINESS_HEALTH_REASON_LABELS,
  BusinessHealthReasonCode,
  BusinessHealthStatus,
} from "@/types/platform-operations";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";

interface HealthBadgeProps {
  status: BusinessHealthStatus;
  className?: string;
  showIcon?: boolean;
}

export function HealthBadge({ status, className, showIcon = true }: HealthBadgeProps) {
  switch (status) {
    case "HEALTHY":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide border",
            "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
            className
          )}
          data-testid="health-badge-healthy"
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
          <span>Sağlıklı</span>
        </span>
      );
    case "ATTENTION":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide border",
            "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
            className
          )}
          data-testid="health-badge-attention"
        >
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />}
          <span>Dikkat Gerekiyor</span>
        </span>
      );
    case "SUSPENDED":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide border",
            "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
            className
          )}
          data-testid="health-badge-suspended"
        >
          {showIcon && <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />}
          <span>Askıya Alınmış</span>
        </span>
      );
    default:
      return null;
  }
}

interface HealthReasonListProps {
  reasons: string[];
  className?: string;
}

export function HealthReasonList({ reasons, className }: HealthReasonListProps) {
  if (!reasons || reasons.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {reasons.map((reason) => {
        const label =
          BUSINESS_HEALTH_REASON_LABELS[reason as BusinessHealthReasonCode] || reason;
        return (
          <span
            key={reason}
            className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/60"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
