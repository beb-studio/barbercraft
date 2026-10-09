"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Scissors,
  Plus,
  Clock,
  Pencil,
  Power,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toggleDashboardServiceActiveAction } from "@/actions/service.actions";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/presentation";

export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ServiceListProps {
  initialServices: ServiceItem[];
  currency: string;
}

export function ServiceList({ initialServices, currency }: ServiceListProps) {
  const [services, setServices] = useState<ServiceItem[]>(initialServices);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggleActive = async (service: ServiceItem) => {
    setError(null);
    const newActive = !service.active;
    const previousState = [...services];

    // Optimistic update
    setServices((prev) =>
      prev.map((s) => (s.id === service.id ? { ...s, active: newActive } : s))
    );
    setTogglingId(service.id);

    try {
      const res = await toggleDashboardServiceActiveAction({
        serviceId: service.id,
        active: newActive,
      });

      if (!res.success) {
        // Revert optimistic update
        setServices(previousState);
        setError(res.error || "Hizmet durumu güncellenemedi.");
      }
    } catch {
      setServices(previousState);
      setError("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setTogglingId(null);
    }
  };

  const activeCount = services.filter((s) => s.active).length;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal">
            Toplam: {services.length}
          </Badge>
          <Badge variant="secondary" className="text-xs font-normal">
            Aktif: {activeCount}
          </Badge>
        </div>

        <Link
          href="/dashboard/services/new"
          className={cn(buttonVariants({ size: "sm" }), "shadow-xs font-semibold gap-1.5")}
        >
          <Plus className="h-4 w-4" />
          <span>Yeni Hizmet Ekle</span>
        </Link>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="text-xs ml-2 leading-relaxed">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {services.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardHeader className="text-center pb-2 pt-10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Scissors className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-base font-semibold mt-3">
              Henüz Hizmet Eklenmemiş
            </CardTitle>
            <CardDescription className="text-xs max-w-sm mx-auto">
              Müşterilerinizin randevu oluşturabilmesi için işletmenize ait ilk hizmeti tanımlayın.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 pb-10 text-center">
            <Link
              href="/dashboard/services/new"
              className={cn(buttonVariants({ size: "sm" }), "shadow-xs font-semibold gap-1.5")}
            >
              <Plus className="h-4 w-4" />
              İlk Hizmeti Ekle
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          {/* Desktop Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 font-semibold">Hizmet Adı</th>
                  <th className="py-3 px-4 font-semibold">Açıklama</th>
                  <th className="py-3 px-4 font-semibold">Süre</th>
                  <th className="py-3 px-4 font-semibold">Fiyat</th>
                  <th className="py-3 px-4 font-semibold">Durum</th>
                  <th className="py-3 px-4 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {services.map((service) => {
                  const isToggling = togglingId === service.id;
                  return (
                    <tr
                      key={service.id}
                      className={cn(
                        "hover:bg-muted/20 transition-colors",
                        !service.active && "opacity-75 bg-muted/5"
                      )}
                    >
                      <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">
                        {service.name}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs truncate">
                        {service.description || "—"}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-xs">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {service.durationMinutes} dk
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-foreground whitespace-nowrap">
                        {formatCurrency(service.price, currency)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant={service.active ? "default" : "outline"}
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium",
                            service.active
                              ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                              : "text-muted-foreground"
                          )}
                        >
                          {service.active ? "Aktif" : "Pasif"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant={service.active ? "outline" : "secondary"}
                            size="sm"
                            onClick={() => handleToggleActive(service)}
                            disabled={isToggling}
                            className="h-8 text-xs px-2.5"
                          >
                            {isToggling ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Power className="mr-1 h-3 w-3" />
                                <span>{service.active ? "Pasife Al" : "Aktife Al"}</span>
                              </>
                            )}
                          </Button>

                          <Link
                            href={`/dashboard/services/${service.id}/edit`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-8 text-xs px-2.5"
                            )}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            <span>Düzenle</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (< md) */}
          <div className="md:hidden divide-y divide-border/60">
            {services.map((service) => {
              const isToggling = togglingId === service.id;
              return (
                <div
                  key={service.id}
                  className={cn(
                    "p-4 space-y-3",
                    !service.active && "opacity-75 bg-muted/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base text-foreground truncate">
                          {service.name}
                        </h3>
                        <Badge
                          variant={service.active ? "default" : "outline"}
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium",
                            service.active
                              ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                              : "text-muted-foreground"
                          )}
                        >
                          {service.active ? "Aktif" : "Pasif"}
                        </Badge>
                      </div>
                      {service.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {service.description}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-foreground">
                        {formatCurrency(service.price, currency)}
                      </div>
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        <span>{service.durationMinutes} dk</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-border/50 flex items-center justify-end gap-2">
                    <Button
                      variant={service.active ? "outline" : "secondary"}
                      size="sm"
                      onClick={() => handleToggleActive(service)}
                      disabled={isToggling}
                      className="h-9 min-h-[44px] text-xs px-3"
                    >
                      {isToggling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Power className="mr-1.5 h-3.5 w-3.5" />
                          <span>{service.active ? "Pasife Al" : "Aktife Al"}</span>
                        </>
                      )}
                    </Button>

                    <Link
                      href={`/dashboard/services/${service.id}/edit`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-9 min-h-[44px] text-xs px-3"
                      )}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      <span>Düzenle</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
