"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, Filter, X, Loader2 } from "lucide-react";

interface BusinessListToolbarProps {
  initialSearch?: string;
  initialHealthStatus?: string;
}

export function BusinessListToolbar({
  initialSearch = "",
  initialHealthStatus = "ALL",
}: BusinessListToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(initialSearch);
  const [healthStatus, setHealthStatus] = useState(initialHealthStatus);

  const handleFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());

    if (search.trim()) {
      params.set("search", search.trim());
    } else {
      params.delete("search");
    }

    if (healthStatus && healthStatus !== "ALL") {
      params.set("healthStatus", healthStatus);
    } else {
      params.delete("healthStatus");
    }

    // Reset to page 1 on filter change
    params.delete("page");

    startTransition(() => {
      router.push(`/platform/businesses?${params.toString()}`);
    });
  };

  const handleClear = () => {
    setSearch("");
    setHealthStatus("ALL");
    startTransition(() => {
      router.push("/platform/businesses");
    });
  };

  const hasActiveFilters = Boolean(search.trim() || (healthStatus && healthStatus !== "ALL"));

  return (
    <form
      onSubmit={handleFilter}
      className="bg-card border border-border/80 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
      data-testid="business-list-toolbar"
    >
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="İşletme adı veya uzantısı ile arayın..."
          className="w-full pl-9 pr-4 h-10 rounded-lg border border-input bg-background text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          data-testid="search-input"
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:w-48">
          <select
            value={healthStatus}
            onChange={(e) => {
              setHealthStatus(e.target.value);
            }}
            className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
            data-testid="health-status-filter"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="HEALTHY">Sağlıklı</option>
            <option value="ATTENTION">Dikkat Gerekiyor</option>
            <option value="SUSPENDED">Askıya Alınmış</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-xs shrink-0 flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
          data-testid="filter-submit-btn"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Filter className="w-4 h-4" />
          )}
          <span>Filtrele</span>
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            className="h-10 px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm font-medium hover:bg-muted transition-colors shrink-0 flex items-center gap-1 cursor-pointer min-h-[44px]"
            title="Filtreleri Temizle"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Temizle</span>
          </button>
        )}
      </div>
    </form>
  );
}
