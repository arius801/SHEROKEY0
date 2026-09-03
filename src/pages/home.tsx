import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp, stats, productSales, productRating } from "../state/store";
import { ProductCard, ProductRail } from "../components/product";
import { Badge, SectionHead, Stars, Btn } from "../components/ui";
import { IBolt, IKey, IShield, ILifebuoy, IArrowR, ITerminal, ICheck, IChevronsR, ISoft, IFilm, IGamepad, IVpn, IAi, ITrend, ICoins, IDb } from "../components/icons";
import { maskKey } from "../lib/money";

function timeAgo(ts: number): string {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

const maskName = (n: string) => n.split(" ").map((w) => w[0] + "•••").join(" ");

function DeliveryConsole() {
  const { db, t } = useApp();
  const feed = useMemo(() =>
    db.licenseKeys
      .filter((k) => (k.status === "DELIVERED" || k.status === "USED") && k.deliveredAt)
      .sort((a, b) => (b.deliveredAt! - a.deliveredAt!))
      .slice(0, 7)
      .map((k) => ({ k, p: db.products.find((p) => p.id === k.productId), c: db.users.find((u) => u.id === k.customerId) })),
  [db]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 2600);
    return () => clearInterval(id);
  }, []);
  const s = stats(db);
  const rotated = feed.length ? [...feed.slice(tick % feed.length), ...feed.slice(0, tick % feed.length)] : [];

  return (
    <div className="sk-card overflow-hidden relative">
      <div className="flex items-center justify-between px-4.5 py-3.5 border-b border-line bg-raise/60">
        <div className="flex items-center gap-2.5">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inline-flex w-full h-full rounded-full bg-volt-500 opacity-60 anim-pulse-dot" />
            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-volt-500" />
          </span>
          <span className="font-display text-[12px] font-bold tracking-wide uppercase">{t("h.live")}</span>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-faint"><ITerminal size={12} /> {t("h.feed")}</span>
      </div>
      <div className="relative">
        <div className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-volt-500/8 to-transparent pointer-events-none" style={{ animation: "skScan 4s linear infinite" }} />
        <div className="p-3 space-y-2 min-h-[286px]">
          {rotated.map(({ k, p, c }, i) => (
            <div key={k.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500 ${i === 0 ? "border-volt-500/35 bg-volt-500/6 anim-tick" : "border-line/70 bg-canvas/60 opacity-80"}`} style={{ opacity: 1 - i * 0.13 }}>
              <img src={p?.image} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold truncate">{p?.name.en}</p>
                <p className="text-[11px] text-faint truncate">
                  {t("h.deliveredTo")} <span className="text-dim font-semibold">{maskName(c?.name ?? "customer")}</span> · {timeAgo(k.deliveredAt!)}
                </p>
              </div>
              <code className="hidden sm:block font-mono text-[10.5px] text-volt-400/90 bg-[#0a2018] border border-volt-500/20 rounded-md px-2 py-1" dir="ltr">{maskKey(k.key)}</code>
              <ICheck size={14} className="text-volt-500 shrink-0" />
            </div>
          ))}
          {rotated.length === 0 && <p className="text-sm text-dim text-center py-16">—</p>}
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line rtl:divide-x-reverse border-t border-line text-center">
        {[
          { icon: <ICoins size={13} />, v: s.paymentsToday, l: t("h.paymentsToday") },
          { icon: <ILifebuoy size={13} />, v: s.pendingManual, l: t("h.pendingNow") },
          { icon: <IDb size={13} />, v: s.vaultKeys, l: t("h.vault") },
        ].map((x, i) => (
          <div key={i} className="py-3.5 px-1">
            <div className="flex items-center justify-center gap-1.5 text-volt-400 mb-1">{x.icon}<span className="font-display text-[15px] font-bold text-fog tabular-nums">{x.v}</span></div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-faint leading-tight">{x.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const CAT_ICONS = { software: ISoft, entertainment: IFilm, gaming: IGamepad, security: IVpn, ai: IAi };

export default function Home() {
  const { db, t, user, money } = useApp();
  const nav = useNavigate();
  const s = stats(db);
  const live = db.products.filter((p) => p.active);
  const featured = live.filter((p) => p.featured);
  const popular = [...live].sort((a, b) => productSales(db, b.id) - productSales(db, a.id)).slice(0, 4);
  const offers = live.filter((p) => p.compareAtUsd && p.compareAtUsd > p.priceUsd);
  const fresh = [...live].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  const reviews = db.reviews.filter((r) => r.approved).slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto px-4">
      {/* ------- opener: the vault + live console ------- */}
      <section className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center pt-12 lg:pt-20 pb-14">
        <div className="stagger">
          <span className="sk-chip !text-volt-400 !border-volt-500/30 !bg-volt-500/8 mb-6">
            <IBolt size={12} /> {t("h.kicker")}
          </span>
          <h1 className="font-display font-extrabold text-[clamp(2rem,5.2vw,3.6rem)] leading-[1.06] tracking-tight">
            {t("h.title1")}<br />
            <span className="text-volt-400">{t("h.title2")}</span>
          </h1>
          <p className="text-[15px] text-dim leading-relaxed max-w-lg mt-5">{t("h.desc")}</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Btn size="lg" onClick={() => nav("/catalog")}>{t("h.cta1")} <IArrowR size={16} className="rtl:rotate-180" /></Btn>
            <Btn size="lg" variant="soft" onClick={() => nav("/offers")}>{t("h.cta2")}</Btn>
          </div>
          <div className="grid grid-cols-3 max-w-md gap-px mt-11 bg-line border border-line rounded-2xl overflow-hidden">
            {[
              { v: s.vaultKeys, l: t("h.vault"), icon: <IKey size={14} /> },
              { v: s.deliveredKeys, l: t("h.delivered"), icon: <IBolt size={14} /> },
              { v: s.productsLive, l: t("h.products"), icon: <IDb size={14} /> },
            ].map((x, i) => (
              <div key={i} className="bg-panel px-4 py-4">
                <div className="flex items-center gap-1.5 text-volt-400">{x.icon}<span className="font-display text-xl font-bold text-fog tabular-nums">{x.v}</span></div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint mt-1 leading-tight">{x.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="anim-fade-up" style={{ animationDelay: "0.15s" }}>
          <DeliveryConsole />
        </div>
      </section>

      {/* ------- ticker ------- */}
      <div className="relative border-y border-line bg-panel/60 py-3.5 overflow-hidden mb-16" dir="ltr">
        <div className="flex gap-10 whitespace-nowrap sk-marquee-track w-max">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex gap-10 items-center">
              {db.categories.map((c) => (
                <Link key={c.slug + rep} to={`/catalog?cat=${c.slug}`} className="flex items-center gap-2.5 text-[13px] font-bold text-dim hover:text-volt-400 transition">
                  <IKey size={12} className="text-volt-500/60" /> {c.name[user?.lang ?? "en"]}
                </Link>
              ))}
              {offers.map((p) => (
                <Link key={p.slug + rep} to={`/product/${p.slug}`} className="flex items-center gap-2 text-[13px] font-bold text-ember-400">
                  <ITrend size={13} /> {p.name.en} −{Math.round(((p.compareAtUsd! - p.priceUsd) / p.compareAtUsd!) * 100)}%
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ------- categories ------- */}
      <section className="mb-16">
        <SectionHead title={t("h.categories")} link={<Link to="/catalog" className="text-[13px] font-bold text-volt-400 hover:underline flex items-center gap-1">{t("c.viewAll")} <IChevronsR size={14} className="rtl:rotate-180" /></Link>} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          {db.categories.map((c, i) => {
            const Icon = CAT_ICONS[c.icon];
            const count = live.filter((p) => p.category === c.id).length;
            return (
              <Link key={c.id} to={`/catalog?cat=${c.slug}`}
                className={`sk-card p-5 group hover:border-volt-500/40 hover:-translate-y-0.5 transition-all anim-fade-up ${i === 0 ? "col-span-2 lg:col-span-1" : ""}`}
                style={{ animationDelay: `${i * 60}ms` }}>
                <span className="w-10 h-10 rounded-xl bg-volt-500/10 border border-volt-500/20 text-volt-400 flex items-center justify-center mb-3.5 group-hover:bg-volt-500 group-hover:text-[#062b1b] transition-colors">
                  <Icon size={18} />
                </span>
                <p className="font-display text-[13.5px] font-bold">{c.name[user?.lang ?? "en"]}</p>
                <p className="text-[11.5px] text-faint font-semibold mt-1">{count} {t("c.items")}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------- featured ------- */}
      <section className="mb-16">
        <SectionHead title={t("h.featured")} link={<Link to="/catalog" className="text-[13px] font-bold text-volt-400 hover:underline flex items-center gap-1">{t("c.viewAll")} <IChevronsR size={14} className="rtl:rotate-180" /></Link>} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{featured.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}</div>
      </section>

      {/* ------- delivery pipeline ------- */}
      <section className="mb-16 sk-card p-6 sm:p-10 relative overflow-hidden">
        <div className="absolute inset-0 sk-grid-overlay opacity-40 pointer-events-none" />
        <div className="relative grid lg:grid-cols-[0.9fr_1.1fr] gap-10">
          <div>
            <span className="sk-chip !text-volt-400 !border-volt-500/30 !bg-volt-500/8 mb-5"><IShield size={12} /> Webhook-verified</span>
            <h2 className="font-display text-2xl sm:text-[28px] font-bold leading-tight tracking-tight">{t("h.how")}</h2>
            <p className="text-sm text-dim leading-relaxed mt-4">{t("co.secureNote")}</p>
            <Btn variant="outline" className="mt-7" onClick={() => nav("/faq")}>{t("nav.faq")} <IArrowR size={14} className="rtl:rotate-180" /></Btn>
          </div>
          <ol className="relative space-y-0">
            {[["h.how1", "h.how1d"], ["h.how2", "h.how2d"], ["h.how3", "h.how3d"], ["h.how4", "h.how4d"]].map(([title, desc], i) => (
              <li key={title} className="flex gap-4 pb-6 last:pb-0 relative">
                {i < 3 && <span className="absolute start-[17px] top-10 bottom-0 w-px bg-gradient-to-b from-volt-500/50 to-line" />}
                <span className="w-9 h-9 shrink-0 rounded-xl bg-volt-500/12 border border-volt-500/30 text-volt-400 font-display text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                <div className="pt-1">
                  <h3 className="font-display text-[14.5px] font-bold">{t(title)}</h3>
                  <p className="text-[13px] text-dim leading-relaxed mt-1">{t(desc)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------- popular ------- */}
      <section className="mb-16">
        <SectionHead title={t("h.popular")} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{popular.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}</div>
      </section>

      {/* ------- offers ------- */}
      {offers.length > 0 && (
        <section className="mb-16">
          <SectionHead title={t("h.offers")} link={<Link to="/offers" className="text-[13px] font-bold text-volt-400 hover:underline flex items-center gap-1">{t("c.viewAll")} <IChevronsR size={14} className="rtl:rotate-180" /></Link>} />
          <div className="sk-card p-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {offers.slice(0, 3).map((p) => {
              const pct = Math.round(((p.compareAtUsd! - p.priceUsd) / p.compareAtUsd!) * 100);
              return (
                <Link key={p.id} to={`/product/${p.slug}`} className="flex items-center gap-4 p-3.5 rounded-xl hover:bg-raise transition group">
                  <img src={p.image} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[13px] font-bold truncate group-hover:text-volt-400 transition">{p.name.en}</p>
                    <p className="text-[12px] text-faint mt-0.5" dir="ltr">{money(p.priceUsd)} <s className="opacity-60">{money(p.compareAtUsd!)}</s></p>
                  </div>
                  <Badge tone="ember" className="text-[13px] !px-3 !py-1">−{pct}%</Badge>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ------- new ------- */}
      <section className="mb-16"><ProductRail title={t("h.new")} products={fresh} /></section>

      {/* ------- reviews ------- */}
      {reviews.length > 0 && (
        <section className="mb-16">
          <SectionHead title={t("h.reviews")} />
          <div className="grid md:grid-cols-3 gap-4">
            {reviews.map((r, i) => {
              const p = db.products.find((x) => x.id === r.productId);
              return (
                <figure key={r.id} className="sk-card p-5 anim-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                  <Stars value={r.rating} />
                  <blockquote className="text-[13.5px] leading-relaxed text-dim mt-3">“{r.text}”</blockquote>
                  <figcaption className="flex items-center gap-2.5 mt-4 pt-4 border-t border-line">
                    <span className="w-8 h-8 rounded-lg bg-raise border border-line flex items-center justify-center text-[11px] font-extrabold text-volt-400">{r.customerName[0]}</span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold truncate">{r.customerName}</p>
                      <p className="text-[11px] text-faint truncate">{p?.name.en}</p>
                    </div>
                    {r.verified && <Badge tone="volt" className="ms-auto shrink-0"><ICheck size={10} /> {t("p.verified")}</Badge>}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {/* ------- trust strip ------- */}
      <section className="sk-card grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line rtl:sm:divide-x-reverse mb-4">
        {[
          { icon: <IShield size={20} />, title: t("h.trust1"), desc: t("h.trust1d") },
          { icon: <IKey size={20} />, title: t("h.trust2"), desc: t("h.trust2d") },
          { icon: <ILifebuoy size={20} />, title: t("h.trust3"), desc: t("h.trust3d") },
        ].map((x, i) => (
          <div key={i} className="flex gap-4 p-6">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-volt-500/10 border border-volt-500/25 text-volt-400 flex items-center justify-center">{x.icon}</span>
            <div>
              <h3 className="font-display text-[14px] font-bold">{x.title}</h3>
              <p className="text-[12.5px] text-dim leading-relaxed mt-1">{x.desc}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
