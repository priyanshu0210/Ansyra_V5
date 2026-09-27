import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { withToast } from "./parchment/notify";
import { relativeTime } from "@/lib/relative-time";
import { Card } from "./parchment/Card";
import { Textarea } from "./DealPipeline";

// Deal Comments (Phase 15.7) — a flat discussion thread on the dossier so team
// context lives next to the analyses. Org members see the whole thread; you can
// only edit/delete your own (the server enforces it in SQL — this UI just hides
// the controls). The model example of a minimal feature end to end.

export function DealComments({ dealId }: { dealId: number }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.comments.list.useQuery({ dealId });
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  const invalidate = () => {
    utils.comments.list.invalidate({ dealId });
    utils.activity.list.invalidate();
  };
  const add = trpc.comments.add.useMutation(withToast({ done: "Comment posted", failed: "Could not post that comment", silentOnSuccess: true }, {
    onSuccess: () => {
      invalidate();
      setBody("");
    },
  }));
  const edit = trpc.comments.edit.useMutation(withToast({ done: "Comment updated", failed: "Could not save that edit", silentOnSuccess: true }, {
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  }));
  const remove = trpc.comments.delete.useMutation(withToast({ done: "Comment deleted", failed: "Could not delete that comment" }, { onSuccess: invalidate }));

  const rows = list.data ?? [];

  return (
    <Card className="p-6" data-testid="deal-comments">
      <h3 className="font-serif text-xl font-light" style={{ color: "var(--fg)" }}>
        Discussion
      </h3>

      {rows.length === 0 && !list.isLoading && (
        <p className="mt-3 font-sans text-[13px]" style={{ color: "var(--fg-2)" }}>
          No comments yet. Notes here sit alongside every analysis — the context the next reader needs.
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {rows.map((c) => {
          const mine = c.createdBy === user?.id;
          const editing = editingId === c.id;
          return (
            <li key={c.id} data-testid={`comment-${c.id}`}>
              <div className="flex items-baseline gap-2">
                <span className="ansyra-label" style={{ color: "var(--fg-2)" }}>
                  {mine ? "You" : "Team"} · {relativeTime(c.createdAt)}
                  {c.editedAt ? " · edited" : ""}
                </span>
                {mine && !editing && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c.id);
                        setEditBody(c.body);
                      }}
                      className="font-sans text-[length:var(--step-xs)] underline-offset-4 hover:underline"
                      style={{ color: "var(--fg-2)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: c.id })}
                      className="font-sans text-[length:var(--step-xs)] underline-offset-4 hover:underline"
                      style={{ color: "var(--fg-2)" }}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>

              {editing ? (
                <div className="mt-1.5">
                  <Textarea value={editBody} onChange={setEditBody} rows={3} />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => editBody.trim() && edit.mutate({ id: c.id, body: editBody.trim() })}
                      disabled={edit.isPending || !editBody.trim()}
                      className="rounded-full px-4 py-1.5 font-sans text-[12px] disabled:opacity-50"
                      style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)" }}
                    >
                      {edit.isPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="font-sans text-[12px]"
                      style={{ color: "var(--fg-2)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="mt-1 whitespace-pre-line text-pretty font-sans text-[14px] leading-relaxed"
                  style={{ color: "var(--fg-2)", maxWidth: "62ch" }}
                >
                  {c.body}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--fg-rule)" }}>
        <Textarea value={body} onChange={setBody} rows={3} placeholder="Add a note for the deal team…" />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => body.trim() && add.mutate({ dealId, body: body.trim() })}
            disabled={add.isPending || !body.trim()}
            data-testid="post-comment"
            className="rounded-full px-6 py-2.5 font-sans text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--dashboard-action, var(--fg))", color: "var(--clear)", minHeight: 44 }}
          >
            {add.isPending ? "Posting…" : "Post"}
          </button>
          {body.length > 3500 && (
            <span className="font-mono text-[length:var(--step-xs)]" style={{ color: body.length > 4000 ? "var(--sev-flag)" : "var(--fg-2)" }}>
              {body.length}/4000
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
