import { Scissors } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ServiceAnalyticsItem } from "@/types/business-analytics";
import { formatCurrency } from "@/lib/presentation";

interface TopServicesCardProps {
  topServices: ServiceAnalyticsItem[];
  currency: string;
}

export function TopServicesCard({ topServices, currency }: TopServicesCardProps) {
  const maxVolume = Math.max(1, ...topServices.map((s) => s.appointmentCount));

  return (
    <Card className="border-border/80 shadow-2xs">
      <CardHeader className="p-4 sm:p-5 pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Scissors className="h-4 w-4" />
            </div>
            <h3 className="font-bold text-base tracking-tight text-foreground">
              En Çok Tercih Edilen Hizmetler
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dönem içinde en çok randevu alan ilk 5 hizmet
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-3">
        {topServices.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Scissors className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm font-semibold text-foreground/80">
              Henüz hizmet verisi yok
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bu tarih aralığında tamamlanan veya kayıtlı hizmet bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {topServices.map((service, index) => {
              const valItem =
                service.completedServiceValue.find((v) => v.currency === currency) ||
                service.completedServiceValue[0];
              const formattedVal = valItem
                ? formatCurrency(valItem.amount, valItem.currency)
                : formatCurrency(0, currency);

              const percentWidth = Math.round((service.appointmentCount / maxVolume) * 100);

              return (
                <div key={service.serviceId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="font-semibold text-foreground truncate">
                        {service.serviceName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                      <span className="text-muted-foreground">
                        <strong className="text-foreground">{service.appointmentCount}</strong> randevu
                      </span>
                      <span className="font-semibold text-foreground">
                        {formattedVal}
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar */}
                  <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${percentWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
