"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Phone,
  Calendar,
  CalendarDays,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";

interface CustomerListProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData: any[];
  total: number;
  currentPage: number;
  limit: number;
  initialSearch: string;
}

export function CustomerList({
  initialData,
  total,
  currentPage,
  limit,
  initialSearch,
}: CustomerListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(initialSearch);

  const totalPages = Math.ceil(total / limit);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("q", searchValue);
    } else {
      params.delete("q");
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="İsim veya telefon ile ara..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 h-10 shadow-sm"
          />
        </div>
        <Button type="submit" variant="secondary" className="h-10">Ara</Button>
      </form>

      {initialData.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border bg-muted/10">
          <User className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-sm font-medium text-foreground mb-1">
            {initialSearch ? "Aramanızla eşleşen müşteri bulunamadı." : "Henüz müşteri bulunmuyor."}
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            {!initialSearch && "Müşteriler randevu oluşturdukça bu listede otomatik olarak belirecektir."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 font-semibold">Müşteri</th>
                  <th className="py-3 px-4 font-semibold">Telefon</th>
                  <th className="py-3 px-4 font-semibold">Son Randevu</th>
                  <th className="py-3 px-4 font-semibold">Yaklaşan Randevu</th>
                  <th className="py-3 px-4 font-semibold">Toplam</th>
                  <th className="py-3 px-4 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {initialData.map((item) => {
                  const customer = item.customer;
                  return (
                    <tr key={customer.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground">
                          {customer.firstName} {customer.lastName || ""}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="font-mono text-xs">{customer.phone}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                        {item.lastAppointmentDate ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>
                              {formatInstantInBusinessTimezone(new Date(item.lastAppointmentDate), "Europe/Istanbul").dateStr}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs opacity-60">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.nextAppointmentDate ? (
                          <Badge variant="secondary" className="text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                            {formatInstantInBusinessTimezone(new Date(item.nextAppointmentDate), "Europe/Istanbul").displayStr}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground opacity-60">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant="outline" className="font-mono text-xs">{item.appointmentCount}</Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs px-2.5")}
                        >
                          <span>Detay</span>
                          <ArrowRight className="ml-1.5 h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-border/60">
            {initialData.map((item) => {
              const customer = item.customer;
              return (
                <div key={customer.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <span className="font-semibold text-base text-foreground truncate block">
                        {customer.firstName} {customer.lastName || ""}
                      </span>
                      <p className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{customer.phone}</span>
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] font-mono">
                      {item.appointmentCount} Randevu
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-muted/20 p-2.5 rounded-lg border border-border/50">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                        Son
                      </span>
                      <span className="text-xs font-medium text-foreground">
                        {item.lastAppointmentDate ? (
                          formatInstantInBusinessTimezone(new Date(item.lastAppointmentDate), "Europe/Istanbul").dateStr
                        ) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1">
                        Yaklaşan
                      </span>
                      {item.nextAppointmentDate ? (
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {formatInstantInBusinessTimezone(new Date(item.nextAppointmentDate), "Europe/Istanbul").dateStr}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-1">
                    <Link
                      href={`/dashboard/customers/${customer.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full h-9 text-xs")}
                    >
                      <span>Müşteri Detayı</span>
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/50 pt-4">
          <div className="text-xs text-muted-foreground">
            Toplam <span className="font-medium text-foreground">{total}</span> müşteri
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Önceki</span>
            </Button>
            <div className="text-xs font-medium px-2 text-muted-foreground">
              {currentPage} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Sonraki</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
