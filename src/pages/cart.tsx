import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, api, computeTotals, orderStateKey, currentCartItems } from "../state/store";
import { Btn, Empty, Field, Input, KeyField, OrderBadge, Qty, Badge, toast } from "../components/ui";
import { ICart, ITag, IBolt, IWrench, ICheck, IShield, IStripe, IPaypal, ICard, IArrowR, IAlert, IMail, IClock } from "../components/icons";
import { formatDate } from "../lib/money";

const COUPON_KEY = "sherokey.coupon";

/* ================= CART ================= */
export function CartPage() {
  const { db, t, money, ui } = useApp();
  const nav = useNavigate();
  const [code, setCode] = useState(sessionStorage.getItem(COUPON_KEY) ?? "");
  const items = currentCartItems();
  const lines = items.flatMap((c) => {
    const p = db.products.find((x) => x.id === c.productId);
    return p ? [{ ...c, p }] : [];
  });
  const totals = useMemo(() => computeTotals(items, sessionStorage.getItem(COUPON_KEY), ui.currency), [db, ui.currency]);

  const applyCoupon = () => {
    if (!code.trim()) return;
    const v = computeTotals(items, code, ui.currency);
    if (v.couponError) { toast(t(v.couponError, v.couponErrorVars), "err"); return; }
    sessionStorage.setItem(COUPON_KEY, code.trim().toUpperCase());
    toast(t("c.couponOk"), "ok");
    setCode(code.trim().toUpperCase());
  };

  if (lines.length === 0)
    return (
      <div className="max-w-3xl mx-auto px-4 py-20">
        <Empty icon={<ICart size={22} />} title={t("cart.empty")} desc={t("cart.emptyDesc")}
          action={<Btn onClick={() => nav("/catalog")}>{t("c.continue")} <IArrowR size={15} className="rtl:rotate-180" /></Btn>} />
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-4 pt-10">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-8 anim-fade-up">{t("cart.title")} <span className="text-faint text-lg">({lines.length})</span></h1>
      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        <div className="space-y-3">
          {lines.map(({ p, qty }) => (
            <div key={p.id} className="sk-card p-4 flex gap-4 items-center anim-fade-up">
              <Link to={`/product/${p.slug}`}><img src={p.image} alt="" className="w-20 h-20 rounded-xl object-cover" /></Link>
              <div className="flex-1 min-w-0">
                <Link to={`/product/${p.slug}`} className="font-display text-[13.5px] font-bold hover:text-volt-400 transition line-clamp-1">{p.name[ui.lang]}</Link>
                <p className="text-[12px] text-faint font-semibold mt-1 flex items-center gap-1.5">
                  {p.deliveryMethod === "AUTO" ? <IBolt size={11} className="text-volt-400" /> : <IWrench size={11} className="text-ember-400" />}
                  {p.deliveryMethod === "AUTO" ? t("p.instantDelivery") : t("p.manualNote")}
                </p>
                <p className="text-[12.5px] text-dim mt-1 tabular-nums" dir="ltr">{money(p.priceUsd)} × {qty}</p>
              </div>
              <Qty value={qty} onChange={(n) => api.setCartQty(p.id, n)} />
              <div className="text-end w-24 shrink-0">
                <p className="font-display text-[15px] font-bold tabular-nums" dir="ltr">{money(p.priceUsd * qty)}</p>
              </div>
              <button onClick={() => api.removeFromCart(p.id)} className="text-faint hover:text-danger-400 transition p-1.5" aria-label={t("c.remove")}>✕</button>
            </div>
          ))}
          <button onClick={() => { sessionStorage.removeItem(COUPON_KEY); setCode(""); }} className="hidden" aria-hidden />
        </div>

        <aside className="sk-card p-6 sticky top-28">
          <h2 className="font-display text-[15px] font-bold mb-5">{t("cart.summary")}</h2>
          <div className="space-y-2.5 text-[13.5px] font-semibold">
            <div className="flex justify-between text-dim"><span>{t("c.subtotal")}</span><span className="tabular-nums" dir="ltr">{money(totals.subtotalUsd)}</span></div>
            {totals.discountUsd > 0 && (
              <div className="flex justify-between text-volt-400"><span>{t("c.discount")} {totals.coupon && `(${totals.coupon.code})`}</span><span className="tabular-nums" dir="ltr">−{money(totals.discountUsd)}</span></div>
            )}
            {totals.taxUsd > 0 && (
              <div className="flex justify-between text-dim"><span>{t("co.tax")} ({db.settings.taxRatePct}%)</span><span className="tabular-nums" dir="ltr">{money(totals.taxUsd)}</span></div>
            )}
            <div className="flex justify-between items-baseline pt-3 border-t border-line">
              <span className="font-bold">{t("c.total")}</span>
              <span className="font-display text-xl font-extrabold tabular-nums" dir="ltr">{money(totals.totalUsd)}</span>
            </div>
            <p className="text-[11px] text-faint font-semibold" dir="ltr">≈ {totals.totalMinor / 100} {totals.currency} @ {totals.fxRate}</p>
          </div>

          <div className="mt-5">
            <Field label={t("c.coupon")}>
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" dir="ltr" />
                <Btn variant="soft" onClick={applyCoupon}><ITag size={14} /> {t("c.apply")}</Btn>
              </div>
            </Field>
            {totals.couponError && code && <p className="text-xs text-danger-400 mt-2">{t(totals.couponError, totals.couponErrorVars)}</p>}
          </div>

          <Btn size="lg" className="w-full mt-6" onClick={() => nav("/checkout")}>{t("c.checkout")} <IArrowR size={15} className="rtl:rotate-180" /></Btn>
          <p className="text-[11.5px] text-faint font-semibold mt-3.5 leading-relaxed flex gap-2"><IShield size={13} className="shrink-0 mt-0.5 text-volt-400" /> {t("cart.note")}</p>
        </aside>
      </div>
    </div>
  );
}

/* ================= CHECKOUT ================= */
const fmtCard = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
const fmtExp = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; };

export function CheckoutPage() {
  const { db, t, money, user, ui, fmt } = useApp();
  const nav = useNavigate();
  const [method, setMethod] = useState<"STRIPE" | "PAYPAL">("STRIPE");
  const [card, setCard] = useState({ num: "", exp: "", cvc: "", name: "" });
  const [code, setCode] = useState(sessionStorage.getItem(COUPON_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<null | "placing" | "processing">(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(currentCartItems(), code || null, user?.currency ?? ui.currency), [db, code, user, ui.currency]);

  if (!user)
    return (
      <div className="max-w-2xl mx-auto px-4 py-20">
        <Empty icon={<IShield size={22} />} title={t("co.login")} desc={t("co.secureNote")}
          action={<div className="flex gap-2"><Btn onClick={() => nav("/auth/login")}>{t("au.login")}</Btn><Btn variant="soft" onClick={() => nav("/auth/register")}>{t("au.register")}</Btn></div>} />
      </div>
    );

  if (!user.verified)
    return (
      <div className="max-w-2xl mx-auto px-4 py-20">
        <Empty icon={<IMail size={22} />} title={t("co.verify")} desc={t("co.verifyNote")}
          action={<Btn variant="soft" onClick={() => { api.resendVerification(); toast(t("au.sent"), "info"); }}>{t("au.resend")}</Btn>} />
      </div>
    );

  if (currentCartItems().length === 0 && !pendingOrderId)
    return (
      <div className="max-w-2xl mx-auto px-4 py-20">
        <Empty icon={<ICart size={22} />} title={t("cart.empty")} desc={t("cart.emptyDesc")} action={<Btn onClick={() => nav("/catalog")}>{t("c.continue")}</Btn>} />
      </div>
    );

  const pay = async () => {
    setFailed(null);
    try {
      if (method === "STRIPE" && card.num.replace(/\s/g, "").length < 16) { setFailed(`${t("co.cardNum")} — 4242 4242 4242 4242`); return; }
      setStage("placing");
      const coupon = code.trim() || sessionStorage.getItem(COUPON_KEY);
      let orderId = pendingOrderId;
      if (!orderId) {
        const order = api.placeOrder(coupon, method);
        orderId = order.id;
        setPendingOrderId(orderId);
      }
      setStage("processing");
      await api.confirmPayment(orderId, method === "STRIPE" ? card.num : undefined);
      sessionStorage.removeItem(COUPON_KEY);
      nav(`/order/${orderId}`);
    } catch (e) {
      const err = e as { code?: string };
      setStage(null);
      if (err.code === "e.declined") { setFailed(t("e.declined")); nav(`/order/${pendingOrderId}`); }
      else setFailed(t(err.code ?? "e.generic", totals.couponErrorVars));
    }
  };

  const stripeReady = db.settings.stripeEnabled;
  const paypalReady = db.settings.paypalEnabled;

  if (stage)
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center anim-fade-up">
        <div className="sk-card p-10">
          <div className="relative w-20 h-20 mx-auto mb-7">
            <span className="absolute inset-0 rounded-full border-2 border-line" />
            <span className="absolute inset-0 rounded-full border-2 border-volt-500 border-t-transparent animate-spin" />
            <ICard size={26} className="absolute inset-0 m-auto text-volt-400" />
          </div>
          <h1 className="font-display text-xl font-bold mb-2">{t("co.processing")}…</h1>
          <p className="text-sm text-dim leading-relaxed">{t("co.secureNote")}</p>
          <div className="mt-7 space-y-2.5 text-start max-w-xs mx-auto">
            {[t("h.how1"), t("h.how2"), t("h.how3")].map((s, i) => (
              <div key={s} className="flex items-center gap-2.5 text-[13px] font-semibold text-dim" style={{ animation: `skFadeUp 0.4s ${0.3 + i * 0.5}s both` }}>
                <span className="w-5 h-5 rounded-full bg-volt-500/12 border border-volt-500/30 flex items-center justify-center"><ICheck size={10} className="text-volt-400" /></span> {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-4 pt-10">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 anim-fade-up">{t("co.title")}</h1>
      <div className="flex items-center gap-2 text-[12px] font-bold text-faint mb-8">
        <span className="text-volt-400">1 {t("co.step1")}</span><span>—</span><span className="text-volt-400">2 {t("co.step2")}</span><span>—</span><span>3 {t("co.step3")}</span>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
        <div className="space-y-5">
          {/* contact */}
          <section className="sk-card p-6">
            <h2 className="font-display text-[15px] font-bold mb-4">1 · {t("co.contact")}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t("a.name")}><Input value={user.name} readOnly className="opacity-70" /></Field>
              <Field label={t("a.email")}><Input value={user.email} readOnly className="opacity-70" dir="ltr" /></Field>
            </div>
          </section>

          {/* method */}
          <section className="sk-card p-6">
            <h2 className="font-display text-[15px] font-bold mb-4">2 · {t("co.method")}</h2>
            <div className="grid sm:grid-cols-2 gap-3 mb-5">
              <button disabled={!stripeReady} onClick={() => setMethod("STRIPE")}
                className={`p-4 rounded-xl border text-start transition flex items-center gap-3 ${method === "STRIPE" ? "border-volt-500 bg-volt-500/6" : "border-line hover:border-edge"} ${!stripeReady && "opacity-40"}`}>
                <IStripe size={22} className="text-sky-400" />
                <span><span className="block text-[13.5px] font-bold">{t("co.card")}</span><span className="text-[11px] text-faint font-semibold">Visa · Mastercard · Amex</span></span>
              </button>
              <button disabled={!paypalReady} onClick={() => setMethod("PAYPAL")}
                className={`p-4 rounded-xl border text-start transition flex items-center gap-3 ${method === "PAYPAL" ? "border-volt-500 bg-volt-500/6" : "border-line hover:border-edge"} ${!paypalReady && "opacity-40"}`}>
                <IPaypal size={22} className="text-sky-400" />
                <span><span className="block text-[13.5px] font-bold">{t("co.paypal")}</span><span className="text-[11px] text-faint font-semibold">PayPal balance · cards</span></span>
              </button>
            </div>

            {method === "STRIPE" ? (
              <div className="space-y-4 anim-fade">
                <Field label={t("co.cardNum")}>
                  <Input value={card.num} onChange={(e) => setCard({ ...card, num: fmtCard(e.target.value) })} placeholder="4242 4242 4242 4242" dir="ltr" inputMode="numeric" autoComplete="cc-number" />
                </Field>
                <div className="grid grid-cols-3 gap-4">
                  <Field label={t("co.cardExp")}><Input value={card.exp} onChange={(e) => setCard({ ...card, exp: fmtExp(e.target.value) })} placeholder="12/28" dir="ltr" /></Field>
                  <Field label={t("co.cardCvc")}><Input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="123" dir="ltr" /></Field>
                  <Field label={t("co.cardName")}><Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="A. CUSTOMER" /></Field>
                </div>
                <p className="text-[11.5px] text-faint font-semibold leading-relaxed bg-canvas border border-line rounded-lg px-3.5 py-2.5" dir="ltr">{t("co.testHint")}</p>
              </div>
            ) : (
              <p className="text-[13px] text-dim leading-relaxed anim-fade flex gap-2.5 items-start"><IInfo14 /> {t("co.secureNote")}</p>
            )}
          </section>
        </div>

        {/* summary */}
        <aside className="sk-card p-6 sticky top-28">
          <h2 className="font-display text-[15px] font-bold mb-4">{t("cart.summary")}</h2>
          <div className="space-y-3 mb-5 max-h-56 overflow-y-auto pe-1">
            {totals.lines.map((l) => (
              <div key={l.product.id} className="flex items-center gap-3">
                <img src={l.product.image} alt="" className="w-11 h-11 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold truncate">{l.product.name[ui.lang]}</p>
                  <p className="text-[11px] text-faint font-semibold tabular-nums" dir="ltr">{money(l.unitUsd)} × {l.qty}</p>
                </div>
                <span className="text-[12.5px] font-bold tabular-nums" dir="ltr">{money(l.lineUsd)}</span>
              </div>
            ))}
          </div>
          <Field label={t("c.coupon")}>
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" dir="ltr" />
              <Btn variant="soft" size="sm" onClick={() => sessionStorage.setItem(COUPON_KEY, code)}>{t("c.apply")}</Btn>
            </div>
          </Field>
          {totals.couponError && <p className="text-xs text-danger-400 mt-2">{t(totals.couponError, totals.couponErrorVars)}</p>}
          <div className="space-y-2.5 text-[13.5px] font-semibold mt-5">
            <div className="flex justify-between text-dim"><span>{t("c.subtotal")}</span><span className="tabular-nums" dir="ltr">{money(totals.subtotalUsd)}</span></div>
            {totals.discountUsd > 0 && <div className="flex justify-between text-volt-400"><span>{t("c.discount")}</span><span className="tabular-nums" dir="ltr">−{money(totals.discountUsd)}</span></div>}
            {totals.taxUsd > 0 && <div className="flex justify-between text-dim"><span>{t("co.tax")}</span><span className="tabular-nums" dir="ltr">{money(totals.taxUsd)}</span></div>}
            <div className="flex justify-between items-baseline pt-3 border-t border-line">
              <span className="font-bold">{t("c.total")}</span>
              <span className="font-display text-xl font-extrabold tabular-nums" dir="ltr">{fmt(totals.totalMinor, totals.currency)}</span>
            </div>
          </div>
          {failed && <p className="mt-4 text-[12.5px] font-bold text-danger-400 flex items-center gap-2"><IAlert size={14} /> {failed}</p>}
          <Btn size="lg" className="w-full mt-5" onClick={pay} loading={busy} disabled={totals.lines.length === 0}>
            {method === "PAYPAL" ? <IPaypal size={17} /> : <ICard size={17} />} {t("co.pay", { amount: fmt(totals.totalMinor, totals.currency) })}
          </Btn>
          <p className="text-[11.5px] text-faint font-semibold mt-3.5 flex gap-2 leading-relaxed"><IShield size={13} className="shrink-0 mt-0.5 text-volt-400" /> {t("co.secureNote")}</p>
        </aside>
      </div>
    </div>
  );
}
const IInfo14 = () => <IShield size={14} className="shrink-0 mt-0.5 text-volt-400" />;

/* ================= ORDER RESULT ================= */
export function OrderResult() {
  const { id } = useParams();
  const { db, t, user, fmt } = useApp();
  const nav = useNavigate();
  const o = db.orders.find((x) => x.id === id);

  if (!o || (user && o.customerId !== user.id && user.role === "CUSTOMER"))
    return <div className="max-w-2xl mx-auto px-4 py-20"><Empty icon={<IAlert size={22} />} title={t("e.404t")} desc={t("e.404d")} action={<Btn onClick={() => nav("/")}>{t("e.home")}</Btn>} /></div>;

  const failedPay = o.paymentStatus === "FAILED";

  return (
    <div className="max-w-3xl mx-auto px-4 pt-14 pb-6">
      <div className="text-center anim-fade-up">
        {failedPay ? (
          <span className="inline-flex w-16 h-16 rounded-2xl bg-danger-500/12 border border-danger-500/30 text-danger-400 items-center justify-center mb-5"><IAlert size={28} /></span>
        ) : (
          <span className="inline-flex w-16 h-16 rounded-2xl bg-volt-500/12 border border-volt-500/30 text-volt-400 items-center justify-center mb-5 anim-pop"><ICheck size={28} /></span>
        )}
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{failedPay ? t("co.failed") : t("ok.title")}</h1>
        <p className="text-sm text-dim mt-3 max-w-md mx-auto leading-relaxed">{failedPay ? t("co.failedDesc") : t("ok.desc")}</p>
        <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
          <Badge tone="fog" className="font-mono !text-[12px]" >{o.number}</Badge>
          <OrderBadge stateKey={orderStateKey(o)} />
        </div>
      </div>

      <div className="sk-card mt-9 overflow-hidden anim-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-[14px] font-bold">{t("o.details")}</h2>
          <span className="text-[12px] text-faint font-semibold">{formatDate(o.createdAt, user?.lang ?? "en")}</span>
        </div>
        <div className="p-6 space-y-3">
          {o.items.map((it) => (
            <div key={it.productId} className="flex items-center gap-3.5">
              <img src={it.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-bold truncate">{it.name}</p>
                <p className="text-[11.5px] text-faint font-semibold tabular-nums" dir="ltr">{fmt(it.unitUsd, "USD")} × {it.qty}</p>
              </div>
              <Badge tone={it.deliveryMethod === "AUTO" ? "volt" : "ember"}>{it.deliveryMethod === "AUTO" ? <IBolt size={10} /> : <IWrench size={10} />} {it.deliveryMethod === "AUTO" ? t("p.auto") : t("p.manual")}</Badge>
            </div>
          ))}
          <div className="pt-4 border-t border-line space-y-2 text-[13.5px] font-semibold">
            {o.discountUsd > 0 && <div className="flex justify-between text-volt-400"><span>{t("c.discount")} ({o.couponCode})</span><span dir="ltr" className="tabular-nums">−{fmt(o.discountUsd, "USD")}</span></div>}
            <div className="flex justify-between items-baseline"><span>{t("c.total")}</span><span className="font-display text-lg font-extrabold tabular-nums" dir="ltr">{fmt(o.totalMinor, o.currency)}</span></div>
          </div>
        </div>

        {/* delivery */}
        {!failedPay && o.paymentStatus === "PAID" && (
          <div className="px-6 pb-6">
            <div className="rounded-xl border border-volt-500/25 bg-volt-500/5 p-5">
              <h3 className="font-display text-[13px] font-bold flex items-center gap-2 mb-3.5">
                {o.fulfillmentStatus === "PROCESSING" ? <IClock size={14} className="text-ember-400" /> : <IKeyMini />} {t("o.deliveryInfo")}
              </h3>
              {o.delivery ? (
                <div className="space-y-2">
                  {o.delivery.keys.map((k) => <KeyField key={k} value={k} />)}
                  {o.delivery.account && <KeyValue label={t("ad.accountPayload")} value={o.delivery.account} />}
                  {o.delivery.activationCode && <KeyValue label={t("ad.codePayload")} value={o.delivery.activationCode} />}
                  {o.delivery.downloadLink && <KeyValue label={t("ad.linkPayload")} value={o.delivery.downloadLink} />}
                  {o.delivery.notes && <p className="text-[12.5px] text-dim leading-relaxed">{o.delivery.notes}</p>}
                </div>
              ) : (
                <p className="text-[13px] text-dim leading-relaxed">{t("p.manualDesc")}</p>
              )}
            </div>
            <p className="flex items-center gap-2 text-[12px] text-faint font-semibold mt-4"><IMail size={13} /> {t("ok.email")} · {o.email}</p>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-3 mt-8">
        {!failedPay && <Btn onClick={() => nav(`/account/orders/${o.id}`)}>{t("ok.view")}</Btn>}
        {failedPay ? <Btn onClick={() => nav("/catalog")}>{t("c.continue")}</Btn> : <Btn variant="soft" onClick={() => nav("/")}>{t("ok.home")}</Btn>}
      </div>
    </div>
  );
}
const IKeyMini = () => <ICheck size={14} className="text-volt-400" />;

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-canvas border border-line rounded-[10px] px-3 py-2">
      <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-faint">{label}</span>
      <span className="font-mono text-[12.5px] break-all" dir="ltr">{value}</span>
    </div>
  );
}
