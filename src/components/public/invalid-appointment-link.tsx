import Link from "next/link";
import { Link2Off } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function InvalidAppointmentLink() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Link2Off className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
          Randevu Bağlantısı Kullanılamıyor
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base">
          Bu randevu bağlantısı geçersiz veya artık kullanılamıyor.
        </p>
        <Link
          href="/"
          className={buttonVariants({
            variant: "outline",
            className: "mt-7 h-11 w-full sm:w-auto",
          })}
        >
          Ana Sayfaya Dön
        </Link>
      </section>
    </main>
  );
}
