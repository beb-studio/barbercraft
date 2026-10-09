import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getServices } from "@/services/service.service";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ServiceList } from "./service-list";

export default async function ServicesPage() {
  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: STAFF is strictly forbidden from service management
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const [biz] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      currency: businesses.currency,
    })
    .from(businesses)
    .where(eq(businesses.id, currentMembership.business_id));

  const serviceList = await getServices(currentMembership.business_id);

  return (
    <div className="space-y-6 w-full">
      {/* Top navigation & header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Panele Dön</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Hizmet Yönetimi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            İşletmenizde sunulan hizmetleri, süreleri ve ücretleri yönetin.
          </p>
        </div>
      </div>

      <ServiceList
        initialServices={serviceList}
        currency={biz?.currency || "TRY"}
      />
    </div>
  );
}
