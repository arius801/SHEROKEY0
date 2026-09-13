import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useApp, api, isStaff, store, currentCartItems } from "../state/store";
import { LANGS } from "../lib/i18n";
import { CURRENCIES, formatDate } from "../lib/money";
import { Btn, Badge, Dropdown, DropItem, Modal, ToastHost } from "./ui";
import {
  IKey, ISearch, ICart, IHeart, IBell, IMail, IUser, IMenu, IX, IGlobe, ICoins, ISun, IMoon,
  ILogout, IGrid, IChevronD, ICheck, IBolt, ILifebuoy, IShield, IStripe, IPaypal, IWrench, ITerminal,
} from "./icons";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group" aria-label="SHEROKEY home">
      <span className="w-9 h-9 rounded-xl bg-volt-500/12 border border-volt-500/30 flex items-center justify-center text-volt-400 group-hover:bg-volt-500 group-hover:text-[#062b1b] transition-all duration-200">
        <IKey size={18} />
      </span>
      <span className="font-display font-extrabold text-[15px] tracking-tight leading-none hidden min-[400px]:block">
        SHERO<span className="text-volt-400">KEY</span>
        <span className="block text-[8.5px] font-bold tracking-[0.28em] text-faint mt-0.5 uppercase">Digital Vault</span>
      </span>
    </Link>
  );
}

function LangSwitch({ compact }: { compact?: boolean }) {
  const { ui, dir } = useApp();
  const active = LANGS.find((l) => l.code === ui.lang)!;
  return (
    <Dropdown width="w-44" trigger={() => (
      <button className={`flex items-center gap-1.5 text-[12.5px] font-bold text-dim hover:text-fog transition ${compact ? "py-2" : "py-1.5"}`}>
        <IGlobe size={14} /> {active.label} <IChevronD size={12} />
      </button>
    )}>
      {(close) => LANGS.map((l) => (
        <DropItem key={l.code} onClick={() => { store.setLang(l.code); close(); }}>
          <span className="flex-1">{l.label}</span>
          <span className="text-[10px] text-faint uppercase">{l.dir}</span>
          {ui.lang === l.code && <ICheck size={13} className="text-volt-400" />}
        </DropItem>
      ))}
    </Dropdown>
  );
}

function CurrencySwitch() {
  const { ui, db } = useApp();
  return (
    <Dropdown width="w-52" trigger={() => (
      <button className="flex items-center gap-1.5 text-[12.5px] font-bold text-dim hover:text-fog transition py-1.5">
        <ICoins size={14} /> {ui.currency} <IChevronD size={12} />
      </button>
    )}>
      {(close) => db.settings.currencies.map((c) => (
        <DropItem key={c} onClick={() => { store.setCurrency(c); close(); }}>
          <span className="font-mono text-[12px] w-9">{c}</span>
          <span className="flex-1">{CURRENCIES[c].label}</span>
          {ui.currency === c && <ICheck size={13} className="text-volt-400" />}
        </DropItem>
      ))}
    </Dropdown>
  );
}

function NotifBell() {
  const { db, user, t } = useApp();
  const nav = useNavigate();
  if (!user) return null;
  const mine = db.notifications.filter((n) => n.userId === user.id);
  const unread = mine.filter((n) => !n.read).length;
  return (
    <Dropdown width="w-80" trigger={() => (
      <button className="relative w-9 h-9 rounded-[10px] border border-line bg-raise text-dim hover:text-fog hover:border-edge flex items-center justify-center transition" aria-label={t("a.notifs")}>
        <IBell size={16} />
        {unread > 0 && <span className="absolute -top-1.5 -end-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-volt-500 text-[#062b1b] text-[10px] font-extrabold flex items-center justify-center tabular-nums">{unread}</span>}
      </button>
    )}>
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <span className="text-[13px] font-bold">{t("a.notifs")}</span>
            {unread > 0 && <button onClick={() => api.markAllRead()} className="text-[11.5px] font-bold text-volt-400 hover:underline">{t("a.markRead")}</button>}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {mine.length === 0 && <p className="text-sm text-dim px-4 py-8 text-center">{t("a.noNotifs")}</p>}
            {mine.slice(0, 8).map((n) => (
              <button key={n.id} onClick={() => { api.markRead(n.id); if (n.link) nav(n.link); close(); }}
                className={`w-full flex gap-3 px-4 py-3 text-start border-b border-line/60 hover:bg-raise transition ${n.read ? "opacity-60" : ""}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-edge" : "bg-volt-500"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-snug">{t(n.type, n.vars)}</span>
                  <span className="block text-[11px] text-faint mt-0.5">{formatDate(n.createdAt, uiLang())}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
const uiLang = () => store.ui.lang;

function Mailbox() {
  const { db, user, t } = useApp();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  if (!user) return null;
  const mine = db.emailLogs.filter((e) => e.to === user.email || (user.role !== "CUSTOMER" && false));
  const selected = mine.find((e) => e.id === sel);
  return (
    <>
      <button onClick={() => { setOpen(true); setSel(null); }}
        className="relative w-9 h-9 rounded-[10px] border border-line bg-raise text-dim hover:text-fog hover:border-edge flex items-center justify-center transition" aria-label={t("hdr.mailbox")}>
        <IMail size={16} />
        {mine.length > 0 && <span className="absolute -top-1.5 -end-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-sky-500 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">{mine.length}</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={<span className="flex items-center gap-2"><IMail size={15} className="text-sky-400" /> {t("hdr.mailbox")} — {user.email}</span>} wide>
        {!selected ? (
          <div className="space-y-1.5">
            {mine.length === 0 && <p className="text-sm text-dim text-center py-10">{t("a.noNotifs")}</p>}
            {mine.map((e) => (
              <button key={e.id} onClick={() => setSel(e.id)} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-line hover:border-edge bg-canvas transition text-start">
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${e.status === "SENT" ? "bg-volt-500/12 text-volt-400" : "bg-danger-500/12 text-danger-400"}`}><IMail size={15} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold truncate">{e.subject}</span>
                  <span className="block text-[11.5px] text-faint">{e.type} · {formatDate(e.createdAt, e.lang)} · {e.status}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <button onClick={() => setSel(null)} className="text-[12px] font-bold text-volt-400 hover:underline mb-3">← {t("c.back")}</button>
            <div className="rounded-xl border border-line overflow-hidden">
              <div className="bg-[#0b1a14] border-b border-line px-5 py-6 text-center">
                <span className="inline-flex items-center gap-2 font-display font-extrabold text-volt-400"><IKey size={17} /> SHERO<span>KEY</span></span>
              </div>
              <div className="px-5 py-6 bg-panel text-sm leading-relaxed space-y-3">
                <p className="font-semibold">{t("mail.hello", { name: selected.toName })}</p>
                <p className="text-dim">{t("mail.thanks")} <strong className="text-fog">{selected.subject}</strong></p>
                {selected.sandboxCode && (
                  <div className="rounded-lg border border-ember-500/30 bg-ember-500/8 p-3.5 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-ember-400 mb-1">Sandbox delivery</p>
                    <p className="font-mono text-2xl font-extrabold tracking-[0.35em]" dir="ltr">{selected.sandboxCode}</p>
                  </div>
                )}
                <div className="rounded-lg bg-canvas border border-line p-3.5 font-mono text-[12px] text-dim" dir="ltr">
                  provider: {selected.provider} · lang: {selected.lang} · status: {selected.status}
                </div>
                <p><span className="inline-flex items-center gap-2 bg-volt-500 text-[#062b1b] font-bold text-[13px] rounded-lg px-4 py-2">{t("mail.viewOrder")}</span></p>
                <p className="text-[11.5px] text-faint pt-2 border-t border-line">{t("mail.foot")}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function AccountMenu() {
  const { user, t } = useApp();
  const nav = useNavigate();
  if (!user) return null;
  return (
    <Dropdown width="w-56" trigger={() => (
      <button className="flex items-center gap-2 h-9 ps-1.5 pe-2.5 rounded-[10px] border border-line bg-raise hover:border-edge transition">
        <span className="w-6.5 h-6.5 rounded-lg bg-volt-500/15 text-volt-400 flex items-center justify-center text-[11px] font-extrabold">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden lg:block text-[12.5px] font-bold max-w-24 truncate">{user.name.split(" ")[0]}</span>
        <IChevronD size={12} className="text-faint hidden lg:block" />
      </button>
    )}>
      {(close) => (
        <div className="py-1">
          <div className="px-3.5 py-2.5 border-b border-line">
            <p className="text-[13px] font-bold truncate">{user.name}</p>
            <p className="text-[11px] text-faint truncate">{user.email}</p>
            <Badge tone={user.role === "CUSTOMER" ? "dim" : "volt"} className="mt-1.5">{user.role}</Badge>
          </div>
          <DropItem onClick={() => { nav("/account/orders"); close(); }}><IGrid size={14} /> {t("a.orders")}</DropItem>
          <DropItem onClick={() => { nav("/account/keys"); close(); }}><IKey size={14} /> {t("a.keys")}</DropItem>
          <DropItem onClick={() => { nav("/account/wishlist"); close(); }}><IHeart size={14} /> {t("a.wishlist")}</DropItem>
          <DropItem onClick={() => { nav("/support"); close(); }}><ILifebuoy size={14} /> {t("a.tickets")}</DropItem>
          {isStaff(user) && <DropItem onClick={() => { nav("/admin"); close(); }}><ITerminal size={14} /> {t("ad.title")}</DropItem>}
          <DropItem onClick={() => { nav("/account/profile"); close(); }}><IUser size={14} /> {t("a.profile")}</DropItem>
          <DropItem danger onClick={() => { api.logout(); nav("/"); close(); }}><ILogout size={14} /> {t("au.logout")}</DropItem>
        </div>
      )}
    </Dropdown>
  );
}

function Header() {
  const { db, user, t } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [mobile, setMobile] = useState(false);
  const cartCount = currentCartItems().reduce((s, c) => s + c.qty, 0);
  const wishCount = user ? db.wishlist.filter((w) => w.userId === user.id).length : 0;

  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/catalog?q=${encodeURIComponent(q.trim())}`); };
  const navLink = ({ isActive }: { isActive: boolean }) =>
    `text-[13px] font-bold transition ${isActive ? "text-volt-400" : "text-dim hover:text-fog"}`;

  return (
    <header className="sticky top-0 z-[60]">
      <div className="bg-panel/85 backdrop-blur-xl border-b border-line">
        <div className="max-w-7xl mx-auto px-4">
          {/* utility strip */}
          <div className="hidden md:flex items-center justify-between h-9 border-b border-line/60 text-[12px]">
            <div className="flex items-center gap-2 text-faint font-semibold">
              <IBolt size={12} className="text-volt-400" />
              <span>{t("hdr.instant")} · Stripe · PayPal</span>
              {db.settings.maintenanceMode && <Badge tone="ember" className="ms-2">Maintenance</Badge>}
            </div>
            <div className="flex items-center gap-5">
              <LangSwitch />
              <CurrencySwitch />
              <button onClick={() => store.setTheme(uiTheme() === "dark" ? "light" : "dark")} className="text-dim hover:text-fog transition" aria-label={t("c.theme")}>
                {uiTheme() === "dark" ? <ISun size={14} /> : <IMoon size={14} />}
              </button>
            </div>
          </div>
          {/* main bar */}
          <div className="flex items-center gap-3 h-16">
            <button className="md:hidden w-9 h-9 rounded-[10px] border border-line flex items-center justify-center text-dim" onClick={() => setMobile(true)} aria-label={t("hdr.menu")}>
              <IMenu size={17} />
            </button>
            <Logo />
            <nav className="hidden md:flex items-center gap-6 ms-6" aria-label="Main">
              <NavLink to="/catalog" className={navLink}>{t("nav.catalog")}</NavLink>
              <NavLink to="/offers" className={navLink}>{t("nav.offers")}</NavLink>
              <NavLink to="/support" className={navLink}>{t("nav.support")}</NavLink>
              <NavLink to="/faq" className={navLink}>{t("nav.faq")}</NavLink>
            </nav>
            <form onSubmit={submit} className="hidden sm:block flex-1 max-w-md ms-auto" role="search">
              <div className="relative">
                <ISearch size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("hdr.search")}
                  className="sk-input ps-9 h-9.5 !rounded-full text-[13px] !bg-raise" />
              </div>
            </form>
            <div className="flex items-center gap-2 ms-auto sm:ms-0">
              {user && <Mailbox />}
              <NotifBell />
              <button onClick={() => nav(user ? "/account/wishlist" : "/auth/login")} aria-label={t("a.wishlist")}
                className="relative w-9 h-9 rounded-[10px] border border-line bg-raise text-dim hover:text-fog hover:border-edge hidden sm:flex items-center justify-center transition">
                <IHeart size={16} />
                {wishCount > 0 && <span className="absolute -top-1.5 -end-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-danger-500 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">{wishCount}</span>}
              </button>
              <button onClick={() => nav("/cart")} aria-label={t("cart.title")}
                className="relative w-9 h-9 rounded-[10px] border border-line bg-raise text-dim hover:text-fog hover:border-edge flex items-center justify-center transition">
                <ICart size={16} />
                {cartCount > 0 && <span className="absolute -top-1.5 -end-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-volt-500 text-[#062b1b] text-[10px] font-extrabold flex items-center justify-center tabular-nums anim-pop">{cartCount}</span>}
              </button>
              {user ? <AccountMenu /> : (
                <div className="hidden sm:flex items-center gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => nav("/auth/login")}>{t("au.login")}</Btn>
                  <Btn size="sm" onClick={() => nav("/auth/register")}>{t("au.register")}</Btn>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* mobile sheet */}
      {mobile && (
        <div className="fixed inset-0 z-[80] md:hidden">
          <div className="absolute inset-0 bg-black/60 anim-fade" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 start-0 w-[290px] bg-panel border-e border-line p-5 overflow-y-auto anim-slide flex flex-col gap-1">
            <div className="flex items-center justify-between mb-5">
              <Logo />
              <button onClick={() => setMobile(false)} className="text-dim p-1.5" aria-label={t("c.close")}><IX size={18} /></button>
            </div>
            <form className="mb-3" role="search" onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("mq") ?? "").trim();
              setMobile(false); nav(`/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`);
            }}>
              <div className="relative">
                <ISearch size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
                <input name="mq" placeholder={t("hdr.search")} aria-label={t("hdr.search")} className="sk-input ps-8 h-10 !rounded-full text-[13px]" />
              </div>
            </form>
            {[["/catalog", t("nav.catalog")], ["/offers", t("nav.offers")], ["/support", t("nav.support")], ["/faq", t("nav.faq")], ["/about", t("nav.about")]].map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setMobile(false)} className="px-3 py-2.5 rounded-lg text-sm font-bold text-dim hover:text-fog hover:bg-raise transition">{label}</Link>
            ))}
            {!user && (
              <div className="flex gap-2 mt-4">
                <Btn variant="soft" size="sm" className="flex-1" onClick={() => { nav("/auth/login"); setMobile(false); }}>{t("au.login")}</Btn>
                <Btn size="sm" className="flex-1" onClick={() => { nav("/auth/register"); setMobile(false); }}>{t("au.register")}</Btn>
              </div>
            )}
            <div className="mt-6 pt-5 border-t border-line space-y-3">
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-faint uppercase tracking-wider">{t("c.language")}</span><LangSwitch compact /></div>
              <div className="flex items-center justify-between"><span className="text-xs font-bold text-faint uppercase tracking-wider">{t("c.currency")}</span><CurrencySwitch /></div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-faint uppercase tracking-wider">{t("c.theme")}</span>
                <button onClick={() => store.setTheme(uiTheme() === "dark" ? "light" : "dark")} className="text-dim hover:text-fog"><ISun size={16} /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
const uiTheme = () => store.ui.theme;

function Footer() {
  const { db, t, user } = useApp();
  const year = new Date().getFullYear();
  const cols: [string, [string, string][]][] = [
    [t("f.products"), db.categories.map((c) => [`/catalog?cat=${c.slug}`, c.name.en] as [string, string])],
    [t("f.company"), [["/about", t("nav.about")], ["/support", t("f.contact")], ["/faq", t("nav.faq")]]],
    [t("f.legal"), [["/terms", t("f.terms")], ["/privacy", t("f.privacy")], ["/refunds", t("f.refunds")], ["/cookies", t("f.cookies")]]],
    [t("f.help"), [["/support", t("nav.support")], ["/account/orders", t("a.orders")], ["/account/keys", t("a.keys")], ["https://t.me/arius801", "Telegram @arius801"]]],
  ];
  return (
    <footer className="mt-20 border-t border-line bg-panel/50">
      <div className="max-w-7xl mx-auto px-4 py-14">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Logo />
            <p className="text-sm text-dim leading-relaxed mt-4 max-w-xs">{t("f.tagline")}</p>
            <div className="flex items-center gap-2 mt-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-faint">{t("f.payments")}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <span className="sk-chip"><IStripe size={13} className="text-sky-400" /> Stripe</span>
              <span className="sk-chip"><IPaypal size={13} className="text-sky-400" /> PayPal</span>
              <span className="sk-chip"><IShield size={13} className="text-volt-400" /> 3-D Secure</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {cols.map(([head, links]) => (
              <div key={head}>
                <h4 className="text-[11.5px] font-extrabold uppercase tracking-widest text-faint mb-3.5">{head}</h4>
                <ul className="space-y-2.5">
                  {links.map(([to, label]) => (
                    <li key={to + label}><Link to={user || !to.startsWith("/account") ? to : "/auth/login"} className="text-[13px] font-semibold text-dim hover:text-volt-400 transition">{label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-12 pt-6 border-t border-line">
          <p className="text-[12px] text-faint font-semibold">© {year} {db.settings.storeName}. {t("f.rights")}</p>
          <div className="flex items-center gap-4">
            <LangSwitch />
            <CurrencySwitch />
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { ui, db, t } = useApp();
  useEffect(() => {
    document.documentElement.lang = ui.lang;
    document.documentElement.dir = LANGS.find((l) => l.code === ui.lang)!.dir;
    document.documentElement.dataset.theme = ui.theme;
  }, [ui.lang, ui.theme]);
  return (
    <div className="min-h-screen flex flex-col sk-bg relative">
      <div className="fixed inset-0 pointer-events-none sk-grid-overlay" aria-hidden />
      <div className="fixed inset-0 pointer-events-none sk-noise opacity-60" aria-hidden />
      <div className="relative flex flex-col min-h-screen">
        <Header />
        {db.settings.maintenanceMode && (
          <div className="bg-ember-500/15 border-b border-ember-500/30 text-ember-400 text-[12.5px] font-bold text-center py-2 px-4">
            <IWrench size={12} className="inline me-1.5 -mt-0.5" /> {t("e.maintenance")}
          </div>
        )}
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <ToastHost />
    </div>
  );
}
