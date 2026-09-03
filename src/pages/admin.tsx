import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, api, can, isStaff, orderStateKey, stats, availableStock, type Perm } from "../state/store";
import { formatDate } from "../lib/money";
import { Badge, BarChart, Btn, Empty, Field, Input, Modal, OrderBadge, KeyBadge, SearchBox, Stat, Textarea, toast } from "../components/ui";
import { IChart, IGrid, IBox, IKey, ITag, IUsers, ILifebuoy, IMail, IFile, IGear, ITerminal, ICoins, IBolt, IAlert, IWrench, IUndo, IBan, IClock, ICheck, ISend, IArrowR, ILock } from "../components/icons";
import type { Order } from "../lib/types";

/* ---------------- shell ---------------- */
export function AdminShell({ children }: { children: ReactNode }) {
  const { t, user } = useApp();
  const nav = useNavigate();
  const section = window.location.hash.replace(/^#\/admin\/?/, "").split("/")[0] || "overview";
  if (!user || !isStaff(user))
    return <div className="max-w-2xl mx-auto px-4 py-24"><Empty icon={<ILock size={22} />} title={t("e.forbidden")} desc={t("au.login")} action={<Btn onClick={() => nav("/auth/login")}>{t("au.login")}</Btn>} /></div>;

  const items: [string, string, ReactNode, Perm | null][] = [
    ["overview", t("ad.overview"), <IChart size={15} key="a" />, null],
    ["orders", t("ad.orders"), <IGrid size={15} key="b" />, "orders"],
    ["products", t("ad.products"), <IBox size={15} key="c" />, "products"],
    ["keys", t("ad.keys"), <IKey size={15} key="d" />, "keys"],
    ["coupons", t("ad.coupons"), <ITag size={15} key="e" />, "coupons"],
    ["customers", t("ad.customers"), <IUsers size={15} key="f" />, "customers"],
    ["tickets", t("ad.tickets"), <ILifebuoy size={15} key="g" />, "tickets"],
    ["reviews", t("c.reviews"), <IChart size={15} key="k" />, "products"],
    ["emails", t("ad.emails"), <IMail size={15} key="h" />, "emails"],
    ["audit", t("ad.audit"), <IFile size={15} key="i" />, "audit"],
    ["settings", t("ad.settings"), <IGear size={15} key="j" />, "settings"],
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 pt-8">
      <div className="flex items-center gap-3 mb-7 anim-fade-up flex-wrap">
        <span className="w-11 h-11 rounded-xl bg-volt-500/12 border border-volt-500/30 text-volt-400 flex items-center justify-center"><ITerminal size={19} /></span>
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight">{t("ad.title")} <span className="text-volt-400">Console</span></h1>
          <p className="text-[12px] text-faint font-semibold">{user.name} · {user.role}</p>
        </div>
      </div>
      <div className="grid lg:grid-cols-[210px_1fr] gap-7 items-start">
        <nav className="sk-card p-2 lg:sticky lg:top-28 flex lg:flex-col gap-1 overflow-x-auto">
          {items.map(([key, label, icon, perm]) => {
            if (perm && !can(user, perm)) return null;
            return (
              <button key={key} onClick={() => nav(`/admin/${key}`)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-[13px] font-bold whitespace-nowrap transition ${section === key ? "bg-volt-500/10 text-volt-400" : "text-dim hover:text-fog hover:bg-raise"}`}>
                {icon} {label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- overview ---------------- */
export function AdminOverview() {
  const { db, t, user, fmt } = useApp();
  const nav = useNavigate();
  const s = stats(db);
  const usd = (n: number) => fmt(n, "USD");
  const recent = db.orders.slice(0, 6);
  const queue = db.orders.filter((o) => o.paymentStatus === "PAID" && o.fulfillmentStatus === "PROCESSING");
  const recentCustomers = [...db.users.filter((u) => u.role === "CUSTOMER")].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);

  return (
    <div className="space-y-6 anim-fade">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Stat label={t("ad.revenue")} value={usd(s.revenueUsd)} icon={<ICoins size={15} />} />
        <Stat label={t("ad.revenue30")} value={usd(s.revenue30)} icon={<IChart size={15} />} tone="sky" />
        <Stat label={t("ad.ordersTotal")} value={s.orders} icon={<IGrid size={15} />} tone="ember" />
        <Stat label={t("ad.customersTotal")} value={s.customers} icon={<IUsers size={15} />} tone="sky" />
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Stat label={t("ad.vault")} value={s.vaultKeys} icon={<IKey size={15} />} />
        <Stat label={t("h.delivered")} value={s.deliveredKeys} icon={<IBolt size={15} />} />
        <Stat label={t("ad.pendingMan")} value={s.pendingManual} icon={<IWrench size={15} />} tone="ember" />
        <Stat label={t("ad.failedPay")} value={s.failedPayments} icon={<IAlert size={15} />} tone="danger" />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="sk-card p-5">
          <h3 className="font-display text-[14px] font-bold mb-5">{t("ad.chart14")}</h3>
          <BarChart data={s.days} money={usd} />
        </div>
        <div className="space-y-5">
          <div className="sk-card p-5">
            <h3 className="font-display text-[14px] font-bold mb-3.5 flex items-center gap-2"><IWrench size={14} className="text-ember-400" /> {t("ad.manualQueue")}</h3>
            {queue.length === 0 ? <p className="text-[12.5px] text-faint font-semibold py-3">{t("c.noResults")}</p> : queue.map((o) => (
              <button key={o.id} onClick={() => nav(`/admin/orders/${o.id}`)} className="w-full flex items-center gap-3 py-2.5 border-b border-line/60 last:border-0 hover:bg-raise rounded-lg px-2 transition text-start">
                <span className="w-8 h-8 rounded-lg bg-ember-500/12 border border-ember-500/25 text-ember-400 flex items-center justify-center"><IClock size={14} /></span>
                <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-bold truncate">{o.number} · {o.items[0]?.name}</span><span className="text-[11px] text-faint font-semibold">{o.customerName}</span></span>
                <IArrowR size={13} className="text-faint rtl:rotate-180" />
              </button>
            ))}
          </div>
          <div className="sk-card p-5">
            <h3 className="font-display text-[14px] font-bold mb-3.5 flex items-center gap-2"><IAlert size={14} className="text-ember-400" /> {t("ad.lowStock")}</h3>
            {s.lowStock.length === 0 ? <p className="text-[12.5px] text-faint font-semibold py-3">{t("c.noResults")}</p> : s.lowStock.map((p) => (
              <Link key={p.id} to={`/admin/keys?product=${p.id}`} className="flex items-center gap-3 py-2.5 border-b border-line/60 last:border-0 hover:bg-raise rounded-lg px-2 transition">
                <img src={p.image} alt="" className="w-8 h-8 rounded-lg object-cover" />
                <span className="flex-1 min-w-0 text-[12.5px] font-bold truncate">{p.name.en}</span>
                <Badge tone="ember">{availableStock(db, p)} {t("c.left")}</Badge>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="sk-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-[14px] font-bold">{t("ad.recentOrders")}</h3>
            <button onClick={() => nav("/admin/orders")} className="text-[12px] font-bold text-volt-400 hover:underline">{t("c.viewAll")}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line">
                <th className="text-start font-extrabold py-2 pe-3">{t("o.order")}</th><th className="text-start font-extrabold py-2 pe-3">{t("c.customer")}</th>
                <th className="text-start font-extrabold py-2 pe-3">{t("c.amount")}</th><th className="text-start font-extrabold py-2">{t("c.status")}</th>
              </tr></thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} onClick={() => nav(`/admin/orders/${o.id}`)} className="border-b border-line/50 last:border-0 hover:bg-raise cursor-pointer transition">
                    <td className="py-2.5 pe-3 font-mono font-bold">{o.number}</td>
                    <td className="py-2.5 pe-3 text-dim font-semibold">{o.customerName}</td>
                    <td className="py-2.5 pe-3 font-bold tabular-nums" dir="ltr">{usd(o.totalUsd)}</td>
                    <td className="py-2.5"><OrderBadge stateKey={orderStateKey(o)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sk-card p-5">
          <h3 className="font-display text-[14px] font-bold mb-3.5">{t("ad.customers")}</h3>
          {recentCustomers.map((c) => {
            const n = db.orders.filter((o) => o.customerId === c.id).length;
            return (
              <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-line/60 last:border-0">
                <span className="w-8 h-8 rounded-lg bg-raise border border-line text-[11px] font-extrabold text-volt-400 flex items-center justify-center">{c.name[0]}</span>
                <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-bold truncate">{c.name}</span><span className="text-[11px] text-faint font-semibold">{formatDate(c.createdAt, user?.lang ?? "en", false)}</span></span>
                <span className="text-[11px] font-bold text-dim tabular-nums">{n} {t("o.orders").toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- orders list ---------------- */
const ORDER_FILTERS = ["ALL", "st.PAID", "st.PROCESSING", "st.DELIVERED", "st.COMPLETED", "st.CANCELLED", "st.REFUNDED", "st.FAILED", "st.PENDING_PAYMENT"];

export function AdminOrders() {
  const { db, t, fmt } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [method, setMethod] = useState("");

  const rows = useMemo(() => db.orders.filter((o) => {
    if (filter !== "ALL" && orderStateKey(o) !== filter) return false;
    if (method && o.paymentMethod !== method) return false;
    const s = q.toLowerCase();
    if (s && !o.number.toLowerCase().includes(s) && !o.email.toLowerCase().includes(s) && !o.customerName.toLowerCase().includes(s)) return false;
    return true;
  }), [db.orders, q, filter, method]);

  return (
    <div className="anim-fade">
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1"><SearchBox value={q} onChange={setQ} placeholder={t("ad.searchOrders")} /></div>
        <select className="sk-input !w-auto" value={method} onChange={(e) => setMethod(e.target.value)} aria-label={t("c.method")}>
          <option value="">{t("c.method")}: {t("c.all")}</option>
          <option value="STRIPE">Stripe</option>
          <option value="PAYPAL">PayPal</option>
        </select>
      </div>
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {ORDER_FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold whitespace-nowrap border transition ${filter === f ? "bg-volt-500/12 border-volt-500/40 text-volt-400" : "border-line text-dim hover:border-edge"}`}>
            {f === "ALL" ? t("c.all") : t(f)}
          </button>
        ))}
      </div>
      <div className="sk-card overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[720px]">
          <thead><tr className="text-faint text-[10.5px] uppercase tracking-wider border-b border-line bg-raise/50">
            <th className="text-start font-extrabold py-3 px-4">{t("o.order")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.customer")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.date")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("c.amount")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("o.payStatus")}</th>
            <th className="text-start font-extrabold py-3 px-2">{t("o.fulfill")}</th>
            <th className="text-start font-extrabold py-3 px-4"></th>
          </tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-line/50 last:border-0 hover:bg-raise/60 transition">
                <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">{o.number}</td>
                <td className="py-3 px-2"><p className="font-bold">{o.customerName}</p><p className="text-[11px] text-faint font-semibold">{o.email}</p></td>
                <td className="py-3 px-2 text-dim font-semibold whitespace-nowrap">{formatDate(o.createdAt, "en", false)}</td>
                <td className="py-3 px-2 font-bold tabular-nums whitespace-nowrap" dir="ltr">{fmt(o.totalUsd, "USD")}</td>
                <td className="py-3 px-2"><Badge tone={o.paymentStatus === "PAID" ? "volt" : o.paymentStatus === "PENDING" ? "ember" : "danger"}>{t(`ps.${o.paymentStatus}`)}</Badge></td>
                <td className="py-3 px-2"><Badge tone={o.fulfillmentStatus === "DELIVERED" || o.fulfillmentStatus === "COMPLETED" ? "volt" : o.fulfillmentStatus === "PROCESSING" ? "sky" : o.fulfillmentStatus === "PENDING" ? "ember" : "danger"}>{t(`fs.${o.fulfillmentStatus}`)}</Badge></td>
                <td className="py-3 px-4"><Btn size="xs" variant="soft" onClick={() => nav(`/admin/orders/${o.id}`)}>{t("ad.viewOrder")}</Btn></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7}><Empty icon={<IGrid size={20} />} title={t("c.noResults")} /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- order detail + actions ---------------- */
export function AdminOrderDetail() {
  const { id } = useParams();
  const { db, t, user, fmt } = useApp();
  const nav = useNavigate();
  const o = db.orders.find((x) => x.id === id);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [payload, setPayload] = useState({ keys: "", code: "", account: "", link: "", notes: "" });

  if (!o) return <Empty icon={<IGrid size={22} />} title={t("e.404t")} action={<Btn variant="soft" onClick={() => nav("/admin/orders")}>{t("c.back")}</Btn>} />;
  const events = db.paymentEvents.filter((e) => e.orderId === o.id);
  const refund = db.refunds.find((r) => r.orderId === o.id);
  const customer = db.users.find((u) => u.id === o.customerId);
  const canDeliver = can(user, "deliver") && o.paymentStatus === "PAID" && (o.fulfillmentStatus === "PROCESSING" || o.fulfillmentStatus === "PENDING");

  const doDeliver = () => {
    const keys = payload.keys.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!keys.length && !payload.account && !payload.code && !payload.link) { toast(t("e.generic"), "err"); return; }
    try {
      api.deliverManual(o.id, { keys, activationCode: payload.code || null, account: payload.account || null, downloadLink: payload.link || null, notes: payload.notes || null });
      toast(t("ad.deliveredOk"), "ok"); setDeliverOpen(false);
    } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };
  const doRefund = () => {
    try { api.refundOrder(o.id, reason || "Customer request"); toast(t("ad.refundOk"), "ok"); setRefundOpen(false); setReason(""); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };
  const doCancel = () => {
    try { api.cancelOrder(o.id); toast(t("ad.cancelOk"), "info"); setCancelOpen(false); }
    catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <button onClick={() => nav("/admin/orders")} className="text-[12.5px] font-bold text-volt-400 hover:underline mb-1.5">← {t("ad.orders")}</button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-xl font-extrabold">{o.number}</h2>
            <OrderBadge stateKey={orderStateKey(o)} />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canDeliver && <Btn size="sm" onClick={() => setDeliverOpen(true)}><IWrench size={14} /> {t("ad.deliver")}</Btn>}
          {can(user, "orders") && o.fulfillmentStatus === "DELIVERED" && <Btn size="sm" variant="soft" onClick={() => { try { api.completeOrder(o.id); toast(t("ad.completedOk")); } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); } }}><ICheck size={14} /> {t("ad.markCompleted")}</Btn>}
          {can(user, "orders") && <Btn size="sm" variant="soft" onClick={() => { try { api.resendReceipt(o.id); toast(t("ad.resendOk"), "info"); } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); } }}><ISend size={13} /> {t("ad.resend")}</Btn>}
          {can(user, "refund") && o.paymentStatus === "PAID" && <Btn size="sm" variant="danger" onClick={() => setRefundOpen(true)}><IUndo size={14} /> {t("ad.refund")}</Btn>}
          {can(user, "cancel") && o.paymentStatus !== "REFUNDED" && o.fulfillmentStatus !== "CANCELLED" && <Btn size="sm" variant="danger" onClick={() => setCancelOpen(true)}><IBan size={14} /> {t("ad.cancelOrder")}</Btn>}
        </div>
      </div>

      {o.paymentStatus === "PAID" && (o.fulfillmentStatus === "PROCESSING" || o.fulfillmentStatus === "PENDING") && (
        <div className="sk-card !border-ember-500/35 bg-ember-500/6 p-4 mb-6 flex items-center gap-3 flex-wrap">
          <IClock size={16} className="text-ember-400" />
          <p className="text-[13px] font-bold text-ember-400 flex-1 min-w-40">{t("ad.pendingMan")}: {o.items.map((i) => i.name).join(", ")}</p>
          {canDeliver && <Btn size="sm" onClick={() => setDeliverOpen(true)}>{t("ad.deliverNow")}</Btn>}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="space-y-5">
          <div className="sk-card p-5">
            <h3 className="font-display text-[13.5px] font-bold mb-4">{t("o.details")}</h3>
            <div className="space-y-3">
              {o.items.map((it) => (
                <div key={it.productId} className="flex items-center gap-3.5">
                  <img src={it.image} alt="" className="w-11 h-11 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0"><p className="text-[13px] font-bold truncate">{it.name}</p><p className="text-[11px] text-faint font-semibold" dir="ltr">{fmt(it.unitUsd, "USD")} × {it.qty} · {it.deliveryMethod}</p></div>
                  <span className="font-bold text-[13px] tabular-nums" dir="ltr">{fmt(it.lineTotalUsd, "USD")}</span>
                </div>
              ))}
            </div>
            <div className="pt-4 mt-4 border-t border-line grid sm:grid-cols-2 gap-2 text-[12.5px] font-semibold">
              <span className="text-dim">{t("c.discount")}: <strong dir="ltr">{fmt(o.discountUsd, "USD")}</strong> {o.couponCode && `(${o.couponCode})`}</span>
              <span className="text-dim">{t("co.tax")}: <strong dir="ltr">{fmt(o.taxUsd, "USD")}</strong></span>
              <span className="text-dim">{t("c.total")}: <strong className="font-display" dir="ltr">{fmt(o.totalUsd, "USD")}</strong> <span className="text-faint">({fmt(o.totalMinor, o.currency)} {o.currency} @ {o.fxRate})</span></span>
              <span className="text-dim">{t("c.method")}: <strong>{o.paymentMethod}</strong> {o.paymentId && <code className="text-faint" dir="ltr">{o.paymentId}</code>}</span>
            </div>
            {o.delivery && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-faint mb-2">{t("o.deliveryInfo")}</p>
                {o.delivery.keys.map((k) => <code key={k} className="block font-mono text-[12px] text-volt-400 bg-canvas border border-line rounded-lg px-3 py-1.5 mb-1.5" dir="ltr">{k}</code>)}
                {o.delivery.account && <p className="text-[12px] text-dim">{t("ad.accountPayload")}: <code dir="ltr">{o.delivery.account}</code></p>}
                {o.delivery.notes && <p className="text-[12px] text-dim mt-1">{o.delivery.notes}</p>}
                {o.deliveredBy && <p className="text-[11px] text-faint font-semibold mt-2">{t("ad.deliver")} {t("ad.by")} {db.users.find((u) => u.id === o.deliveredBy)?.name ?? "—"}</p>}
              </div>
            )}
            {refund && <p className="mt-3 text-[12px] font-bold text-danger-400 flex items-center gap-2"><IUndo size={13} /> {fmt(refund.amountUsd, "USD")} — {refund.reason}</p>}
          </div>

          <div className="sk-card p-5">
            <h3 className="font-display text-[13.5px] font-bold mb-4">{t("ad.payEvents")}</h3>
            {events.length === 0 && <p className="text-[12.5px] text-faint font-semibold">{t("c.noResults")}</p>}
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.eventId} className="flex items-center gap-3 bg-canvas border border-line rounded-[10px] px-3.5 py-2.5">
                  <span className={`w-2 h-2 rounded-full ${e.type === "payment.captured" ? "bg-volt-500" : "bg-danger-500"}`} />
                  <code className="font-mono text-[11.5px] text-dim flex-1" dir="ltr">{e.eventId}</code>
                  <Badge tone={e.type === "payment.captured" ? "volt" : "danger"}>{e.type}</Badge>
                  <Badge tone={e.signatureValid ? "dim" : "danger"}>{e.signatureValid ? "sig ✓" : "sig ✗"}</Badge>
                  <span className="text-[11px] text-faint font-semibold hidden sm:block">{formatDate(e.receivedAt, "en")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="sk-card p-5">
            <h3 className="font-display text-[13.5px] font-bold mb-3">{t("ad.customerInfo")}</h3>
            {customer && (
              <div className="space-y-2 text-[12.5px] font-semibold">
                <p className="flex items-center gap-2.5"><span className="w-8 h-8 rounded-lg bg-volt-500/12 border border-volt-500/25 text-volt-400 flex items-center justify-center text-[11px] font-extrabold">{customer.name[0]}</span>{customer.name}</p>
                <p className="text-dim">{customer.email}</p>
                <p className="text-faint text-[11.5px]">{t("c.language")}: {customer.lang.toUpperCase()} · {t("c.currency")}: {customer.currency} · {customer.verified ? t("a.verified") : t("a.unverified")}</p>
              </div>
            )}
          </div>
          <div className="sk-card p-5">
            <h3 className="font-display text-[13.5px] font-bold mb-4">{t("ad.timeline")}</h3>
            <ol className="relative">
              {o.history.map((h, i) => (
                <li key={i} className="flex gap-3 pb-4 last:pb-0 relative">
                  {i < o.history.length - 1 && <span className="absolute start-[7px] top-5 bottom-0 w-px bg-line" />}
                  <span className={`w-4 h-4 shrink-0 rounded-full border-2 mt-0.5 ${h.state === "FAILED" || h.state === "CANCELLED" || h.state === "REFUNDED" ? "border-danger-500" : h.state === "PENDING_PAYMENT" || h.state === "PENDING" ? "border-edge" : "border-volt-500 bg-volt-500/20"}`} />
                  <div><p className="text-[12.5px] font-bold">{t(`st.${h.state}`)}</p><p className="text-[10.5px] text-faint font-semibold">{formatDate(h.at, "en")} · {h.by}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* deliver modal */}
      <Modal open={deliverOpen} onClose={() => setDeliverOpen(false)} title={t("ad.deliverTitle")} wide>
        <div className="space-y-4">
          <p className="text-[12.5px] text-dim font-semibold flex items-center gap-2"><ISend size={13} className="text-volt-400" /> {o.number} · {fmt(o.totalUsd, "USD")} · {t(`ps.${o.paymentStatus}`)}</p>
          <Field label={`${t("ad.keyPayload")} (${t("c.optional")})`}><Textarea value={payload.keys} onChange={(e) => setPayload({ ...payload, keys: e.target.value })} placeholder={"SPTP-XXXXX-XXXXX-XXXXX"} dir="ltr" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={`${t("ad.codePayload")} (${t("c.optional")})`}><Input value={payload.code} onChange={(e) => setPayload({ ...payload, code: e.target.value })} dir="ltr" /></Field>
            <Field label={`${t("ad.accountPayload")} (${t("c.optional")})`}><Input value={payload.account} onChange={(e) => setPayload({ ...payload, account: e.target.value })} dir="ltr" /></Field>
          </div>
          <Field label={`${t("ad.linkPayload")} (${t("c.optional")})`}><Input value={payload.link} onChange={(e) => setPayload({ ...payload, link: e.target.value })} dir="ltr" placeholder="https://…" /></Field>
          <Field label={`${t("ad.notesPayload")} (${t("c.optional")})`}><Textarea value={payload.notes} onChange={(e) => setPayload({ ...payload, notes: e.target.value })} className="min-h-16" /></Field>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setDeliverOpen(false)}>{t("c.cancel")}</Btn>
            <Btn onClick={doDeliver}><ICheck size={15} /> {t("ad.deliverNow")}</Btn>
          </div>
        </div>
      </Modal>

      {/* refund modal */}
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title={t("ad.refund")}>
        <div className="space-y-4">
          <p className="text-[13px] text-dim leading-relaxed flex gap-2"><IAlert size={16} className="text-danger-400 shrink-0 mt-0.5" /> {t("ad.refundConfirm")}</p>
          <p className="font-display text-lg font-bold tabular-nums" dir="ltr">{fmt(o.totalUsd, "USD")}</p>
          <Field label={t("s.subject")}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Key failed activation…" /></Field>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setRefundOpen(false)}>{t("c.cancel")}</Btn>
            <Btn variant="danger" onClick={doRefund}><IUndo size={14} /> {t("ad.refund")}</Btn>
          </div>
        </div>
      </Modal>

      {/* cancel modal */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t("ad.cancelOrder")}>
        <div className="space-y-4">
          <p className="text-[13px] text-dim leading-relaxed flex gap-2"><IAlert size={16} className="text-ember-400 shrink-0 mt-0.5" /> {t("ad.cancelConfirm")}</p>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" onClick={() => setCancelOpen(false)}>{t("c.cancel")}</Btn>
            <Btn variant="danger" onClick={doCancel}><IBan size={14} /> {t("c.confirm")}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export type { Order };
