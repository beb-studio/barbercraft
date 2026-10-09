import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Sayfa Bulunamadı
      </h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Aradığınız sayfa silinmiş, adı değiştirilmiş veya geçici olarak kullanım dışı olabilir.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className={buttonVariants({ variant: "default" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}
