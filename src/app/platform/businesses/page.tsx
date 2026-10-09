import { requirePlatformAdmin } from "@/lib/auth/guards";
import { PlatformAdminService } from "@/services/platform-admin.service";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Store, Search, ChevronRight, Building2, Calendar, MapPin } from "lucide-react";

export const metadata = {
  title: "İşletmeler - Platform",
};

export default async function PlatformBusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams.page || "1", 10);
  const search = resolvedSearchParams.q || "";
  let filterActive: boolean | undefined = undefined;

  if (resolvedSearchParams.status === "active") filterActive = true;
  if (resolvedSearchParams.status === "inactive") filterActive = false;

  const result = await PlatformAdminService.listBusinesses({
    page: isNaN(page) || page < 1 ? 1 : page,
    limit: 20,
    search: search.trim() || undefined,
    filterActive,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">İşletme Rehberi</h1>
          <p className="text-muted-foreground mt-1">Sistemdeki tüm işletmeleri görüntüleyin ve yönetin.</p>
        </div>
        <Link 
          href="/platform/businesses/new" 
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4 whitespace-nowrap w-full sm:w-auto shrink-0"
        >
          Yeni İşletme Oluştur
        </Link>
      </div>

      {/* Filters and Search Toolbar */}
      <div className="bg-card border border-border/60 rounded-xl p-4 shadow-sm">
        <form className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              name="q"
              defaultValue={search}
              placeholder="İşletme adı veya adresi ile arayın..."
              className="w-full pl-9 h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <select
              name="status"
              defaultValue={resolvedSearchParams.status || "all"}
              className="h-10 w-full sm:w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 appearance-none cursor-pointer"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="active">Aktif İşletmeler</option>
              <option value="inactive">Pasif İşletmeler</option>
            </select>
            <button
              type="submit"
              className="h-10 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-xs shrink-0"
            >
              Filtrele
            </button>
          </div>
        </form>
      </div>

      {/* Empty State */}
      {result.data.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-xl p-12 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <Store className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">İşletme Bulunamadı</h3>
          <p className="text-muted-foreground mt-2 max-w-md">
            Arama kriterlerinize uygun işletme bulunamadı. Lütfen filtreleri değiştirerek tekrar deneyin.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Cards (Visible only on small screens) */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {result.data.map((biz) => (
              <Link
                key={biz.id}
                href={`/platform/businesses/${biz.id}`}
                className="bg-card border border-border/60 rounded-xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground line-clamp-1">{biz.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">/{biz.slug}</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                      biz.active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    }`}
                  >
                    {biz.active ? "Aktif" : "Pasif"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-3 mt-1">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{format(new Date(biz.createdAt), "d MMM yyyy", { locale: tr })}</span>
                  </div>
                  <div className="flex items-center text-indigo-600 dark:text-indigo-400 font-medium group-hover:underline">
                    Yönet <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop Table (Hidden on small screens) */}
          <div className="hidden md:block bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border/60">
                  <tr>
                    <th className="px-6 py-4 font-semibold">İşletme Bilgileri</th>
                    <th className="px-6 py-4 font-semibold">Durum</th>
                    <th className="px-6 py-4 font-semibold">Kayıt Tarihi</th>
                    <th className="px-6 py-4 font-semibold text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {result.data.map((biz) => (
                    <tr key={biz.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{biz.name}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              /{biz.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${
                            biz.active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                              : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${biz.active ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                          {biz.active ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(biz.createdAt), "d MMM yyyy, HH:mm", { locale: tr })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/platform/businesses/${biz.id}`}
                          className="inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        >
                          Yönet
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <span className="text-sm text-muted-foreground order-2 sm:order-1">
                Toplam <span className="font-semibold text-foreground">{result.total}</span> işletmeden{" "}
                <span className="font-semibold text-foreground">{((result.page - 1) * result.limit) + 1}</span>-
                <span className="font-semibold text-foreground">{Math.min(result.page * result.limit, result.total)}</span> arası gösteriliyor
              </span>
              <div className="flex items-center gap-1 order-1 sm:order-2 bg-card border border-border/60 rounded-lg p-1 shadow-sm">
                {Array.from({ length: result.totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  const params = new URLSearchParams();
                  if (search) params.set("q", search);
                  if (resolvedSearchParams.status) params.set("status", resolvedSearchParams.status);
                  params.set("page", pageNum.toString());
                  
                  return (
                    <Link
                      key={pageNum}
                      href={`/platform/businesses?${params.toString()}`}
                      className={`h-8 min-w-[32px] flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                        pageNum === result.page
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {pageNum}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
