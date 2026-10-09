"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Edit2 } from "lucide-react";
import { addCustomerNoteAction, deleteCustomerNoteAction, updateCustomerNoteAction } from "@/actions/customer.actions";
import { useRouter } from "next/navigation";
import { formatInstantInBusinessTimezone } from "@/lib/timezone";

type Note = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorName: string | null;
};

export function CustomerNotes({
  customerId,
  initialNotes,
}: {
  customerId: string;
  initialNotes: Note[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const router = useRouter();

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    const result = await addCustomerNoteAction(customerId, newNote);
    if (!result.success) {
      setError(result.error);
    } else {
      setNewNote("");
      router.refresh();
      // Optimistically update or just rely on router.refresh
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Bu notu silmek istediğinize emin misiniz?")) return;
    const result = await deleteCustomerNoteAction(customerId, noteId);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  const startEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleUpdate = async () => {
    if (!editingNoteId || !editContent.trim()) return;
    setIsSubmitting(true);
    const result = await updateCustomerNoteAction(customerId, editingNoteId, editContent);
    if (result.success) {
      setEditingNoteId(null);
      setEditContent("");
      router.refresh();
    } else {
      alert(result.error);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Dahili Notlar</h3>
      </div>
      <p className="text-xs text-muted-foreground">Bu notlar yalnızca işletme yönetimi tarafından görüntülenir.</p>
      
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleAddNote} className="flex gap-2">
        <Input
          placeholder="Not Ekle..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          disabled={isSubmitting}
        />
        <Button type="submit" disabled={isSubmitting || !newNote.trim()}>
          Not Ekle
        </Button>
      </form>

      <div className="space-y-3 mt-4">
        {initialNotes.length === 0 ? (
          <div className="text-center py-8 bg-muted/20 border border-dashed rounded-lg">
            <p className="text-sm font-medium text-foreground">Henüz müşteri notu bulunmuyor.</p>
          </div>
        ) : (
          initialNotes.map((note) => (
            <div key={note.id} className="p-3 border border-border rounded-lg bg-card text-sm space-y-2">
              {editingNoteId === note.id ? (
                <div className="flex gap-2">
                  <Input
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    disabled={isSubmitting}
                    className="h-8"
                  />
                  <Button size="sm" onClick={handleUpdate} disabled={isSubmitting || !editContent.trim()}>Kaydet</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNoteId(null)} disabled={isSubmitting}>İptal</Button>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{note.content}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">{note.authorName}</span>
                      <span className="mx-1.5">•</span>
                      <span>{formatInstantInBusinessTimezone(new Date(note.createdAt), "Europe/Istanbul").displayStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => startEdit(note)} className="hover:text-foreground transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => handleDelete(note.id)} className="hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
