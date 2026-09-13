import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp, api, can, availableStock, productRating, stats } from "../state/store";
import { uid } from "../lib/crypto";
import { formatDate } from "../lib/money";
import type { Coupon, Product, Role } from "../lib/types";
import { Badge, Btn, Empty, Field, Input, KeyBadge, Modal, SearchBox, Select, Textarea, toast } from "../components/ui";
import { IBox, IKey, ITag, IUsers, IMail, IFile, IPlus, IUpload, IDownload, IBan, IEdit, ICheck, IX, ISend, IRefresh, IAlert, ILifebuoy, IWrench } from "../components/icons";

/* ================= PRODUCTS ================= */
export function AdminProducts() {
  const { db, t, fmt } = useApp();
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ name: "", price: "", compare: "", category: "software", delivery: "AUTO", duration: "", stock: "10", featured: false, isNew: false, active: true });

  const openNew = () => {
    setIsNew(true);
    setForm({ name: "", price: "19.99", compare: "", category: "software", delivery: "AUTO", duration: "", stock: "10", featured: false, isNew: true, active: true });
    setEditing({ id: "", slug: "", name: { en: "", ar: "", ru: "", fr: "" }, short: { en: "", ar: "", ru: "", fr: "" }, description: { en: "", ar: "", ru: "", fr: "" }, requirements: { en: "", ar: "", ru: "", fr: "" }, category: "software", tags: [], priceUsd: 1999, compareAtUsd: null, deliveryMethod: "AUTO", durationMonths: null, stock: 10, lowStockThreshold: 5, active: true, featured: false, isNew: true, image: db.products[0]?.image ?? "", accent: "#2fc98a", seoTitle: "", seoDescription: "", createdAt: 0 });
  };
  const openEdit = (p: Product) => {
    setIsNew(false);
    setForm({ name: p.name.en, price: (p.priceUsd / 100).toFixed(2), compare: p.compareAtUsd ? (p.compareAtUsd / 100).toFixed(2) : "", category: p.category, delivery: p.deliveryMethod, duration: p.durationMonths ? String(p.durationMonths) : "", stock: String(p.stock), featured: p.featured, isNew: p.isNew, active: p.active });
    setEditing(p);
  };
  const save = async () => {
    if (!editing) return;
    const priceUsd = Math.round(parseFloat(form.price) * 100);
    const compareAtUsd = form.compare ? Math.round(parseFloat(form.compare) * 100) : null;
    if (!form.name.trim() || isNaN(priceUsd) || priceUsd <= 0) { toast(t("e.generic"), "err"); return; }
    const name = form.name.trim();
    const p: Product = {
      ...editing,
      name: { en: name, ar: editing.name.ar || name, ru: editing.name.ru || name, fr: editing.name.fr || name },
      slug: isNew ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + uid("").slice(-4) : editing.slug,
      priceUsd, compareAtUsd, category: form.category,
      deliveryMethod: form.delivery as "AUTO" | "MANUAL",
      durationMonths: form.duration ? parseInt(form.duration, 10) : null,
      stock: parseInt(form.stock, 10) || 0,
      featured: form.featured, isNew: form.isNew, active: form.active,
      seoTitle: editing.seoTitle || `Buy ${name} — Instant Delivery | SHEROKEY`,
      seoDescription: editing.seoDescription || name,
    };
    if (isNew) {
      p.short = { en: name, ar: editing.name.ar || name, ru: editing.name.ru || name, fr: editing.name.fr || name };
      p.description = { en: name, ar: editing.name.ar || name, ru: editing.name.ru || name, fr: editing.name.fr || name };
      p.requirements = { en: "Internet connection.", ar: "اتصال بالإنترنت.", ru: "Интернет.", fr: "Connexion internet." };
    }
    try { await api.saveProduct(p, isNew); toast(t("c.saved")); setEditing(null); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  const handleToggle = async (id: string, flag: "active" | "featured" | "isNew") => {
    try { await api.toggleProduct(id, flag); toast(t("c.saved")); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h2 className="font-display text-lg font-extrabold">{t("ad.products")} <span className="text-faint text-sm">({db.products.length})</span></h2>
        <Btn size="sm" onClick={openNew}><IPlus size={14} /> {t("ad.createProduct")}</Btn>
      </div>
      <div className="sk-card overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[760px]">
          <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line bg-raise/50">
            <th className="text-start font-extrabold py-3 px-4">{t("ad.products")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.basePrice")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.stock")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.deliveryM")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.featuredToggle")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.activeToggle")}</th>
            <th className="text-start font-extrabold py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {db.products.map((p) => {
              const stock = availableStock(db, p);
              return (
                <tr key={p.id} className="border-b border-line/50 last:border-0 hover:bg-raise/60 transition">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      <div><p className="font-bold">{p.name.en}</p><p className="text-[10.5px] text-faint font-semibold">{p.slug}</p></div>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 font-bold tabular-nums" dir="ltr">{fmt(p.priceUsd, "USD")}{p.compareAtUsd && <span className="text-faint line-through ms-1.5 font-semibold">{fmt(p.compareAtUsd, "USD")}</span>}</td>
                  <td className="py-2.5 px-2"><Badge tone={stock <= p.lowStockThreshold ? "ember" : "volt"}>{stock}</Badge></td>
                  <td className="py-2.5 px-2"><Badge tone={p.deliveryMethod === "AUTO" ? "volt" : "ember"}>{p.deliveryMethod === "AUTO" ? t("p.auto") : t("p.manual")}</Badge></td>
                  <td className="py-2.5 px-2"><button onClick={() => handleToggle(p.id, "featured")} className={`w-9 h-5.5 rounded-full border transition relative ${p.featured ? "bg-volt-500/80 border-volt-500" : "bg-raise border-line"}`} aria-label="featured"><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.featured ? "start-[calc(100%-1.125rem)]" : "start-0.5"}`} /></button></td>
                  <td className="py-2.5 px-2"><button onClick={() => handleToggle(p.id, "active")} className={`w-9 h-5.5 rounded-full border transition relative ${p.active ? "bg-volt-500/80 border-volt-500" : "bg-raise border-line"}`} aria-label="active"><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${p.active ? "start-[calc(100%-1.125rem)]" : "start-0.5"}`} /></button></td>
                  <td className="py-2.5 px-4"><Btn size="xs" variant="soft" onClick={() => openEdit(p)}><IEdit size={12} /> {t("c.edit")}</Btn></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={isNew ? t("ad.createProduct") : t("ad.editProduct")} wide>
        {editing && (
          <div className="space-y-4">
            <Field label={`${t("a.name")} (EN)`}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label={t("ad.basePrice")}><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} dir="ltr" /></Field>
              <Field label={`${t("ad.compare")} (${t("c.optional")})`}><Input value={form.compare} onChange={(e) => setForm({ ...form, compare: e.target.value })} dir="ltr" /></Field>
              <Field label={t("c.category")}>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name.en}</option>)}
                </Select>
              </Field>
              <Field label={t("ad.deliveryM")}>
                <Select value={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.value })}>
                  <option value="AUTO">{t("p.auto")}</option><option value="MANUAL">{t("p.manual")}</option>
                </Select>
              </Field>
              <Field label={`${t("p.duration")} (months, 0=∞)`}><Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value.replace(/\D/g, "") })} dir="ltr" /></Field>
              <Field label={`${t("ad.stock")} (MANUAL)`}><Input value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} dir="ltr" /></Field>
            </div>
            <div className="flex gap-5">
              {([["featured", t("ad.featuredToggle")], ["isNew", t("p.new")], ["active", t("ad.activeToggle")]] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-[12.5px] font-bold text-dim cursor-pointer">
                  <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} className="accent-[#2fc98a] w-4 h-4" /> {label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Btn variant="ghost" onClick={() => setEditing(null)}>{t("c.cancel")}</Btn>
              <Btn onClick={save}><ICheck size={15} /> {t("c.save")}</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================= LICENSE KEYS ================= */
export function AdminKeys() {
  const { db, t, user } = useApp();
  const [params] = useSearchParams();
  const [product, setProduct] = useState(params.get("product") ?? "");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [bulk, setBulk] = useState("");
  const [single, setSingle] = useState("");

  const rows = useMemo(() => db.licenseKeys.filter((k) =>
    (!product || k.productId === product) && (!status || k.status === status) &&
    (!q || k.key.toLowerCase().includes(q.toLowerCase()) || (db.orders.find((o) => o.id === k.orderId)?.number.toLowerCase().includes(q.toLowerCase()) ?? false))
  ).slice(0, 120), [db, product, status, q]);

  const counts = (s: string) => db.licenseKeys.filter((k) => (!product || k.productId === product) && k.status === s).length;
  const pName = (id: string) => db.products.find((p) => p.id === id)?.name.en ?? id;

  const exportCsv = () => {
    const head = "key,product,status,order,customer,delivered_at\n";
    const body = rows.map((k) => [k.key, pName(k.productId), k.status, db.orders.find((o) => o.id === k.orderId)?.number ?? "", db.users.find((u) => u.id === k.customerId)?.email ?? "", k.deliveredAt ? new Date(k.deliveredAt).toISOString() : ""].join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "sherokey-keys.csv"; a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = () => {
    try {
      const n = api.importKeys(product, bulk);
      toast(t("ad.keysAdded", { n }), "ok"); setBulk(""); setImportOpen(false);
    } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };
  const doSingle = () => {
    if (!single.trim()) return;
    try { const n = api.importKeys(product, single); toast(t("ad.keysAdded", { n }), "ok"); setSingle(""); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <h2 className="font-display text-lg font-extrabold">{t("ad.keys")} <span className="text-faint text-sm">({stats(db).vaultKeys} UNUSED)</span></h2>
        <div className="flex gap-2">
          <Btn size="sm" variant="soft" onClick={exportCsv}><IDownload size={13} /> {t("ad.exportCsv")}</Btn>
          <Btn size="sm" disabled={!product} onClick={() => setImportOpen(true)}><IUpload size={13} /> {t("ad.keyImport")}</Btn>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select value={product} onChange={(e) => setProduct(e.target.value)} className="sm:w-64" aria-label={t("ad.products")}>
          <option value="">{t("ad.products")}: {t("c.all")}</option>
          {db.products.filter((p) => p.deliveryMethod === "AUTO").map((p) => <option key={p.id} value={p.id}>{p.name.en}</option>)}
        </Select>
        <div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder={`${t("c.search")}… (key / ${t("o.order")})`} /></div>
        {product && (
          <div className="flex gap-2 items-center">
            <Input value={single} onChange={(e) => setSingle(e.target.value)} placeholder={t("ad.addOne")} dir="ltr" className="!w-56 font-mono !text-[12px]" />
            <Btn size="sm" variant="soft" onClick={doSingle}><IPlus size={13} /></Btn>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {["", "UNUSED", "RESERVED", "DELIVERED", "USED", "REVOKED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold whitespace-nowrap border transition ${status === s ? "bg-volt-500/12 border-volt-500/40 text-volt-400" : "border-line text-dim hover:border-edge"}`}>
            {s === "" ? `${t("c.all")} (${db.licenseKeys.filter((k) => !product || k.productId === product).length})` : `${t(`ks.${s}`)} (${counts(s)})`}
          </button>
        ))}
      </div>

      <div className="sk-card overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[760px]">
          <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line bg-raise/50">
            <th className="text-start font-extrabold py-3 px-4">Key</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.products")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.status")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("o.order")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.customer")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.deliveredAt")}</th>
            <th className="text-start font-extrabold py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {rows.map((k) => {
              const order = db.orders.find((o) => o.id === k.orderId);
              const customer = db.users.find((u) => u.id === k.customerId);
              return (
                <tr key={k.id} className="border-b border-line/50 last:border-0 hover:bg-raise/60 transition">
                  <td className="py-2.5 px-4 font-mono text-[11.5px] text-volt-400/90" dir="ltr">{k.key}</td>
                  <td className="py-2.5 px-2 font-semibold">{pName(k.productId)}</td>
                  <td className="py-2.5 px-2"><KeyBadge status={k.status} /></td>
                  <td className="py-2.5 px-2 font-mono text-[11px] text-dim">{order?.number ?? "—"}</td>
                  <td className="py-2.5 px-2 text-dim font-semibold">{customer?.email ?? "—"}</td>
                  <td className="py-2.5 px-2 text-faint font-semibold text-[11px]">{k.deliveredAt ? formatDate(k.deliveredAt, user?.lang ?? "en") : "—"}</td>
                  <td className="py-2.5 px-4">
                    {(k.status === "UNUSED" || k.status === "RESERVED") && can(user, "keys") && (
                      <button onClick={() => { try { api.revokeKey(k.id); toast(t("c.saved"), "info"); } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); } }}
                        className="text-faint hover:text-danger-400 transition" aria-label="revoke"><IBan size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7}><Empty icon={<IKey size={20} />} title={t("c.noResults")} /></td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title={`${t("ad.keyImport")} — ${pName(product)}`} wide>
        <div className="space-y-4">
          <p className="text-[12.5px] text-dim font-semibold">{t("ad.keyImportHint")}</p>
          <Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-40 font-mono !text-[12px]" dir="ltr" placeholder={"W11P-AAAAA-BBBBB-CCCCC\nW11P-DDDDD-EEEEE-FFFFF"} />
          <p className="text-[12px] text-faint font-semibold tabular-nums">{bulk.split("\n").filter((s) => s.trim().length >= 5).length} keys → UNUSED</p>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setImportOpen(false)}>{t("c.cancel")}</Btn>
            <Btn onClick={doImport}><IUpload size={14} /> {t("c.import")}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ================= COUPONS ================= */
export function AdminCoupons() {
  const { db, t, fmt } = useApp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", type: "PERCENT", value: "10", min: "10", maxUses: "100", maxPer: "1", days: "30" });

  const create = async () => {
    const value = form.type === "PERCENT" ? parseInt(form.value, 10) : Math.round(parseFloat(form.value) * 100);
    if (!form.code.trim() || isNaN(value)) { toast(t("e.generic"), "err"); return; }
    const c: Coupon = {
      code: form.code.trim().toUpperCase(), type: form.type as Coupon["type"], value,
      minOrderUsd: Math.round(parseFloat(form.min || "0") * 100),
      startsAt: Date.now(), expiresAt: Date.now() + parseInt(form.days || "30", 10) * 86400000,
      maxUses: parseInt(form.maxUses, 10) || 1, maxPerCustomer: parseInt(form.maxPer, 10) || 1, uses: 0, active: true, productIds: [],
    };
    try { await api.saveCoupon(c, true); toast(t("c.saved")); setOpen(false); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  const handleToggle = async (code: string) => {
    try { await api.toggleCoupon(code); toast(t("c.saved")); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  const handleDelete = async (code: string) => {
    try { await api.deleteCoupon(code); toast(t("c.saved")); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-lg font-extrabold">{t("ad.coupons")}</h2>
        <Btn size="sm" onClick={() => setOpen(true)}><IPlus size={14} /> {t("ad.createCoupon")}</Btn>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {db.coupons.map((c) => (
          <div key={c.code} className={`sk-card p-5 ${!c.active ? "opacity-55" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <code className="font-mono text-[15px] font-bold text-volt-400 bg-volt-500/8 border border-volt-500/25 rounded-lg px-3 py-1.5" dir="ltr">{c.code}</code>
              <Badge tone={c.active ? "volt" : "dim"}>{c.active ? t("c.active") : t("c.inactive")}</Badge>
            </div>
            <p className="font-display text-xl font-extrabold mb-1">{c.type === "PERCENT" ? `${c.value}%` : fmt(c.value, "USD")}</p>
            <div className="text-[12px] text-dim font-semibold space-y-1">
              <p>{t("ad.minOrder")}: <span dir="ltr">{fmt(c.minOrderUsd, "USD")}</span></p>
              <p>{t("ad.usage")}: {c.uses}/{c.maxUses} · {t("ad.maxPerCust")}: {c.maxPerCustomer}</p>
              <p>{t("ad.expiresAt")}: {formatDate(c.expiresAt, "en", false)}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Btn size="xs" variant="soft" onClick={() => handleToggle(c.code)}>{c.active ? t("c.disabled") : t("c.enabled")}</Btn>
              <Btn size="xs" variant="ghost" onClick={() => handleDelete(c.code)}><IX size={12} /> {t("c.delete")}</Btn>
            </div>
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("ad.createCoupon")}>
        <div className="space-y-4">
          <Field label={t("ad.couponCode")}><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER20" dir="ltr" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("ad.couponType")}>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="PERCENT">{t("ad.percent")}</option><option value="FIXED">{t("ad.fixed")} (USD)</option>
              </Select>
            </Field>
            <Field label={t("ad.value")}><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} dir="ltr" /></Field>
            <Field label={t("ad.minOrder")}><Input value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} dir="ltr" /></Field>
            <Field label={t("ad.maxUses")}><Input value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} dir="ltr" /></Field>
            <Field label={t("ad.maxPerCust")}><Input value={form.maxPer} onChange={(e) => setForm({ ...form, maxPer: e.target.value })} dir="ltr" /></Field>
            <Field label={`${t("ad.expiresAt")} (days)`}><Input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} dir="ltr" /></Field>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setOpen(false)}>{t("c.cancel")}</Btn>
            <Btn onClick={create}><ICheck size={15} /> {t("c.create")}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ================= CUSTOMERS ================= */
export function AdminCustomers() {
  const { db, t, user } = useApp();

  const handleRoleChange = async (userId: string, role: Role) => {
    try { await api.setRole(userId, role); toast(t("c.saved")); }
    catch (ex) { toast(t((ex as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="anim-fade">
      <h2 className="font-display text-lg font-extrabold mb-5">{t("ad.customers")} <span className="text-faint text-sm">({db.users.length})</span></h2>
      <div className="sk-card overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[680px]">
          <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line bg-raise/50">
            <th className="text-start font-extrabold py-3 px-4">{t("c.customer")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.role")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.language")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.currency")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("o.orders")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("a.verified")}</th>
          </tr></thead>
          <tbody>
            {db.users.map((u) => (
              <tr key={u.id} className="border-b border-line/50 last:border-0 hover:bg-raise/60 transition">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-raise border border-line text-[11px] font-extrabold text-volt-400 flex items-center justify-center">{u.name[0]}</span>
                    <div><p className="font-bold">{u.name}</p><p className="text-[11px] text-faint font-semibold">{u.email}</p></div>
                  </div>
                </td>
                <td className="py-3 px-2">
                  {can(user, "roles") && u.id !== user?.id ? (
                    <select className="sk-input !py-1.5 !text-[12px] !w-32" value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}>
                      {["OWNER", "ADMIN", "SUPPORT", "CUSTOMER"].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : <Badge tone={u.role === "CUSTOMER" ? "dim" : "volt"}>{u.role}</Badge>}
                </td>
                <td className="py-3 px-2 font-semibold text-dim uppercase">{u.lang}</td>
                <td className="py-3 px-2 font-mono text-dim">{u.currency}</td>
                <td className="py-3 px-2 font-bold tabular-nums">{db.orders.filter((o) => o.customerId === u.id).length}</td>
                <td className="py-3 px-2">{u.verified ? <ICheck size={15} className="text-volt-500" /> : <IAlert size={14} className="text-ember-400" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= TICKETS / EMAILS / AUDIT ================= */
export function AdminTickets() {
  const { db, t } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState("");
  const rows = db.tickets.filter((tk) => !filter || tk.status === filter);
  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display text-lg font-extrabold">{t("ad.tickets")}</h2>
        <div className="flex gap-1.5">
          {["", "OPEN", "PENDING", "CLOSED"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold border transition ${filter === s ? "bg-volt-500/12 border-volt-500/40 text-volt-400" : "border-line text-dim hover:border-edge"}`}>
              {s === "" ? t("c.all") : t(`s.${s.toLowerCase() === "open" ? "open" : s.toLowerCase() === "pending" ? "pending" : "closed"}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {rows.map((tk) => {
          const customer = db.users.find((u) => u.id === tk.customerId);
          const msgs = db.ticketMessages.filter((m) => m.ticketId === tk.id);
          return (
            <button key={tk.id} onClick={() => nav(`/support/${tk.id}`)} className="w-full sk-card p-4.5 flex items-center gap-4 hover:border-edge transition text-start flex-wrap">
              <span className="w-10 h-10 rounded-xl bg-raise border border-line text-volt-400 flex items-center justify-center shrink-0"><ILifebuoy size={17} /></span>
              <div className="flex-1 min-w-40">
                <p className="text-[13.5px] font-bold">{tk.subject}</p>
                <p className="text-[11.5px] text-faint font-semibold mt-0.5">{customer?.name} · {customer?.email} · {msgs.length} msg · {formatDate(tk.updatedAt, "en")}</p>
              </div>
              {tk.orderId && <Badge tone="dim" className="font-mono">{db.orders.find((o) => o.id === tk.orderId)?.number}</Badge>}
              <Badge tone={tk.status === "OPEN" ? "volt" : tk.status === "PENDING" ? "ember" : "dim"}>{tk.status}</Badge>
            </button>
          );
        })}
        {rows.length === 0 && <Empty icon={<ILifebuoy size={20} />} title={t("c.noResults")} />}
      </div>
    </div>
  );
}

export function AdminEmails() {
  const { db, t, user } = useApp();
  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold">{t("ad.emailLog")}</h2>
          <p className="text-[12px] text-faint font-semibold mt-0.5">{t("ad.provider")}: {db.settings.emailProvider} · {db.settings.emailFrom}</p>
        </div>
        <Btn size="sm" variant="soft" onClick={() => { try { api.sendTestEmail(); toast(t("ad.testSent"), "info"); } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); } }}>
          <ISend size={13} /> {t("ad.testEmail")}
        </Btn>
      </div>
      <div className="sk-card overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[640px]">
          <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line bg-raise/50">
            <th className="text-start font-extrabold py-3 px-4">{t("ad.recipient")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.emailType")}</th>
            <th className="text-start font-extrabold py-3 px-2">Subject</th>
            <th className="text-start font-extrabold py-3 px-2">Lang</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.status")}</th>
            <th className="text-start font-extrabold py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {db.emailLogs.slice(0, 40).map((e) => (
              <tr key={e.id} className="border-b border-line/50 last:border-0 hover:bg-raise/60">
                <td className="py-2.5 px-4"><p className="font-bold">{e.toName}</p><p className="text-[11px] text-faint font-semibold">{e.to}</p></td>
                <td className="py-2.5 px-2"><Badge tone="dim">{e.type}</Badge></td>
                <td className="py-2.5 px-2 text-dim font-semibold max-w-56 truncate">{e.subject}</td>
                <td className="py-2.5 px-2 font-mono text-dim uppercase">{e.lang}</td>
                <td className="py-2.5 px-2"><Badge tone={e.status === "SENT" ? "volt" : e.status === "FAILED" ? "danger" : "ember"}>{e.status}</Badge></td>
                <td className="py-2.5 px-4">
                  {e.status === "FAILED" && can(user, "emails") && <Btn size="xs" variant="soft" onClick={() => { api.retryEmail(e.id); toast(t("ad.testSent"), "info"); }}><IRefresh size={11} /> {t("ad.retry")}</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminAudit() {
  const { db, t } = useApp();
  const [q, setQ] = useState("");
  const rows = db.auditLogs.filter((a) => !q || a.action.toLowerCase().includes(q.toLowerCase()) || a.actorName.toLowerCase().includes(q.toLowerCase()) || a.target.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="anim-fade">
      <h2 className="font-display text-lg font-extrabold mb-1.5">{t("ad.audit")}</h2>
      <p className="text-[12.5px] text-dim mb-5">{t("ad.auditTrail")}</p>
      <div className="mb-5 max-w-sm"><SearchBox value={q} onChange={setQ} placeholder={t("c.search")} /></div>
      <div className="sk-card overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[640px]">
          <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line bg-raise/50">
            <th className="text-start font-extrabold py-3 px-4">{t("ad.action")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.actor")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("ad.target")}</th>
            <th className="text-start font-extrabold py-3 px-2">Meta</th>
            <th className="text-start font-extrabold py-3 px-4">{t("c.date")}</th>
          </tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-line/50 last:border-0 hover:bg-raise/60">
                <td className="py-2.5 px-4"><Badge tone={a.action.includes("REFUND") || a.action.includes("REVOK") ? "danger" : a.action.includes("DELIVER") ? "volt" : "dim"}>{a.action}</Badge></td>
                <td className="py-2.5 px-2 font-bold">{a.actorName}</td>
                <td className="py-2.5 px-2 font-mono text-[11.5px] text-dim">{a.target}</td>
                <td className="py-2.5 px-2 text-dim font-semibold">{a.meta || "—"}</td>
                <td className="py-2.5 px-4 text-faint font-semibold text-[11px] whitespace-nowrap">{formatDate(a.at, "en")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= REVIEWS MODERATION ================= */
export function AdminReviews() {
  const { db, t } = useApp();
  const [filter, setFilter] = useState("pending");
  const rows = db.reviews.filter((r) => filter === "all" ? true : filter === "pending" ? !r.approved : r.approved);
  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="font-display text-lg font-extrabold">{t("c.reviews")}</h2>
        <div className="flex gap-1.5">
          {[["pending", t("fs.PENDING")], ["all", t("c.all")], ["approved", t("a.verified")]].map(([v, label]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold border transition ${filter === v ? "bg-volt-500/12 border-volt-500/40 text-volt-400" : "border-line text-dim hover:border-edge"}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const p = db.products.find((x) => x.id === r.productId);
          return (
            <div key={r.id} className="sk-card p-5">
              <div className="flex items-center gap-3 flex-wrap mb-2.5">
                <img src={p?.image} alt="" className="w-9 h-9 rounded-lg object-cover" />
                <div className="flex-1 min-w-40">
                  <p className="text-[13px] font-bold">{r.customerName} <span className="text-faint font-semibold">→ {p?.name.en}</span></p>
                  <p className="text-[11px] text-faint font-semibold">{formatDate(r.createdAt, "en")}</p>
                </div>
                {"★★★★★".slice(0, r.rating)}<span className="text-faint">{"★★★★★".slice(r.rating)}</span>
                {r.verified && <Badge tone="volt"><ICheck size={10} /> {t("p.verified")}</Badge>}
                <Badge tone={r.approved ? "volt" : "ember"}>{r.approved ? t("c.active") : t("fs.PENDING")}</Badge>
              </div>
              <p className="text-[13.5px] text-dim leading-relaxed mb-3.5">“{r.text}”</p>
              <div className="flex gap-2">
                {!r.approved && <Btn size="xs" onClick={() => { api.moderateReview(r.id, true); toast(t("c.saved")); }}><ICheck size={12} /> approve</Btn>}
                {r.approved && <Btn size="xs" variant="soft" onClick={() => { api.moderateReview(r.id, false); toast(t("c.saved"), "info"); }}>unpublish</Btn>}
                <Btn size="xs" variant="ghost" onClick={() => { api.deleteReview(r.id); toast(t("c.saved"), "info"); }}><IX size={12} /> {t("c.delete")}</Btn>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <Empty icon={<IFile size={20} />} title={t("c.noResults")} />}
      </div>
    </div>
  );
}

/* ================= SETTINGS ================= */
export function AdminSettings() {
  const { db, t, user } = useApp();
  const s = db.settings;
  const [resetOpen, setResetOpen] = useState(false);
  const nav = useNavigate();

  return (
    <div className="anim-fade space-y-6 max-w-3xl">
      <h2 className="font-display text-lg font-extrabold">{t("ad.settings")}</h2>

      <section className="sk-card p-6 space-y-4">
        <h3 className="font-display text-[14px] font-bold">{t("ad.store")}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("brand")}><Input defaultValue={s.storeName} onBlur={(e) => api.updateSettings({ storeName: e.target.value })} /></Field>
          <Field label={t("f.contact")}><Input defaultValue={s.contactEmail} onBlur={(e) => api.updateSettings({ contactEmail: e.target.value })} dir="ltr" /></Field>
          <Field label={t("nav.support")}><Input defaultValue={s.supportEmail} onBlur={(e) => api.updateSettings({ supportEmail: e.target.value })} dir="ltr" /></Field>
          <Field label={`${t("ad.taxRate")}`}><Input defaultValue={String(s.taxRatePct)} onBlur={(e) => api.updateSettings({ taxRatePct: Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)) })} dir="ltr" /></Field>
        </div>
      </section>

      <section className="sk-card p-6 space-y-4">
        <h3 className="font-display text-[14px] font-bold">Gateways</h3>
        <p className="text-[12.5px] text-dim">{t("ad.gatewayNote")}</p>
        {([["stripeEnabled", t("ad.stripe"), "STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET"], ["paypalEnabled", t("ad.paypal"), "PAYPAL_CLIENT_ID · PAYPAL_CLIENT_SECRET"]] as const).map(([k, label, env]) => (
          <div key={k} className="flex items-center justify-between gap-4 border border-line rounded-xl px-4 py-3.5">
            <div><p className="text-[13.5px] font-bold">{label}</p><code className="text-[10.5px] text-faint font-mono" dir="ltr">{env}</code></div>
            <button onClick={() => api.updateSettings({ [k]: !s[k] } as Partial<typeof s>)} className={`w-11 h-6.5 rounded-full border transition relative ${s[k] ? "bg-volt-500/80 border-volt-500" : "bg-raise border-line"}`} aria-label={label}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s[k] ? "start-[calc(100%-1.375rem)]" : "start-0.5"}`} />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border border-ember-500/30 bg-ember-500/5 rounded-xl px-4 py-3.5">
          <div><p className="text-[13.5px] font-bold text-ember-400 flex items-center gap-2"><IWrench size={13} /> {t("ad.maintenance")}</p><p className="text-[11.5px] text-faint font-semibold">{t("e.maintenance")}</p></div>
          <button onClick={() => api.updateSettings({ maintenanceMode: !s.maintenanceMode })} className={`w-11 h-6.5 rounded-full border transition relative ${s.maintenanceMode ? "bg-ember-500/80 border-ember-500" : "bg-raise border-line"}`} aria-label="maintenance">
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s.maintenanceMode ? "start-[calc(100%-1.375rem)]" : "start-0.5"}`} />
          </button>
        </div>
      </section>

      <section className="sk-card p-6 space-y-4">
        <h3 className="font-display text-[14px] font-bold">{t("ad.fx")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(Object.keys(s.fx) as (keyof typeof s.fx)[]).map((c) => (
            <Field key={c} label={`${c} / USD`}>
              <Input defaultValue={String(s.fx[c])} dir="ltr"
                onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) api.updateSettings({ fx: { ...db.settings.fx, [c]: v } }); }} />
            </Field>
          ))}
        </div>
      </section>

      <section className="sk-card p-6 space-y-4">
        <h3 className="font-display text-[14px] font-bold">{t("ad.langs")} · {t("ad.currencies")}</h3>
        <div className="flex flex-wrap gap-2">
          {(["en", "ar", "ru", "fr"] as const).map((l) => (
            <button key={l} onClick={() => api.updateSettings({ langs: s.langs.includes(l) ? s.langs.filter((x) => x !== l) : [...s.langs, l] })}
              className={`px-3.5 py-2 rounded-lg border text-[12.5px] font-bold uppercase transition ${s.langs.includes(l) ? "border-volt-500/50 bg-volt-500/8 text-volt-400" : "border-line text-dim"}`}>{l}</button>
          ))}
          <span className="w-px bg-line mx-2" />
          {(["USD", "EUR", "SAR", "RUB"] as const).map((c) => (
            <button key={c} onClick={() => api.updateSettings({ currencies: s.currencies.includes(c) ? s.currencies.filter((x) => x !== c) : [...s.currencies, c] })}
              className={`px-3.5 py-2 rounded-lg border text-[12.5px] font-bold font-mono transition ${s.currencies.includes(c) ? "border-volt-500/50 bg-volt-500/8 text-volt-400" : "border-line text-dim"}`}>{c}</button>
          ))}
        </div>
      </section>

      <section className="sk-card p-6 space-y-4">
        <h3 className="font-display text-[14px] font-bold">Email</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("ad.provider")}>
            <Select value={s.emailProvider} onChange={(e) => api.updateSettings({ emailProvider: e.target.value as typeof s.emailProvider })}>
              <option value="RESEND">Resend</option><option value="SES">Amazon SES</option><option value="SMTP">SMTP</option>
            </Select>
          </Field>
          <Field label="From"><Input defaultValue={s.emailFrom} onBlur={(e) => api.updateSettings({ emailFrom: e.target.value })} dir="ltr" /></Field>
        </div>
        <label className="flex items-center gap-2.5 text-[13px] font-bold text-dim cursor-pointer">
          <input type="checkbox" checked={s.requireReviewApproval} onChange={(e) => api.updateSettings({ requireReviewApproval: e.target.checked })} className="accent-[#2fc98a] w-4 h-4" />
          {t("p.writeReview")}: admin approval
        </label>
      </section>

      <section className="sk-card p-6 !border-danger-500/30">
        <h3 className="font-display text-[14px] font-bold text-danger-400 mb-2">Danger zone</h3>
        <p className="text-[12.5px] text-dim mb-4">{t("ad.resetData")} — PostgreSQL → seed</p>
        <Btn variant="danger" size="sm" onClick={() => setResetOpen(true)}><IAlert size={14} /> {t("ad.resetData")}</Btn>
      </section>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title={t("ad.resetData")}>
        <div className="space-y-4">
          <p className="text-[13px] text-dim leading-relaxed flex gap-2"><IAlert size={16} className="text-danger-400 shrink-0 mt-0.5" /> {t("ad.cancelConfirm")}</p>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setResetOpen(false)}>{t("c.cancel")}</Btn>
            <Btn variant="danger" onClick={async () => { await storeReset(); setResetOpen(false); toast(t("ad.resetOk"), "info"); nav("/admin"); }}>{t("c.confirm")}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
import { store as storeResetHolder } from "../state/store";
const storeReset = () => storeResetHolder.resetWorkspace();

/* ================= PAYMENT PROVIDERS (req. 6) — OWNER only ================= */
import { PROVIDER_META, providerCfg, providerStatus, type ProviderId, type PaymentRouting } from "../lib/payments";
import { IStripe, IPaypal, ICard, IShield, ICoins } from "../components/icons";

const PROV_ICON: Record<ProviderId, (p: { size?: number; className?: string }) => React.ReactNode> = {
  STRIPE: (p) => <IStripe {...p} />, PAYPAL: (p) => <IPaypal {...p} />, MIR_ACQUIRER: (p) => <ICard {...p} />,
};

export function AdminPayments() {
  const { db, t, user } = useApp();
  const s = db.settings;
  const isOwner = user?.role === "OWNER";
  const routing = s.routing ?? { CARD_INTL: "STRIPE", CARD_MIR: "MIR_ACQUIRER", PAYPAL: "PAYPAL" };

  const toggleCurrency = (id: ProviderId, cur: string) => {
    const cfg = providerCfg(s, id);
    const currencies = cfg.currencies.includes(cur as never)
      ? cfg.currencies.filter((c) => c !== cur)
      : [...cfg.currencies, cur as never];
    api.updateProviderConfig(id, { currencies });
    toast(t("c.saved"));
  };

  return (
    <div className="anim-fade space-y-6">
      <div>
        <h2 className="font-display text-lg font-extrabold flex items-center gap-2.5"><ICoins size={19} className="text-volt-400" /> {t("ad.payTitle")}</h2>
        <p className="text-[12.5px] text-dim mt-1 max-w-2xl leading-relaxed">{t("ad.payDesc")}</p>
        <p className="mt-2 text-[11.5px] font-semibold text-ember-400/90 flex items-start gap-2 max-w-2xl leading-relaxed">
          <IShield size={13} className="shrink-0 mt-0.5" /> {t("ad.payLiveNote")}
        </p>
        {!isOwner && <p className="mt-2 text-[12px] font-bold text-ember-400 flex items-center gap-1.5"><IShield size={13} /> {t("ad.payOwnerOnly")}</p>}
      </div>

      {/* §24 live provider activity — computed from payment_events / payments rows */}
      <div className="grid lg:grid-cols-3 gap-4">
        {(Object.keys(PROVIDER_META) as ProviderId[]).map((id) => {
          const events = db.paymentEvents.filter((e) => e.provider === id);
          const lastWebhook = events[events.length - 1];
          const paid = db.payments.filter((p) => p.provider === id && (p.status === "PAID" || p.status === "REFUNDED") && p.capturedAt);
          const lastSuccess = paid[paid.length - 1];
          const failed = db.payments.filter((p) => p.provider === id && p.status === "FAILED");
          const lastFailed = failed[failed.length - 1];
          const Row = ({ dot, label, value }: { dot: string; label: string; value: string }) => (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="flex items-center gap-2 text-[11.5px] font-bold text-dim"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{label}</span>
              <span className="text-[11px] font-mono text-faint truncate" dir="ltr">{value}</span>
            </div>
          );
          return (
            <section key={`act-${id}`} className="sk-card px-5 py-4">
              <p className="text-[10.5px] font-extrabold uppercase tracking-widest text-faint mb-1.5">{PROVIDER_META[id].label} — activity</p>
              <Row dot="bg-sky-500" label="Last webhook"
                value={lastWebhook ? `${lastWebhook.type.replace("payment.", "")} · ${formatDate(lastWebhook.receivedAt, "en")}` : "—"} />
              <Row dot="bg-volt-500" label="Last success"
                value={lastSuccess ? `${(lastSuccess.amountMinor / 100).toLocaleString("en", { maximumFractionDigits: 2 })} ${lastSuccess.currency} · ${formatDate(lastSuccess.capturedAt!, "en")}` : "—"} />
              <Row dot="bg-danger-500" label="Last failed"
                value={lastFailed ? `${formatDate(lastFailed.updatedAt, "en")}` : "—"} />
            </section>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {(Object.keys(PROVIDER_META) as ProviderId[]).map((id) => {
          const cfg = providerCfg(s, id);
          const meta = PROVIDER_META[id];
          return (
            <section key={id} className={`sk-card p-5 ${!cfg.enabled ? "opacity-70" : ""}`}>
              <div className="flex items-center gap-3 mb-4">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cfg.enabled ? "bg-volt-500/10 border-volt-500/30 text-volt-400" : "bg-raise border-line text-faint"}`}>
                  {PROV_ICON[id]({ size: 18 })}
                </span>
                <div className="flex-1">
                  <h3 className="font-display text-[13.5px] font-bold">{meta.label}</h3>
                  <p className="text-[11px] text-faint font-semibold font-mono" dir="ltr">{t("ad.payMerchant")}: {cfg.merchantMasked}</p>
                </div>
                {(() => {
                  const st = providerStatus(cfg);
                  return (
                    <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9.5px] font-extrabold tracking-wider ${
                      st === "OPERATIONAL" ? "border-volt-500/40 bg-volt-500/10 text-volt-400"
                        : st === "TEST_READY" ? "border-ember-500/40 bg-ember-500/10 text-ember-400"
                        : "border-danger-500/40 bg-danger-500/10 text-danger-400"}`}
                      title={t("ad.payLiveNote")}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st === "OPERATIONAL" ? "bg-volt-500" : st === "TEST_READY" ? "bg-ember-500 anim-pulse-dot" : "bg-danger-500"}`} />
                      {st === "OPERATIONAL" ? t("ad.payOp") : st === "TEST_READY" ? t("ad.payTestReady") : t("ad.payNotCfg")}
                    </span>
                  );
                })()}
              </div>
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-dim">{t("ad.payEnabled")}</span>
                  <input type="checkbox" disabled={!isOwner} checked={cfg.enabled} aria-label={`${meta.label} ${t("ad.payEnabled")}`}
                    onChange={(e) => { api.updateProviderConfig(id, { enabled: e.target.checked }); toast(t("c.saved")); }} className="accent-[#2fc98a] w-4.5 h-4.5" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-dim">{t("ad.payOperational")}</span>
                  <input type="checkbox" disabled={!isOwner} checked={cfg.operational} aria-label={`${meta.label} ${t("ad.payOperational")}`}
                    onChange={(e) => { api.updateProviderConfig(id, { operational: e.target.checked }); toast(t("c.saved")); }} className="accent-[#2fc98a] w-4.5 h-4.5" />
                </div>
                <Field label={t("ad.payMode")}>
                  <Select disabled={!isOwner} value={cfg.mode} onChange={(e) => { api.updateProviderConfig(id, { mode: e.target.value as "TEST" | "LIVE" }); toast(t("c.saved")); }}>
                    <option value="TEST">TEST</option>
                    <option value="LIVE">LIVE</option>
                  </Select>
                </Field>
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-faint mb-2">{t("ad.payCur")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["USD", "EUR", "SAR", "RUB"] as const).map((cur) => {
                      const on = cfg.currencies.includes(cur);
                      return (
                        <button key={cur} disabled={!isOwner} onClick={() => toggleCurrency(id, cur)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11.5px] font-mono font-bold transition min-h-9 ${on ? "border-volt-500/50 bg-volt-500/10 text-volt-400" : "border-line text-faint hover:border-edge"}`}
                          aria-pressed={on}>{cur}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="sk-card p-6">
        <h3 className="font-display text-[14px] font-bold mb-1.5">{t("ad.payRoutingTitle")}</h3>
        <p className="text-[12px] text-dim mb-5 leading-relaxed">{t("co.settleNote")}</p>
        <div className="grid sm:grid-cols-3 gap-4">
          {([["CARD_INTL", t("ad.payRouteCard"), ["STRIPE", "PAYPAL"]], ["CARD_MIR", t("ad.payRouteMir"), ["MIR_ACQUIRER", "STRIPE"]], ["PAYPAL", t("ad.payRoutePaypal"), ["PAYPAL"]]] as [keyof PaymentRouting, string, ProviderId[]][]).map(([key, label, opts]) => (
            <Field key={key} label={label}>
              <Select disabled={!isOwner} value={routing[key]} onChange={(e) => { api.updatePaymentRouting({ [key]: e.target.value } as Partial<PaymentRouting>); toast(t("c.saved")); }}>
                {opts.map((o) => <option key={o} value={o}>{PROVIDER_META[o].label}</option>)}
              </Select>
            </Field>
          ))}
        </div>
      </section>

      <p className="text-[11.5px] text-faint font-semibold flex gap-2 leading-relaxed"><IShield size={13} className="shrink-0 mt-0.5 text-volt-400" /> {t("ad.payCreds")}</p>
    </div>
  );
}
