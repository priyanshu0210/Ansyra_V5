import { Link } from "react-router";

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--clear)" }}
    >
      <div
        className="w-full max-w-md rounded-sm border p-10 text-center"
        style={{ background: "var(--fg-surface)", borderColor: "var(--fg-rule)" }}
      >
        <p className="ansyra-label" style={{ color: "var(--fg-2)" }}>Ansyra</p>
        <h1 className="mt-3 font-serif text-6xl" style={{ color: "var(--fg)" }}>404</h1>
        <p className="mt-2 font-sans text-sm" style={{ color: "var(--fg-2)" }}>This page is not in the sketchbook.</p>
        <Link
          to="/"
          className="mt-8 inline-block rounded-full px-6 py-3 font-sans text-sm"
          style={{ background: "var(--fg)", color: "var(--clear)" }}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
