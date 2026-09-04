import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, api, availableStock, productRating, productSales } from "../state/store";
import { ProductCard, PriceBlock } from "../components/product";
import { Badge, Btn, Empty, KeyField, Qty, Stars, Tabs, Textarea, toast } from "../components/ui";
import { IBolt, IWrench, IHeart, ICart, IChevronR, IShield, IGlobe, IClock, IKey, ICheck, IBox, IStar } from "../components/icons";
import { formatDate } from "../lib/money";

function NotFound() {
  const { t } = useApp();
  return <Empty icon={<IBox size={22} />} title={t("e.404t")} desc={t("e.404d")} action={<Btn onClick={() => history.back()}>{t("c.back")}</Btn>} />;
}

export default function ProductPage() {
  const { slug } = useParams();
  const { db, t, user, dir } = useApp();
  const nav = useNavigate();
  const p = db.products.find((x) => x.slug === slug && x.active);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState("desc");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  const stock = p ? availableStock(db, p) : 0;
  const { avg, count } = productRating(db, p?.id ?? "");
  const sales = productSales(db, p?.id ?? "");

  useEffect(() => {
    if (!p) return;
    document.title = p.seoTitle; // A27: per-product SEO metadata (production: server-rendered)
    const upsert = (attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    upsert("name", "description", p.seoDescription);
    upsert("property", "og:title", p.seoTitle);
    upsert("property", "og:description", p.seoDescription);
    upsert("property", "og:image", p.image);
    upsert("property", "og:type", "product");
    let script = document.getElementById("sk-jsonld-product") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "sk-jsonld-product";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "Product",
      name: p.name.en, description: p.seoDescription, image: p.image,
      sku: p.slug, brand: { "@type": "Brand", name: "SHEROKEY" },
      offers: { "@type": "Offer", priceCurrency: "USD", price: (p.priceUsd / 100).toFixed(2), availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
      aggregateRating: count > 0 ? { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: count } : undefined,
    });
    return () => {
      document.title = "SHEROKEY — Digital Keys, Licenses & Subscriptions";
      document.getElementById("sk-jsonld-product")?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, stock, count]);
  const lang = user?.lang ?? "en";
  const reviews = useMemo(() => db.reviews.filter((r) => r.productId === p?.id && r.approved), [db.reviews, p]);
  const purchased = !!user && db.orders.some((o) => o.customerId === user.id && o.paymentStatus !== "FAILED" && o.items.some((i) => i.productId === p?.id));
  const reviewed = !!user && db.reviews.some((r) => r.customerId === user.id && r.productId === p?.id);
  const wished = !!user && db.wishlist.some((w) => w.userId === user.id && w.productId === p?.id);

  if (!p) return <div className="max-w-3xl mx-auto px-4 py-24"><NotFound /></div>;

  const cat = db.categories.find((c) => c.id === p.category);
  const related = db.products.filter((x) => x.active && x.id !== p.id && (x.category === p.category || x.deliveryMethod === p.deliveryMethod)).slice(0, 4);

  const add = (goCheckout = false) => {
    try {
      api.addToCart(p.id, qty);
      toast(t("c.added"), "ok");
      if (goCheckout) nav(user ? "/checkout" : "/auth/login");
      else nav("/cart");
    } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  const submitReview = () => {
    try {
      api.addReview(p.id, rating, text);
      toast(t("p.reviewOk"), "ok");
      setText("");
    } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pt-8">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint mb-6" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-fog transition">{t("nav.home")}</Link>
        <IChevronR size={12} className={dir === "rtl" ? "rotate-180" : ""} />
        <Link to="/catalog" className="hover:text-fog transition">{t("nav.catalog")}</Link>
        <IChevronR size={12} className={dir === "rtl" ? "rotate-180" : ""} />
        <Link to={`/catalog?cat=${cat?.slug}`} className="hover:text-fog transition">{cat?.name[lang]}</Link>
        <IChevronR size={12} className={dir === "rtl" ? "rotate-180" : ""} />
        <span className="text-dim truncate max-w-45">{p.name[lang]}</span>
      </nav>

      <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 mb-16">
        {/* visual */}
        <div className="anim-fade-up">
          <div className="relative sk-card overflow-hidden group">
            <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(70% 60% at 50% 35%, ${p.accent}22, transparent 70%)` }} />
            <img src={p.image} alt={p.name.en} className="w-full aspect-square object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            <div className="absolute top-4 start-4 flex flex-col gap-2 items-start">
              {p.compareAtUsd && <Badge tone="volt" className="!bg-[#0a2b1d]/90 text-[13px] !px-3 !py-1">−{Math.round(((p.compareAtUsd - p.priceUsd) / p.compareAtUsd) * 100)}%</Badge>}
              {p.isNew && <Badge tone="sky">{t("p.new")}</Badge>}
              {p.featured && <Badge tone="ember">{t("p.featured")}</Badge>}
            </div>
            <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between">
              <span className="sk-chip !bg-black/50 !border-white/10 !text-white/90 backdrop-blur">
                {p.deliveryMethod === "AUTO" ? <IBolt size={12} className="text-volt-400" /> : <IWrench size={12} className="text-ember-400" />}
                {p.deliveryMethod === "AUTO" ? t("p.instantDelivery") : t("p.manualNote")}
              </span>
              {sales > 0 && <span className="sk-chip !bg-black/50 !border-white/10 !text-white/90 backdrop-blur tabular-nums">{sales} {t("p.sold")}</span>}
            </div>
          </div>
        </div>

        {/* buy box */}
        <div className="anim-fade-up" style={{ animationDelay: "0.08s" }}>
          <p className="text-[12px] font-extrabold uppercase tracking-widest text-volt-400 mb-2.5">{cat?.name[lang]}</p>
          <h1 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">{p.name[lang]}</h1>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {count > 0 ? (
              <button onClick={() => setTab("reviews")} className="flex items-center gap-2 hover:opacity-80 transition">
                <Stars value={avg} size={15} />
                <span className="text-[13px] font-bold tabular-nums">{avg.toFixed(1)}</span>
                <span className="text-[12.5px] text-faint font-semibold">({count} {t("c.reviews")})</span>
              </button>
            ) : <span className="text-[12.5px] text-faint font-semibold flex items-center gap-1.5"><IStar size={13} /> {t("p.tabReviews")}: 0</span>}
            <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${stock > 0 ? "text-volt-400" : "text-danger-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stock > 0 ? "bg-volt-500" : "bg-danger-500"}`} />
              {stock > 0 ? (p.deliveryMethod === "AUTO" ? `${stock} ${t("p.keysLeft")}` : `${stock} ${t("p.stockLeft")}`) : t("c.outOfStock")}
            </span>
          </div>
          <p className="text-[14.5px] text-dim leading-relaxed mt-4">{p.short[lang]}</p>

          <div className="sk-card p-5 mt-6 space-y-4">
            <PriceBlock p={p} size="lg" />
            <div className="flex flex-wrap items-center gap-3">
              <Qty value={qty} onChange={setQty} max={Math.min(5, Math.max(1, stock))} />
              <Btn size="lg" className="flex-1 min-w-40" disabled={stock < 1} onClick={() => add(false)}><ICart size={16} /> {t("c.addToCart")}</Btn>
              <button onClick={() => { if (!user) { toast(t("e.loginFirst"), "info"); nav("/auth/login"); return; } api.toggleWishlist(p.id); }}
                aria-label={t("p.wishlist")}
                className={`w-12 h-12 rounded-[10px] border flex items-center justify-center transition active:scale-90 ${wished ? "bg-danger-500/15 border-danger-500/40 text-danger-400" : "border-line text-dim hover:text-fog hover:border-edge"}`}>
                <IHeart size={17} filled={wished} />
              </button>
            </div>
            <Btn size="lg" variant="dark" className="w-full" disabled={stock < 1} onClick={() => add(true)}><IBolt size={15} /> {t("c.buyNow")}</Btn>
            <p className="text-[11.5px] text-faint font-semibold text-center">{t("cart.note")}</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[
              { icon: <IClock size={15} />, k: t("p.duration"), v: p.durationMonths == null ? t("p.lifetime") : p.durationMonths === 1 ? t("p.month") : t("p.months", { n: p.durationMonths }) },
              { icon: <IGlobe size={15} />, k: t("p.region"), v: t("p.global") },
              { icon: <IShield size={15} />, k: t("p.warranty"), v: "✓" },
            ].map((x, i) => (
              <div key={i} className="sk-card px-4 py-3.5 flex items-center gap-3">
                <span className="text-volt-400">{x.icon}</span>
                <div><p className="text-[10.5px] font-extrabold uppercase tracking-wider text-faint">{x.k}</p><p className="text-[12.5px] font-bold mt-0.5">{x.v}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="sk-card mb-16">
        <Tabs value={tab} onChange={setTab} tabs={[
          { id: "desc", label: t("p.tabDesc") },
          { id: "req", label: t("p.tabReq") },
          { id: "delivery", label: t("p.tabDelivery") },
          { id: "reviews", label: `${t("p.tabReviews")} (${count})` },
        ]} />
        <div className="p-6 sm:p-8">
          {tab === "desc" && (
            <div className="max-w-3xl space-y-4 anim-fade">
              <p className="text-[14.5px] leading-relaxed text-dim">{p.description[lang]}</p>
              <div className="flex flex-wrap gap-2 pt-2">{p.tags.map((tag) => <span key={tag} className="sk-chip">#{tag}</span>)}</div>
            </div>
          )}
          {tab === "req" && (
            <ul className="max-w-3xl space-y-2.5 anim-fade">
              {p.requirements[lang].split("·").map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[14px] text-dim"><ICheck size={15} className="text-volt-500 mt-0.5 shrink-0" /> {r.trim()}</li>
              ))}
            </ul>
          )}
          {tab === "delivery" && (
            <div className="max-w-3xl space-y-5 anim-fade">
              <div className="flex gap-4 items-start">
                <span className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${p.deliveryMethod === "AUTO" ? "bg-volt-500/12 text-volt-400" : "bg-ember-500/12 text-ember-400"}`}>
                  {p.deliveryMethod === "AUTO" ? <IBolt size={17} /> : <IWrench size={17} />}
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold mb-1">{p.deliveryMethod === "AUTO" ? t("p.auto") : t("p.manual")}</h3>
                  <p className="text-[13.5px] text-dim leading-relaxed">{p.deliveryMethod === "AUTO" ? t("p.autoDesc") : t("p.manualDesc")}</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-volt-500/12 text-volt-400 flex items-center justify-center"><IShield size={17} /></span>
                <div>
                  <h3 className="font-display text-sm font-bold mb-1">{t("p.warranty")}</h3>
                  <p className="text-[13.5px] text-dim leading-relaxed">{t("faq.a4")}</p>
                </div>
              </div>
            </div>
          )}
          {tab === "reviews" && (
            <div className="max-w-3xl space-y-6 anim-fade">
              {count > 0 && (
                <div className="flex items-center gap-4 pb-5 border-b border-line">
                  <span className="font-display text-4xl font-extrabold tabular-nums">{avg.toFixed(1)}</span>
                  <div><Stars value={avg} size={17} /><p className="text-[12px] text-faint font-semibold mt-1">{count} {t("c.reviews")} · {t("p.avg")}</p></div>
                </div>
              )}
              {reviews.length === 0 && <p className="text-sm text-dim">{t("c.noResults")}</p>}
              {reviews.map((r) => (
                <article key={r.id} className="pb-5 border-b border-line/70 last:border-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-8 h-8 rounded-lg bg-raise border border-line flex items-center justify-center text-[11px] font-extrabold text-volt-400">{r.customerName[0]}</span>
                    <div>
                      <p className="text-[13px] font-bold">{r.customerName}</p>
                      <p className="text-[11px] text-faint">{formatDate(r.createdAt, lang, false)}</p>
                    </div>
                    <div className="ms-auto flex items-center gap-2">
                      {r.verified && <Badge tone="volt"><ICheck size={10} /> {t("p.verified")}</Badge>}
                      <Stars value={r.rating} size={12} />
                    </div>
                  </div>
                  <p className="text-[13.5px] text-dim leading-relaxed">{r.text}</p>
                </article>
              ))}

              {/* review form */}
              <div className="sk-card p-5 !bg-canvas">
                <h3 className="font-display text-sm font-bold mb-4 flex items-center gap-2"><IKey size={14} className="text-volt-400" /> {t("p.writeReview")}</h3>
                {!user ? (
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-sm text-dim">{t("p.loginReview")}</p>
                    <Btn size="sm" variant="soft" onClick={() => nav("/auth/login")}>{t("au.login")}</Btn>
                  </div>
                ) : reviewed ? (
                  <p className="text-sm text-dim flex items-center gap-2"><ICheck size={15} className="text-volt-500" /> {t("p.reviewOk")}</p>
                ) : (
                  <div className="space-y-4">
                    {!purchased && <p className="text-[12.5px] text-ember-400 font-semibold flex items-center gap-2"><IKey size={13} /> {t("p.buyReview")}</p>}
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-bold text-dim">{t("p.yourRating")}:</span>
                      <Stars value={rating} onChange={setRating} />
                    </div>
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("p.reviewText")} />
                    <Btn onClick={submitReview} disabled={text.trim().length < 5}>{t("p.sendReview")}</Btn>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* related */}
      {related.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display text-xl font-bold mb-5">{t("p.related")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{related.map((rp, i) => <ProductCard key={rp.id} p={rp} index={i} />)}</div>
        </section>
      )}
    </div>
  );
}
