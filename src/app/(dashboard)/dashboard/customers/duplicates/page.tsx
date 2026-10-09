import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, AlertCircle, CheckCircle2, ExternalLink, Phone } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getDuplicateCandidatesAction } from "@/actions/customer.actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

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

      {/* Advisory Notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">
            Salt Okunur Önizleme & Güvenli Tespit
          </p>
          <p>
            Bu ekran, telefon numaralarının farklı yazım biçimlerini (örneğin 05xx, +905xx, 905xx) analiz ederek olası mükerrer kayıtları tespit eder. Sistem müşteri kayıtlarında <strong>otomatik birleştirme veya silme yapmaz</strong>. Müşteri birleştirme operasyonu sonraki aşamada (TASK 013C.2) sunulacaktır.
          </p>
        </div>
      </div>

      {/* Candidate Clusters List */}
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
      ) : (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
            <span>Tespit Edilen Olası Mükerrer Grup: {candidates.length}</span>
          </div>

          {candidates.map((cluster, idx) => (
            <Card key={cluster.comparisonKey || idx} className="border-border shadow-xs overflow-hidden">
              <CardHeader className="p-4 pb-3 bg-muted/30 border-b border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      {cluster.confidence === "HIGH" ? "Yüksek Güvenilirlik" : "Olası Eşleşme"}
                    </span>
                    <span className="text-xs text-foreground font-medium font-mono">
                      Anahtar: {cluster.comparisonKey}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {cluster.reason}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-4 divide-y divide-border/60">
                {cluster.customers.map((cust) => (
                  <div key={cust.id} className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 mt-0.5">
                        {cust.firstName[0]}
                        {(cust.lastName || "")[0] || ""}
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <span>{cust.firstName} {cust.lastName || ""}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 font-mono text-foreground font-medium">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {cust.phone}
                          </span>
                          {cust.normalizedPhone !== cust.phone && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              (Sistem: {cust.normalizedPhone})
                            </span>
                          )}
                          <span>•</span>
                          <span>Toplam {cust.appointmentCount} randevu</span>
                          {cust.lastAppointmentDate && (
                            <>
                              <span>•</span>
                              <span>
                                Son: {new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(cust.lastAppointmentDate))}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span>
                            Kayıt: {new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(cust.createdAt))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <Link
                        href={`/dashboard/customers/${cust.id}`}
                        target="_blank"
                        className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 text-xs cursor-pointer" })}
                      >
                        <span>Profili İncele</span>
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
