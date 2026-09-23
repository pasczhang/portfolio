"use client";

export function Toast({
  message,
  tone = "ok",
}: {
  message: string | null;
  tone?: "ok" | "error";
}) {
  if (!message) return null;
  const cls =
    tone === "error"
      ? "border-red-500/40 bg-red-950/90 text-red-100"
      : "border-emerald-500/40 bg-emerald-950/90 text-emerald-100";
  return (
    <div
      role="status"
      className={`fixed bottom-4 right-4 z-[60] rounded-md border px-4 py-3 text-sm shadow-lg ${cls}`}
    >
      {message}
    </div>
  );
}
