import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, productSales, productRating, availableStock } from "../state/store";
import { ProductCard } from "../components/product";
import { Empty, SearchBox, Select, Badge } from "../components/ui";
import { IBox, ITrend, IBolt, IWrench, IFilter } from "../components/icons";

export default function Catalog({ offersOnly = false }: { offersOnly?: boolean }) {
  const { db, t, user } = useApp();
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") ?? "";
  const q = (params.get("q") ?? "").toLowerCase();
  const sort = params.get("sort") ?? "popular";
  const [delivery, setDelivery] = useState<"" | "AUTO" | "MANUAL">("");
  const [showFilters, setShowFilters] = useState(false);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const results = useMemo(() => {
    let list = db.products.filter((p) => p.active);
    if (offersOnly) list = list.filter((p) => p.compareAtUsd && p.compareAtUsd > p.priceUsd);
    if (cat) { const c = db.categories.find((x) => x.slug === cat); if (c) list = list.filter((p) => p.category === c.id); }
    if (q) list = list.filter((p) =>
      Object.values(p.name).join(" ").toLowerCase().includes(q) ||
      Object.values(p.short).join(" ").toLowerCase().includes(q) ||
      p.tags.join(" ").toLowerCase().includes(q));
    if (delivery) list = list.filter((p) => p.deliveryMethod === delivery);
    const rating = (id: string) => productRating(db, id).avg;
    switch (sort) {
      case "priceAsc": list.sort((a, b) => a.priceUsd - b.priceUsd); break;
      case "priceDesc": list.sort((a, b) => b.priceUsd - a.priceUsd); break;
      case "newest": list.sort((a, b) => b.createdAt - a.createdAt); break;
      case "rating": list.sort((a, b) => rating(b.id) - rating(a.id)); break;
      default: list.sort((a, b) => productSales(db, b.id) - productSales(db, a.id));
    }
    return list;
  }, [db, cat, q, sort, delivery, offersOnly]);

  const activeCat = db.categories.find((c) => c.slug === cat);

  return (
    <div className="max-w-7xl mx-auto px-4 pt-10 pb-4">
      <header className="mb-8 anim-fade-up">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
            {offersOnly ? t("h.offers") : activeCat ? activeCat.name[user?.lang ?? "en"] : t("nav.catalog")}
          </h1>
          {offersOnly && <Badge tone="ember"><ITrend size={12} /> {results.length} {t("c.results")}</Badge>}
        </div>
        <p className="text-sm text-dim mt-2">
          {q ? `${results.length} ${t("c.results")} — “${params.get("q")}”` : offersOnly ? t("cart.note") : `${results.length} ${t("c.items")} · ${t("hdr.instant")}`}
        </p>
      </header>

      {/* toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-7">
        <div className="flex-1"><SearchBox value={params.get("q") ?? ""} onChange={(v) => setParam("q", v)} placeholder={t("hdr.search")} /></div>
        <div className="flex gap-3">
          <Select value={sort} onChange={(e) => setParam("sort", e.target.value)} className="w-48" aria-label={t("c.sort")}>
            <option value="popular">{t("c.popular")}</option>
            <option value="newest">{t("c.newest")}</option>
            <option value="priceAsc">{t("c.priceAsc")}</option>
            <option value="priceDesc">{t("c.priceDesc")}</option>
            <option value="rating">{t("c.topRated")}</option>
          </Select>
          <button onClick={() => setShowFilters(!showFilters)} className="lg:hidden sk-input !w-auto flex items-center gap-2 !py-0 h-10.5 text-sm font-semibold text-dim">
            <IFilter size={15} /> {t("c.filter")}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        {/* filters */}
        <aside className={`${showFilters ? "block" : "hidden"} lg:block space-y-7`}>
          {!offersOnly && (
            <div>
              <h3 className="text-[11.5px] font-extrabold uppercase tracking-widest text-faint mb-3">{t("c.category")}</h3>
              <ul className="space-y-1">
                <li>
                  <button onClick={() => setParam("cat", "")} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition ${!cat ? "bg-volt-500/10 text-volt-400" : "text-dim hover:text-fog hover:bg-raise"}`}>
                    {t("c.all")} <span className="text-[11px] text-faint tabular-nums">{db.products.filter((p) => p.active).length}</span>
                  </button>
                </li>
                {db.categories.map((c) => {
                  const n = db.products.filter((p) => p.active && p.category === c.id).length;
                  return (
                    <li key={c.id}>
                      <button onClick={() => setParam("cat", c.slug)} className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition ${cat === c.slug ? "bg-volt-500/10 text-volt-400" : "text-dim hover:text-fog hover:bg-raise"}`}>
                        {c.name[user?.lang ?? "en"]} <span className="text-[11px] text-faint tabular-nums">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <h3 className="text-[11.5px] font-extrabold uppercase tracking-widest text-faint mb-3">{t("p.delivery")}</h3>
            <div className="space-y-1.5">
              {([["", t("c.all")], ["AUTO", t("p.auto")], ["MANUAL", t("p.manual")]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setDelivery(v)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition ${delivery === v ? "bg-volt-500/10 text-volt-400" : "text-dim hover:text-fog hover:bg-raise"}`}>
                  {v === "AUTO" ? <IBolt size={13} /> : v === "MANUAL" ? <IWrench size={13} /> : <IBox size={13} />} {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sk-card p-4 text-[12px] text-dim leading-relaxed">
            <p className="font-bold text-fog mb-1.5 flex items-center gap-1.5"><IBolt size={12} className="text-volt-400" /> {t("p.instantDelivery")}</p>
            {t("p.autoDesc")}
          </div>
        </aside>

        {/* grid */}
        <div>
          {results.length === 0 ? (
            <Empty icon={<IBox size={22} />} title={t("c.noResults")} desc={t("cart.emptyDesc")} />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
