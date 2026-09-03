import { useEffect } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { store, useApp } from "./state/store";
import { Shell } from "./components/layout";
import Home from "./pages/home";
import Catalog from "./pages/catalog";
import ProductPage from "./pages/product";
import { CartPage, CheckoutPage, OrderResult } from "./pages/cart";
import Account from "./pages/account";
import { Login, Register, VerifySent, Verify, Forgot, Reset } from "./pages/auth";
import { Support, TicketThread, Faq } from "./pages/support";
import { AdminShell, AdminOverview, AdminOrders, AdminOrderDetail } from "./pages/admin";
import { AdminProducts, AdminKeys, AdminCoupons, AdminCustomers, AdminTickets, AdminEmails, AdminAudit, AdminSettings, AdminReviews } from "./pages/admin2";
import { LegalPage, NotFound } from "./pages/static";
import { IKey } from "./components/icons";

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

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

function TitleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/product/")) return; // product page manages its own SEO title
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

function AdminSection({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

export default function App() {
  const { ui } = useApp();
  useEffect(() => { store.init(); }, []);
  if (!ui.ready) return <Splash />;

  return (
    <HashRouter>
      <ScrollToTop />
      <TitleSync />
      <Shell>
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
          <Route path="/support" element={<Support />} />
          <Route path="/support/:id" element={<TicketThread />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/about" element={<LegalPage page="about" />} />
          <Route path="/terms" element={<LegalPage page="terms" />} />
          <Route path="/privacy" element={<LegalPage page="privacy" />} />
          <Route path="/refunds" element={<LegalPage page="refunds" />} />
          <Route path="/cookies" element={<LegalPage page="cookies" />} />

          <Route path="/admin" element={<AdminSection><AdminOverview /></AdminSection>} />
          <Route path="/admin/orders" element={<AdminSection><AdminOrders /></AdminSection>} />
          <Route path="/admin/orders/:id" element={<AdminSection><AdminOrderDetail /></AdminSection>} />
          <Route path="/admin/products" element={<AdminSection><AdminProducts /></AdminSection>} />
          <Route path="/admin/keys" element={<AdminSection><AdminKeys /></AdminSection>} />
          <Route path="/admin/coupons" element={<AdminSection><AdminCoupons /></AdminSection>} />
          <Route path="/admin/customers" element={<AdminSection><AdminCustomers /></AdminSection>} />
          <Route path="/admin/tickets" element={<AdminSection><AdminTickets /></AdminSection>} />
          <Route path="/admin/reviews" element={<AdminSection><AdminReviews /></AdminSection>} />
          <Route path="/admin/emails" element={<AdminSection><AdminEmails /></AdminSection>} />
          <Route path="/admin/audit" element={<AdminSection><AdminAudit /></AdminSection>} />
          <Route path="/admin/settings" element={<AdminSection><AdminSettings /></AdminSection>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </HashRouter>
  );
}
