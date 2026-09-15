import { Component, Suspense, lazy, useEffect, type ReactNode } from "react";
/* Real (history) routes for SEO (§23/§33). Static hosts use public/_redirects /
   .htaccess / vercel.json SPA fallback; production runs behind server/api.ts. */
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { store, useApp, SERVER_MODE } from "./state/store";
import { Shell } from "./components/layout";
import { IKey, IAlert } from "./components/icons";
import { tr } from "./lib/i18n";

/* Route-level code splitting (A28): each page tree loads on demand. */
const Home = lazy(() => import("./pages/home"));
const Catalog = lazy(() => import("./pages/catalog"));
const ProductPage = lazy(() => import("./pages/product"));
const CartPage = lazy(() => import("./pages/cart").then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import("./pages/cart").then((m) => ({ default: m.CheckoutPage })));
const OrderResult = lazy(() => import("./pages/cart").then((m) => ({ default: m.OrderResult })));
const Account = lazy(() => import("./pages/account"));
const Login = lazy(() => import("./pages/auth").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("./pages/auth").then((m) => ({ default: m.Register })));
const VerifySent = lazy(() => import("./pages/auth").then((m) => ({ default: m.VerifySent })));
const Verify = lazy(() => import("./pages/auth").then((m) => ({ default: m.Verify })));
const Forgot = lazy(() => import("./pages/auth").then((m) => ({ default: m.Forgot })));
const Reset = lazy(() => import("./pages/auth").then((m) => ({ default: m.Reset })));
const Support = lazy(() => import("./pages/support").then((m) => ({ default: m.Support })));
const TicketThread = lazy(() => import("./pages/support").then((m) => ({ default: m.TicketThread })));
const Faq = lazy(() => import("./pages/support").then((m) => ({ default: m.Faq })));
const AdminOverview = lazy(() => import("./pages/admin").then((m) => ({ default: m.AdminOverview })));
const AdminOrders = lazy(() => import("./pages/admin").then((m) => ({ default: m.AdminOrders })));
const AdminOrderDetail = lazy(() => import("./pages/admin").then((m) => ({ default: m.AdminOrderDetail })));
const Admin2 = (name: string) => lazy(() => import("./pages/admin2").then((m) => ({ default: (m as Record<string, unknown>)[name] as React.ComponentType })));
const AdminProducts = Admin2("AdminProducts");
const AdminKeys = Admin2("AdminKeys");
const AdminCoupons = Admin2("AdminCoupons");
const AdminCategories = Admin2("AdminCategories");
const AdminCustomers = Admin2("AdminCustomers");
const AdminTickets = Admin2("AdminTickets");
const AdminEmails = Admin2("AdminEmails");
const AdminAudit = Admin2("AdminAudit");
const AdminSettings = Admin2("AdminSettings");
const AdminReviews = Admin2("AdminReviews");
const AdminPayments = Admin2("AdminPayments");
const AdminShellLazy = lazy(() => import("./pages/admin").then((m) => ({ default: m.AdminShell })));
const LegalPage = lazy(() => import("./pages/static").then((m) => ({ default: m.LegalPage })));
const NotFound = lazy(() => import("./pages/static").then((m) => ({ default: m.NotFound })));

function Splash() {
  return (
    <div className="min-h-screen sk-bg flex items-center justify-center">
      <div className="text-center anim-fade-up">
        <span className="inline-flex w-16 h-16 rounded-2xl bg-volt-500/12 border border-volt-500/30 text-volt-400 items-center justify-center mb-5">
          <IKey size={30} className="anim-pulse-dot" />
        </span>
        <p className="font-display font-extrabold text-lg tracking-tight">SHERO<span className="text-volt-400">KEY</span></p>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-faint mt-2">opening the vault…</p>
      </div>
    </div>
  );
}

/** Rendered when initialization itself failed (corrupted workspace, storage blocked…) — A29. */
function InitError() {
  const lang = store.ui.lang;
  const t = (k: string) => tr(lang, k);
  return (
    <div className="min-h-screen sk-bg flex items-center justify-center px-4">
      <div className="sk-card max-w-md w-full p-8 text-center anim-fade-up" role="alert">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-danger-500/12 border border-danger-500/30 text-danger-400 items-center justify-center mb-5">
          <IAlert size={24} />
        </span>
        <h1 className="font-display text-lg font-extrabold mb-2">SHEROKEY</h1>
        <p className="text-sm text-dim leading-relaxed mb-6">
          {store.ui.initError === "PRODUCTION_API_REQUIRED" ? t("init.apiRequired")
            : store.ui.initError === "SERVER_UNREACHABLE" ? t("init.unreachable")
            : t("init.failed")}
        </p>
        <div className="flex gap-2.5 justify-center">
          <button onClick={() => { void store.retryInit(); }}
            className="bg-volt-500 hover:bg-volt-400 text-[#062b1b] font-bold text-[13px] rounded-[10px] px-5 py-2.5 transition">
            {t("init.retry")}
          </button>
          {!SERVER_MODE && (
            <button onClick={() => { void store.resetWorkspace(); }}
              className="border border-line hover:border-edge text-dim hover:text-fog font-bold text-[13px] rounded-[10px] px-5 py-2.5 transition">
              {t("init.reset")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Catches unexpected runtime errors per mounted tree so one bad route never blanks the app — A29. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      const lang = store.ui.lang;
      return (
        <div className="max-w-2xl mx-auto px-4 py-24 text-center">
          <span className="inline-flex w-14 h-14 rounded-2xl bg-danger-500/12 border border-danger-500/30 text-danger-400 items-center justify-center mb-5">
            <IAlert size={24} />
          </span>
          <h1 className="font-display text-xl font-extrabold mb-2">{tr(lang, "e.500t")}</h1>
          <p className="text-sm text-dim mb-6">{tr(lang, "e.500d")}</p>
          <button onClick={() => { this.setState({ failed: false }); window.location.href = "/"; }}
            className="bg-volt-500 hover:bg-volt-400 text-[#062b1b] font-bold text-[13px] rounded-[10px] px-5 py-2.5 transition">
            {tr(lang, "c.back")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

function TitleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/product/")) return; // product page manages its own SEO metadata
    const map: Record<string, string> = {
      "/": "SHEROKEY — Digital Keys, Licenses & Subscriptions",
      "/catalog": "Catalog — SHEROKEY", "/offers": "Offers & Deals — SHEROKEY",
      "/cart": "Cart — SHEROKEY", "/checkout": "Checkout — SHEROKEY",
      "/auth/login": "Log in — SHEROKEY", "/auth/register": "Create account — SHEROKEY",
      "/admin": "Admin Console — SHEROKEY", "/support": "Help Center — SHEROKEY", "/faq": "FAQ — SHEROKEY",
    };
    document.title = map[pathname] ?? "SHEROKEY — Digital Keys, Licenses & Subscriptions";
  }, [pathname]);
  return null;
}

export default function App() {
  const { ui } = useApp(); // null-safe before init (A1) — no db access on this path
  useEffect(() => { void store.init(); }, []); // idempotent: StrictMode-safe, refresh-safe

  if (ui.initError) return <InitError />;
  if (!ui.ready) return <Splash />;

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <TitleSync />
        <Shell>
          <ErrorBoundary>
            <Suspense fallback={<div className="min-h-[60vh]"><Splash /></div>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/offers" element={<Catalog offersOnly />} />
                <Route path="/product/:slug" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order/:id" element={<OrderResult />} />
                <Route path="/account" element={<Account />} />
                <Route path="/account/:tab" element={<Account />} />
                <Route path="/account/orders/:id" element={<Account />} />
                <Route path="/auth/login" element={<Login />} />
                <Route path="/auth/register" element={<Register />} />
                <Route path="/auth/verify-sent" element={<VerifySent />} />
                <Route path="/auth/forgot" element={<Forgot />} />
                <Route path="/auth/reset" element={<Reset />} />
                <Route path="/verify" element={<Verify />} />
                <Route path="/verify-email" element={<Verify />} />
                <Route path="/support" element={<Support />} />
                <Route path="/support/:id" element={<TicketThread />} />
                <Route path="/faq" element={<Faq />} />
                <Route path="/about" element={<LegalPage page="about" />} />
                <Route path="/terms" element={<LegalPage page="terms" />} />
                <Route path="/privacy" element={<LegalPage page="privacy" />} />
                <Route path="/refunds" element={<LegalPage page="refunds" />} />
                <Route path="/cookies" element={<LegalPage page="cookies" />} />

                <Route path="/admin" element={<AdminShellLazy><AdminOverview /></AdminShellLazy>} />
                <Route path="/admin/orders" element={<AdminShellLazy><AdminOrders /></AdminShellLazy>} />
                <Route path="/admin/orders/:id" element={<AdminShellLazy><AdminOrderDetail /></AdminShellLazy>} />
                <Route path="/admin/products" element={<AdminShellLazy><AdminProducts /></AdminShellLazy>} />
                <Route path="/admin/keys" element={<AdminShellLazy><AdminKeys /></AdminShellLazy>} />
                <Route path="/admin/coupons" element={<AdminShellLazy><AdminCoupons /></AdminShellLazy>} />
                <Route path="/admin/categories" element={<AdminShellLazy><AdminCategories /></AdminShellLazy>} />
                <Route path="/admin/customers" element={<AdminShellLazy><AdminCustomers /></AdminShellLazy>} />
                <Route path="/admin/tickets" element={<AdminShellLazy><AdminTickets /></AdminShellLazy>} />
                <Route path="/admin/reviews" element={<AdminShellLazy><AdminReviews /></AdminShellLazy>} />
                <Route path="/admin/emails" element={<AdminShellLazy><AdminEmails /></AdminShellLazy>} />
                <Route path="/admin/audit" element={<AdminShellLazy><AdminAudit /></AdminShellLazy>} />
                <Route path="/admin/settings" element={<AdminShellLazy><AdminSettings /></AdminShellLazy>} />
                <Route path="/admin/payments" element={<AdminShellLazy><AdminPayments /></AdminShellLazy>} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Shell>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
