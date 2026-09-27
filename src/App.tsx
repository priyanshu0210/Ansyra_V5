import { Suspense, lazy } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router'
import { loadDealDetail } from './routes/preload'
import { ScrollToTop } from './components/ScrollToTop'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import Home from './pages/Home'

// Home is the landing route and stays EAGER — it is the first paint for every
// cold visitor, so putting it behind a dynamic import would cost it a round
// trip. Everything below is lazy.
//
// Before this split there was no code splitting at all: a visitor to `/`
// downloaded tRPC, Supabase, recharts, every Radix primitive and the whole
// dashboard tree before the hero could paint (488 kB gzip in one chunk against
// a 220 kB budget). Nothing in the landing imports the dashboard, so the seam
// is clean — see docs/refraction-outstanding.md §1.1.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const DealDetail = lazy(loadDealDetail)
const Profile = lazy(() => import('./pages/Profile'))
const ReportBug = lazy(() => import('./pages/ReportBug'))
const WhatsNew = lazy(() => import('./pages/WhatsNew'))
const Help = lazy(() => import('./pages/Help'))
const Login = lazy(() => import('./pages/Login'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ResetPasswordConfirm = lazy(() => import('./pages/ResetPasswordConfirm'))
const Welcome = lazy(() => import('./pages/Welcome'))
const LegalTerms = lazy(() => import('./pages/LegalTerms'))
const LegalPrivacy = lazy(() => import('./pages/LegalPrivacy'))
const ResearchArticle = lazy(() => import('./pages/ResearchArticle'))
const ToolDetail = lazy(() => import('./pages/ToolDetail'))
const NotFound = lazy(() => import('./pages/NotFound'))

// Owns the tRPC provider for every route that needs data — see DataLayout.tsx.
const DataLayout = lazy(() => import('./routes/DataLayout'))

// Give immediate feedback while a first-visit route chunk is arriving.
function RouteFallback() {
  const { pathname } = useLocation();
  const isDeal = pathname.startsWith("/dashboard/deals/");
  return (
    <div className="min-h-screen w-full" data-surface="operate" style={{ background: 'var(--clear)', color: 'var(--fg)' }} aria-busy="true">
      {isDeal && <header className="flex h-16 items-center border-b px-8" style={{ borderColor: 'var(--fg-rule)' }}>
        <Link to="/dashboard?tab=genome" className="font-sans text-sm">← Back to Deal Genome</Link>
      </header>}
      <main className="mx-auto max-w-3xl p-8">
        <p role="status" className="font-sans text-sm">{isDeal ? 'Opening deal…' : 'Opening page…'}</p>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <>
    {/* Sits inside the router, outside Routes: it must see every navigation,
        including ones that do not change which route element renders. */}
    <ScrollToTop />
    {/* ABOVE Suspense, so it catches a lazy import that rejects — including
        `DataLayout`, which every route but the landing sits under. Without it a
        single missing chunk unmounted the entire tree and left a blank ground. */}
    <RouteErrorBoundary>
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* The landing sits OUTSIDE DataLayout — that is what keeps the tRPC
          stack off its critical path. */}
      <Route path="/" element={<Home />} />

      {/* Pathless layout: adds no URL segment, so every path below is the same
          absolute path it has always been. */}
      <Route element={<DataLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/deals/:id" element={<DealDetail />} />
        <Route path="/dashboard/profile" element={<Profile />} />
        <Route path="/dashboard/report-bug" element={<ReportBug />} />
        <Route path="/dashboard/whats-new" element={<WhatsNew />} />
        <Route path="/dashboard/help" element={<Help />} />
        <Route path="/faq" element={<Help publicPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password/confirm" element={<ResetPasswordConfirm />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/legal/terms" element={<LegalTerms />} />
        <Route path="/legal/privacy" element={<LegalPrivacy />} />
        <Route path="/research/:slug" element={<ResearchArticle />} />
        <Route path="/platform/:slug" element={<ToolDetail />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
    </RouteErrorBoundary>
    </>
  )
}
