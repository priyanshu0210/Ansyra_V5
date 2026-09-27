// Avatar disc: renders the uploaded image when present, else a themed initial.
export function Avatar({
  name,
  url,
  size = 36,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
}) {
  const initial = (name || "U")[0]?.toUpperCase() ?? "U";
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? "Avatar"}
        width={size}
        height={size}
        data-testid="avatar-image"
        className="rounded-full object-cover"
        style={{ width: size, height: size, border: "1px solid var(--fg-rule)" }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center rounded-full font-serif"
      data-testid="avatar-initial"
      /* The monogram is floored at 12px. `size * 0.4` alone put it at 10.4px in
         the 26px nav pill, under the scale's floor — and a letterform is the
         one place a fraction of a pixel shows, because there is no word shape
         to read it from. 12 in a 26px disc still leaves the ring intact. */
      style={{
        width: size,
        height: size,
        fontSize: Math.max(12, size * 0.4),
        background: "var(--dashboard-action, var(--fg))",
        color: "var(--fg-surface)",
      }}
    >
      {initial}
    </div>
  );
}
