import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// Optional browser error reporting (Phase 13.4). The SDK chunk is only ever
// downloaded when a DSN is configured; without one this is a no-op.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (sentryDsn) {
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        release: (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined,
        tracesSampleRate: 0,
      })
    })
    .catch(() => {
      /* monitoring must never break the app */
    })
}

// TRPCProvider deliberately does NOT wrap the tree here. Mounting it at the
// root put tRPC + react-query + superjson (~30 kB gzip) on the landing's
// critical path for a page that makes no queries. It now lives in the lazy
// `DataLayout` route in App.tsx, which every data-driven route sits under.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
