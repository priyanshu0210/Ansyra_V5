import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "@/hooks/useTheme"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// THE THEME COMES FROM THE APP, NOT FROM `next-themes`.
//
// This shipped as the stock shadcn wrapper, which reads next-themes. Ansyra has
// its own theme authority (`src/hooks/useTheme.ts` -> `data-theme` on <html>,
// dark by default, deliberately NOT following prefers-color-scheme). Reading
// next-themes here would have given every toast the wrong ground the moment the
// two disagreed — which is always, since nothing ever writes to next-themes.
//
// It also never mattered until now, because `<Toaster />` was not mounted
// anywhere: every `toast()` in the codebase would have been a silent no-op.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="ansyra-spin size-4" />,
      }}
      // PAINTED WITH THE APP'S MATERIAL, NOT THE STOCK SHADCN TOKENS.
      //
      // This shipped mapping was broken twice over, and invisibly, because
      // nothing mounted the Toaster to reveal it:
      //
      //   1. `--popover` in this project is `0 0% 100%` — a bare HSL TRIPLET,
      //      because shadcn's convention is `hsl(var(--popover))` at the point
      //      of use. Passed raw into `--normal-bg` it is not a valid colour, so
      //      the toast background resolved to `rgba(0,0,0,0)`: a shadow and
      //      some text floating over whatever was behind it.
      //   2. Those tokens are white in BOTH themes. Even wrapped in `hsl()` a
      //      toast would have been a white card on the teal dark ground.
      //
      // The dashboard already has a correct panel material and it is themed:
      // the same surface, hairline, radius and elevation `parchment/Card` uses.
      // A notification is a panel that arrives, so it should look like one.
      style={
        {
          "--normal-bg": "var(--fg-surface)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--fg-rule)",
          "--border-radius": "var(--r-node)",
          // Severity keeps the app's own vocabulary rather than sonner's
          // defaults, so a warning here is the same amber as a watch elsewhere.
          "--success-bg": "var(--fg-surface)",
          "--success-text": "var(--fg)",
          "--success-border": "color-mix(in srgb, var(--settle) 45%, var(--fg-rule))",
          "--warning-bg": "var(--fg-surface)",
          "--warning-text": "var(--fg)",
          "--warning-border": "color-mix(in srgb, var(--caustic) 45%, var(--fg-rule))",
          "--error-bg": "var(--fg-surface)",
          "--error-text": "var(--fg)",
          "--error-border": "color-mix(in srgb, var(--sev-flag) 45%, var(--fg-rule))",
          boxShadow: "var(--elev-2)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
