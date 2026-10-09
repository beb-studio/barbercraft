"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { saveBusinessWorkingHoursAction } from "@/actions/working-hours.actions";

export interface DaySchedule {
  dayOfWeek: number;
  name: string;
  isClosed: boolean;
  startTime: string;
  endTime: string;
}

const DEFAULT_DAYS: Array<{ dayOfWeek: number; name: string; defaultClosed: boolean }> = [
  { dayOfWeek: 1, name: "Pazartesi", defaultClosed: false },
  { dayOfWeek: 2, name: "Salı", defaultClosed: false },
  { dayOfWeek: 3, name: "Çarşamba", defaultClosed: false },
  { dayOfWeek: 4, name: "Perşembe", defaultClosed: false },
  { dayOfWeek: 5, name: "Cuma", defaultClosed: false },
  { dayOfWeek: 6, name: "Cumartesi", defaultClosed: false },
  { dayOfWeek: 0, name: "Pazar", defaultClosed: true },
];

interface WorkingHoursFormProps {
  initialHours?: Array<{
    dayOfWeek: number;
    startTime: string | null;
    endTime: string | null;
    isClosed: boolean;
  }>;
}

export function WorkingHoursForm({ initialHours }: WorkingHoursFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize schedule from initialHours if present, or defaults
  const [schedule, setSchedule] = useState<DaySchedule[]>(() => {
    return DEFAULT_DAYS.map((def) => {
      const existing = initialHours?.find((h) => h.dayOfWeek === def.dayOfWeek);
      if (existing) {
        return {
          dayOfWeek: def.dayOfWeek,
          name: def.name,
          isClosed: existing.isClosed,
          startTime: existing.startTime ? existing.startTime.slice(0, 5) : "09:00",
          endTime: existing.endTime ? existing.endTime.slice(0, 5) : "20:00",
        };
      }
      return {
        dayOfWeek: def.dayOfWeek,
        name: def.name,
        isClosed: def.defaultClosed,
        startTime: "09:00",
        endTime: "20:00",
      };
    });
  });

  const handleToggleClosed = (index: number, isClosed: boolean) => {
    setSchedule((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isClosed };
      return next;
    });
  };

  const handleTimeChange = (
    index: number,
    field: "startTime" | "endTime",
    value: string
  ) => {
    setSchedule((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Client-side pre-validation
    for (const day of schedule) {
      if (!day.isClosed) {
        if (!day.startTime || !day.endTime) {
          setError(`${day.name} için açılış ve kapanış saatleri zorunludur.`);
          return;
        }
        if (day.startTime >= day.endTime) {
          setError(
            `${day.name} için açılış saati (${day.startTime}), kapanış saatinden (${day.endTime}) önce olmalıdır.`
          );
          return;
        }
      }
    }

    setLoading(true);

    try {
      const payload = schedule.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        isClosed: d.isClosed,
        startTime: d.isClosed ? null : d.startTime,
        endTime: d.isClosed ? null : d.endTime,
      }));

      const res = await saveBusinessWorkingHoursAction(payload);

      if (!res.success) {
        setError(res.error || "Çalışma saatleri kaydedilemedi.");
        setLoading(false);
      } else {
        router.push("/onboarding/first-service");
      }
    } catch {
      setError("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs ml-2 leading-relaxed">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {schedule.map((day, idx) => (
          <div
            key={day.dayOfWeek}
            className="p-3.5 rounded-lg border border-border/60 bg-card text-card-foreground shadow-xs transition-colors"
          >
            <div className="flex items-center justify-between min-h-[44px]">
              <div className="flex flex-col">
                <span className="font-semibold text-sm text-foreground">
                  {day.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {day.isClosed ? "Kapalı" : "Açık"}
                </span>
              </div>

              <div className="flex items-center space-x-2 min-h-[44px]">
                <label
                  htmlFor={`toggle-${day.dayOfWeek}`}
                  className="text-xs font-medium cursor-pointer select-none"
                >
                  {day.isClosed ? "Kapalı" : "Açık"}
                </label>
                <Switch
                  id={`toggle-${day.dayOfWeek}`}
                  checked={!day.isClosed}
                  onCheckedChange={(checked) => handleToggleClosed(idx, !checked)}
                  disabled={loading}
                  aria-label={`${day.name} açık/kapalı`}
                />
              </div>
            </div>

            {!day.isClosed && (
              <div className="grid grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-border/40">
                <div className="space-y-1">
                  <label
                    htmlFor={`start-${day.dayOfWeek}`}
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Açılış
                  </label>
                  <Input
                    id={`start-${day.dayOfWeek}`}
                    type="time"
                    value={day.startTime}
                    onChange={(e) =>
                      handleTimeChange(idx, "startTime", e.target.value)
                    }
                    className="h-11 text-center font-medium"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor={`end-${day.dayOfWeek}`}
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    Kapanış
                  </label>
                  <Input
                    id={`end-${day.dayOfWeek}`}
                    type="time"
                    value={day.endTime}
                    onChange={(e) =>
                      handleTimeChange(idx, "endTime", e.target.value)
                    }
                    className="h-11 text-center font-medium"
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          className="w-full h-11 font-medium text-sm"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            "Kaydet ve Devam Et"
          )}
        </Button>
      </div>
    </form>
  );
}
