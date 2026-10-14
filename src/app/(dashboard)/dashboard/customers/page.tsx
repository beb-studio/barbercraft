import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Copy } from "lucide-react";
import { getMemberships } from "@/lib/auth/session";
import { getCustomerDirectoryAction } from "@/actions/customer.actions";
import { CustomerList } from "./customer-list";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const memberships = await getMemberships();
  const currentMembership = memberships[0];

  if (!currentMembership) {
    redirect("/onboarding");
  }

  // RBAC Boundary: STAFF is strictly forbidden from customer CRM directory
  if (currentMembership.role !== "OWNER" && currentMembership.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const { q, page } = await searchParams;
  const currentPage = page ? parseInt(page, 10) : 1;
  const search = q || undefined;

  const result = await getCustomerDirectoryAction(
    currentMembership.business_id,
    search,
    currentPage
  );

  if (!result.success) {
    return (
      <div className="p-6 text-center text-red-500">
        Hata: {result.error}
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full pb-10">
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <User className="h-6 w-6 text-primary" />
            Müşteriler
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            İşletmenizin müşteri rehberi ve randevu geçmişleri.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/customers/duplicates"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shadow-2xs"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Olası Tekrarlar</span>
          </Link>
        </div>
      </div>

      <CustomerList
        initialData={result.data || []}
        total={result.total || 0}
        currentPage={currentPage}
        limit={result.limit || 20}
        initialSearch={search || ""}
      />
    </div>
  );
}
