import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getDuplicateCandidatesAction } from "@/actions/customer.actions";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { DuplicateMergeWorkflow } from "./duplicate-merge-workflow";

export default async function DuplicateCustomersPage() {
  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: OWNER & ADMIN only. STAFF is strictly forbidden.
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const result = await getDuplicateCandidatesAction(currentMembership.business_id);
  const candidates = result.success && result.data ? result.data : [];
  const reviewGroups = candidates.map((cluster) => ({
    confidence: cluster.confidence,
    reason: cluster.reason,
    customers: cluster.customers.map((customer) => ({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      createdAt: customer.createdAt,
      appointmentCount: customer.appointmentCount,
      lastAppointmentDate: customer.lastAppointmentDate,
    })),
  }));

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Top navigation & header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard/customers"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Müşterilere Dön</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Olası Tekrarlanan Kayıtlar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Farklı telefon formatları veya benzer verilerle birden fazla kez açılmış olabilecek müşteri kayıtlarını inceleyin.
          </p>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Kontrollü Birleştirme
          </p>
          <p>
            Sistem hiçbir kaydı otomatik olarak birleştirmez. Kayıtları inceleyin,
            birincil müşteriyi açıkça seçin ve sonuçları onaylayın. Eski
            randevular, notlar ve müşteri kayıtları korunur.
          </p>
        </div>
      </div>

      {/* Candidate Groups */}
      {candidates.length === 0 ? (
        <Card className="border-border shadow-xs">
          <CardContent className="p-12 text-center flex flex-col items-center justify-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="font-semibold text-foreground text-base">
                Henüz olası tekrar bulunmuyor
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                İşletmenizde aynı telefon numarasının farklı biçimleriyle kaydedilmiş mükerrer müşteri kaydı tespit edilmedi. Tüm kayıtlar tekil standartlara uygundur.
              </p>
            </div>
            <Link
              href="/dashboard/customers"
              className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2 text-xs" })}
            >
              Müşteri Rehberine Dön
            </Link>
          </CardContent>
        </Card>
      ) : <DuplicateMergeWorkflow groups={reviewGroups} />}
    </div>
  );
}
