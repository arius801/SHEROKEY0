import { Link, useNavigate } from "react-router-dom";
import type { Product } from "../lib/types";
import { useApp, api, availableStock, productRating, productSales } from "../state/store";
import { Badge, Stars, toast } from "./ui";
import { IBolt, ICart, IHeart, IKey, IWrench } from "./icons";

export function DiscountPct(p: Product): number | null {
  if (!p.compareAtUsd || p.compareAtUsd <= p.priceUsd) return null;
  return Math.round(((p.compareAtUsd - p.priceUsd) / p.compareAtUsd) * 100);
}

export function PriceBlock({ p, size = "md" }: { p: Product; size?: "sm" | "md" | "lg" }) {
  const { money, t } = useApp();
  const pct = DiscountPct(p);
  const big = size === "lg" ? "text-[26px]" : size === "md" ? "text-lg" : "text-[15px]";
  return (
    <div className="flex items-baseline gap-2 flex-wrap" dir="ltr">
      <span className={`font-display font-bold ${big} tabular-nums`}>{money(p.priceUsd)}</span>
      {p.compareAtUsd && (
        <span className="text-sm text-faint line-through tabular-nums">{money(p.compareAtUsd)}</span>
      )}
      {pct && <Badge tone="volt">−{pct}%</Badge>}
      {size === "lg" && <span className="text-xs text-faint font-semibold">{p.deliveryMethod === "AUTO" ? t("p.instantDelivery") : t("p.manualNote")}</span>}
    </div>
  );
}

export function ProductCard({ p, index = 0 }: { p: Product; index?: number }) {
  const { db, t, user } = useApp();
  const nav = useNavigate();
  const stock = availableStock(db, p);
  const { avg, count } = productRating(db, p.id);
  const sales = productSales(db, p.id);
  const wished = !!user && db.wishlist.some((w) => w.userId === user.id && w.productId === p.id);
  const pct = DiscountPct(p);
  const cat = db.categories.find((c) => c.id === p.category);

  const add = () => {
    try { api.addToCart(p.id, 1); toast(t("c.added"), "ok"); }
    catch (e) { toast((e as { code?: string }).code ? t((e as { code: string }).code) : t("e.generic"), "err"); }
  };
  const wish = () => {
    if (!user) { toast(t("e.loginFirst"), "info"); nav("/auth/login"); return; }
    api.toggleWishlist(p.id);
  };

  return (
    <div className="sk-card group overflow-hidden flex flex-col transition-all duration-200 hover:border-edge hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.55)] anim-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
      <Link to={`/product/${p.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-canvas">
        <img src={p.image} alt={p.name.en} loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#060a10]/70 via-transparent to-transparent opacity-80" />
        <div className="absolute top-2.5 start-2.5 flex flex-col gap-1.5 items-start">
          {pct && <Badge tone="volt" className="bg-[#0a2b1d]/90">−{pct}%</Badge>}
          {p.isNew && <Badge tone="sky">{t("p.new")}</Badge>}
        </div>
        <button onClick={(e) => { e.preventDefault(); wish(); }} aria-label={t("p.wishlist")}
          className={`absolute top-2.5 end-2.5 w-8 h-8 rounded-full backdrop-blur border flex items-center justify-center transition ${
            wished ? "bg-danger-500/25 border-danger-500/40 text-danger-400" : "bg-black/30 border-white/10 text-white/80 hover:text-white hover:border-white/30"}`}>
          <IHeart size={15} filled={wished} />
        </button>
        <div className="absolute bottom-2.5 start-2.5">
          <span className="sk-chip !bg-black/45 !border-white/10 !text-white/85 backdrop-blur">
            {p.deliveryMethod === "AUTO" ? <IBolt size={11} className="text-volt-400" /> : <IWrench size={11} className="text-ember-400" />}
            {p.deliveryMethod === "AUTO" ? t("p.auto") : t("p.manual")}
          </span>
        </div>
      </Link>
      <div className="p-4 flex flex-col gap-2.5 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-faint">{cat?.name[user?.lang ?? "en"] ?? ""}</span>
          {count > 0 && (
            <span className="flex items-center gap-1 text-[11.5px] text-dim font-semibold">
              <Stars value={avg} size={11} /> <span className="tabular-nums">{avg.toFixed(1)}</span>
            </span>
          )}
        </div>
        <Link to={`/product/${p.slug}`} className="font-display text-[14.5px] font-bold leading-snug hover:text-volt-400 transition line-clamp-2 min-h-[2.4em]">
          {p.name[user?.lang ?? "en"] ?? p.name.en}
        </Link>
        <p className="text-[12.5px] text-dim line-clamp-2 leading-relaxed flex-1">{p.short[user?.lang ?? "en"] ?? p.short.en}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <PriceBlock p={p} size="sm" />
          <button onClick={add} disabled={stock < 1} aria-label={t("c.addToCart")}
            className="w-9 h-9 rounded-[10px] bg-raise border border-line flex items-center justify-center text-dim hover:text-[#062b1b] hover:bg-volt-500 hover:border-volt-500 transition disabled:opacity-35 active:scale-90">
            <ICart size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-faint font-semibold">
          <IKey size={11} className={stock > p.lowStockThreshold ? "text-volt-500" : "text-ember-400"} />
          {stock > 0
            ? <span>{p.deliveryMethod === "AUTO" ? `${stock} ${t("p.keysLeft")}` : `${stock} ${t("p.stockLeft")}`}</span>
            : <span className="text-danger-400">{t("c.outOfStock")}</span>}
          {sales > 0 && <span className="ms-auto tabular-nums">· {sales} {t("p.sold")}</span>}
        </div>
      </div>
    </div>
  );
}

export function ProductRail({ title, products }: { title: string; products: Product[] }) {
  return (
    <section>
      <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight mb-5">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 snap-x" style={{ scrollbarWidth: "thin" }}>
        {products.map((p, i) => (
          <div key={p.id} className="w-[268px] shrink-0 snap-start"><ProductCard p={p} index={i} /></div>
        ))}
      </div>
    </section>
  );
}
