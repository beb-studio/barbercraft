"use client";

import { useState } from "react";
import Link from "next/link";
import {
  UserPlus,
  Calendar,
  Power,
  Loader2,
  AlertCircle,
  Mail,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  toggleStaffActiveAction,
} from "@/actions/staff.actions";
import { cn } from "@/lib/utils";
import type { BusinessMemberWithProfile } from "@/repositories/staff.repository";

interface StaffListProps {
  initialMembers: BusinessMemberWithProfile[];
  userRole?: "OWNER" | "ADMIN" | "STAFF";
}

export function StaffList({ initialMembers, userRole }: StaffListProps) {
  const [members, setMembers] = useState<BusinessMemberWithProfile[]>(initialMembers);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleToggleMember = async (member: BusinessMemberWithProfile) => {
    setError(null);
    setSuccessMsg(null);
    const newActive = !member.active;
    const previous = [...members];

    // Optimistic update
    setMembers((prev) =>
      prev.map((m) =>
        m.id === member.id
          ? {
              ...m,
              active: newActive,
              staffActive: m.hasStaffProfile ? newActive : m.staffActive,
              publicBookingEnabled: m.hasStaffProfile ? newActive : m.publicBookingEnabled,
            }
          : m
      )
    );
    setTogglingId(member.id);

    try {
      const res = await toggleStaffActiveAction({
        memberId: member.id,
        active: newActive,
      });

      if (!res.success) {
        setMembers(previous);
        setError(res.error || "Personel durumu güncellenemedi.");
      } else {
        setSuccessMsg(
          newActive
            ? `${member.userName} başarıyla aktifleştirildi.`
            : `${member.userName} başarıyla pasife alındı.`
        );
      }
    } catch {
      setMembers(previous);
      setError("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setTogglingId(null);
    }
  };


  const activeCount = members.filter((m) => m.active).length;

  return (
    <div className="space-y-6">
      {/* Top action and badge summary */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal">
            Toplam Üye: {members.length}
          </Badge>
          <Badge variant="secondary" className="text-xs font-normal">
            Aktif: {activeCount}
          </Badge>
        </div>

        {userRole === "OWNER" && (
          <Link
            href="/dashboard/staff/new"
            className={cn(buttonVariants({ size: "sm" }), "shadow-xs font-semibold gap-1.5")}
          >
            <UserPlus className="h-4 w-4" />
            <span>Personel Oluştur</span>
          </Link>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="py-2.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="text-xs ml-2 leading-relaxed">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {successMsg && (
        <Alert className="py-2.5 border-emerald-500 text-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <AlertDescription className="text-xs ml-2 leading-relaxed">
            {successMsg}
          </AlertDescription>
        </Alert>
      )}

      {/* Staff Members Section */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          Ekip Üyeleri ({members.length})
        </h2>

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
          {/* Desktop Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 border-b border-border/70 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 font-semibold">Personel</th>
                  <th className="py-3 px-4 font-semibold">Rol</th>
                  <th className="py-3 px-4 font-semibold">Online Randevu</th>
                  <th className="py-3 px-4 font-semibold">Durum</th>
                  <th className="py-3 px-4 font-semibold text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {members.map((member) => {
                  const isStaff = member.role === "STAFF";
                  const isToggling = togglingId === member.id;
                  const canManageServices =
                    member.hasStaffProfile &&
                    member.staffProfileId &&
                    !(userRole === "ADMIN" && member.role === "OWNER");

                  return (
                    <tr
                      key={member.id}
                      className={cn(
                        "hover:bg-muted/20 transition-colors",
                        !member.active && "opacity-75 bg-muted/5"
                      )}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-semibold text-xs text-foreground shrink-0 border border-border">
                            {member.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">
                              {member.userName}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span>{member.userEmail}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant={
                            member.role === "OWNER"
                              ? "default"
                              : member.role === "ADMIN"
                              ? "secondary"
                              : "outline"
                          }
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium",
                            member.role === "OWNER" && "bg-amber-600 hover:bg-amber-600/90 text-white",
                            member.role === "ADMIN" && "bg-blue-600 hover:bg-blue-600/90 text-white"
                          )}
                        >
                          {member.role === "OWNER"
                            ? "İşletme Sahibi"
                            : member.role === "ADMIN"
                            ? "Yönetici"
                            : "Personel"}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {member.hasStaffProfile ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Randevu Alınabilir</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span>Takvimsiz</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge
                          variant={member.active ? "default" : "outline"}
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium",
                            member.active
                              ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                              : "text-muted-foreground"
                          )}
                        >
                          {member.active ? "Aktif" : "Pasif"}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {canManageServices && (
                            <Link
                              href={`/dashboard/staff/${member.staffProfileId}`}
                              className={cn(
                                buttonVariants({ variant: "outline", size: "sm" }),
                                "h-8 text-xs px-2.5"
                              )}
                            >
                              <span>Hizmetleri Yönet</span>
                              <ArrowRight className="ml-1 h-3 w-3" />
                            </Link>
                          )}

                          {isStaff && (
                            <Button
                              variant={member.active ? "outline" : "secondary"}
                              size="sm"
                              onClick={() => handleToggleMember(member)}
                              disabled={isToggling}
                              className="h-8 text-xs px-2.5"
                            >
                              {isToggling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Power className="mr-1 h-3 w-3" />
                                  <span>{member.active ? "Pasife Al" : "Aktife Al"}</span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-border/60">
            {members.map((member) => {
              const isStaff = member.role === "STAFF";
              const isToggling = togglingId === member.id;
              const canManageServices =
                member.hasStaffProfile &&
                member.staffProfileId &&
                !(userRole === "ADMIN" && member.role === "OWNER");

              return (
                <div
                  key={member.id}
                  className={cn(
                    "p-4 space-y-3",
                    !member.active && "opacity-75 bg-muted/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base text-foreground truncate">
                          {member.userName}
                        </span>
                        <Badge
                          variant={
                            member.role === "OWNER"
                              ? "default"
                              : member.role === "ADMIN"
                              ? "secondary"
                              : "outline"
                          }
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium",
                            member.role === "OWNER" && "bg-amber-600 hover:bg-amber-600/90 text-white",
                            member.role === "ADMIN" && "bg-blue-600 hover:bg-blue-600/90 text-white"
                          )}
                        >
                          {member.role === "OWNER"
                            ? "İşletme Sahibi"
                            : member.role === "ADMIN"
                            ? "Yönetici"
                            : "Personel"}
                        </Badge>
                        <Badge
                          variant={member.active ? "default" : "outline"}
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium",
                            member.active
                              ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                              : "text-muted-foreground"
                          )}
                        >
                          {member.active ? "Aktif" : "Pasif"}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span>{member.userEmail}</span>
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {member.hasStaffProfile ? (
                        <div className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-900">
                          <Calendar className="h-3 w-3" />
                          <span>Randevuya Açık</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                          <span>Takvimsiz</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {canManageServices && (
                        <Link
                          href={`/dashboard/staff/${member.staffProfileId}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-9 min-h-[44px] text-xs px-3"
                          )}
                        >
                          <span>Hizmetleri Yönet</span>
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>

                    {isStaff && (
                      <Button
                        variant={member.active ? "outline" : "secondary"}
                        size="sm"
                        onClick={() => handleToggleMember(member)}
                        disabled={isToggling}
                        className="h-9 min-h-[44px] text-xs px-3"
                      >
                        {isToggling ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Power className="mr-1 h-3.5 w-3.5" />
                            <span>{member.active ? "Pasife Al" : "Aktife Al"}</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
