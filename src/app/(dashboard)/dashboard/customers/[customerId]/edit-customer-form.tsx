"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateCustomerProfileAction } from "@/actions/customer.actions";
import { useRouter } from "next/navigation";

export function EditCustomerForm({
  customerId,
  initialData,
}: {
  customerId: string;
  initialData: { firstName: string; lastName: string | null; phone: string };
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [formData, setFormData] = useState({
    firstName: initialData.firstName,
    lastName: initialData.lastName || "",
    phone: initialData.phone,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await updateCustomerProfileAction(customerId, formData);
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setIsEditing(false);
    setLoading(false);
    router.refresh();
  };

  if (!isEditing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
        Müşteri Bilgilerini Düzenle
      </Button>
    );
  }

  return (
    <div className="mt-4 p-4 border border-border rounded-lg bg-muted/20">
      <h3 className="font-semibold text-foreground mb-4">Müşteri Bilgilerini Düzenle</h3>
      {error && (
        <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 rounded-md">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Ad</label>
            <Input
              required
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              placeholder="Ahmet"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Soyad</label>
            <Input
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              placeholder="Yılmaz"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-foreground">Telefon</label>
            <Input
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="0555 123 45 67"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} disabled={loading}>
            İptal
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
