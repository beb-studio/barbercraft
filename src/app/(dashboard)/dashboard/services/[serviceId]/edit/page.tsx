import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Scissors } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getService } from "@/services/service.service";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ServiceForm } from "../../service-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EditServicePageProps {
  params: Promise<{
    serviceId: string;
  }>;
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const { serviceId } = await params;

  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: STAFF is strictly forbidden from service editing
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const [biz] = await db
    .select({
      id: businesses.id,
      currency: businesses.currency,
    })
    .from(businesses)
    .where(eq(businesses.id, currentMembership.business_id));

  // Retrieve service scoped to current business (tenant isolation)
  const service = await getService(currentMembership.business_id, serviceId);

  if (!service) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 w-full">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/services"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Hizmetlere Dön</span>
        </Link>
      </div>

      <Card className="border-border shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scissors className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Hizmeti Düzenle</CardTitle>
              <CardDescription className="text-xs">
                Hizmet adı, süresi veya fiyat bilgilerini güncelleyin.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-3">
          <ServiceForm
            mode="edit"
            serviceId={service.id}
            initialData={{
              name: service.name,
              description: service.description,
              durationMinutes: service.durationMinutes,
              price: service.price,
              active: service.active,
            }}
            currency={biz?.currency || "TRY"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
