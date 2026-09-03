import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, api, orderStateKey, store } from "../state/store";
import { LANGS, langDir } from "../lib/i18n";
import { CURRENCIES, formatDate } from "../lib/money";
import { Badge, Btn, Empty, Field, Input, KeyField, KeyBadge, OrderBadge, Stars, toast } from "../components/ui";
import { IGrid, IKey, IHeart, IBell, IUser, ILock, IGear, ICart, IMail, ICheck, IAlert, IClock, IBolt, IWrench, IArrowR, IBox, ILifebuoy, ISun, IMoon } from "../components/icons";
import type { Order } from "../lib/types";

function OrderTimeline({ o }: { o: Order }) {
  const { t } = useApp();
  return (
    <ol className="relative">
      {o.history.map((h, i) => (
        <li key={i} className="flex gap-3.5 pb-5 last:pb-0 relative">
          {i < o.history.length - 1 && <span className="absolute start-[9px] top-6 bottom-0 w-px bg-line" />}
          <span className={`w-[19px] h-[19px] shrink-0 rounded-full border-2 flex items-center justify-center mt-0.5 ${
            h.state === "FAILED" || h.state === "CANCELLED" || h.state === "REFUNDED" ? "border-danger-500 bg-danger-500/15 text-danger-400"
            : h.state === "PENDING_PAYMENT" || h.state === "PENDING" ? "border-edge text-faint" : "border-volt-500 bg-volt-500/15 text-volt-400"}`}>
            <ICheck size={9} />
          </span>
          <div>
            <p className="text-[13px] font-bold">{t(`st.${h.state}`)}</p>
            <p className="text-[11.5px] text-faint font-semibold">{formatDate(h.at, "en")} · {h.by}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function OrderDetail({ id }: { id: string }) {
  const { db, t, user, fmt } = useApp();
  const nav = useNavigate();
  const o = db.orders.find((x) => x.id === id);
  if (!o || !user || (o.customerId !== user.id && user.role === "CUSTOMER"))
    return <Empty icon={<IAlert size={22} />} title={t("e.404t")} action={<Btn variant="soft" onClick={() => nav("/account/orders")}>{t("c.back")}</Btn>} />;
  return (
    <div className="anim-fade">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <button onClick={() => nav("/account/orders")} className="text-[12.5px] font-bold text-volt-400 hover:underline mb-2 flex items-center gap-1">← {t("a.orders")}</button>
          <h2 className="font-display text-xl font-extrabold">{o.number}</h2>
          <p className="text-[12.5px] text-faint font-semibold mt-1">{formatDate(o.createdAt, user.lang)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <OrderBadge stateKey={orderStateKey(o)} />
          <Badge tone="dim">{t("o.payStatus")}: {t(`ps.${o.paymentStatus}`)}</Badge>
          <Badge tone="dim">{t("o.fulfill")}: {t(`fs.${o.fulfillmentStatus}`)}</Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_280px] gap-6 items-start">
        <div className="space-y-5">
          <div className="sk-card p-5">
            <h3 className="font-display text-[13.5px] font-bold mb-4">{t("o.details")}</h3>
            <div className="space-y-3">
              {o.items.map((it) => (
                <div key={it.productId} className="flex items-center gap-3.5">
                  <img src={it.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-bold truncate">{it.name}</p>
                    <p className="text-[11.5px] text-faint font-semibold tabular-nums" dir="ltr">{fmt(it.unitUsd, "USD")} × {it.qty}</p>
                  </div>
                  <span className="text-[13px] font-bold tabular-nums" dir="ltr">{fmt(it.lineTotalUsd, "USD")}</span>
                </div>
              ))}
            </div>
            <div className="pt-4 mt-4 border-t border-line space-y-2 text-[13.5px] font-semibold">
              {o.discountUsd > 0 && <div className="flex justify-between text-volt-400"><span>{t("c.discount")} ({o.couponCode})</span><span dir="ltr" className="tabular-nums">−{fmt(o.discountUsd, "USD")}</span></div>}
              {o.taxUsd > 0 && <div className="flex justify-between text-dim"><span>{t("co.tax")}</span><span dir="ltr" className="tabular-nums">{fmt(o.taxUsd, "USD")}</span></div>}
              <div className="flex justify-between items-baseline"><span>{t("c.total")}</span><span className="font-display text-lg font-extrabold tabular-nums" dir="ltr">{fmt(o.totalMinor, o.currency)}</span></div>
              <p className="text-[11px] text-faint font-semibold">{t("c.method")}: {o.paymentMethod} {o.paymentId && <code dir="ltr">· {o.paymentId}</code>}</p>
            </div>
          </div>

          {(o.delivery || o.fulfillmentStatus === "PROCESSING") && o.paymentStatus !== "FAILED" && (
            <div className="sk-card p-5 !border-volt-500/25">
              <h3 className="font-display text-[13.5px] font-bold mb-4 flex items-center gap-2">
                <IKey size={14} className="text-volt-400" /> {o.delivery ? t("o.keys") : t("o.deliveryInfo")}
              </h3>
              {o.delivery ? (
                <div className="space-y-2">
                  {o.delivery.keys.map((k) => <KeyField key={k} value={k} />)}
                  {o.delivery.account && <p className="text-[12.5px] text-dim"><strong className="text-fog">{t("ad.accountPayload")}:</strong> <code dir="ltr">{o.delivery.account}</code></p>}
                  {o.delivery.activationCode && <p className="text-[12.5px] text-dim"><strong className="text-fog">{t("ad.codePayload")}:</strong> <code dir="ltr">{o.delivery.activationCode}</code></p>}
                  {o.delivery.downloadLink && <p className="text-[12.5px] text-dim"><strong className="text-fog">{t("ad.linkPayload")}:</strong> <code dir="ltr">{o.delivery.downloadLink}</code></p>}
                  {o.delivery.notes && <p className="text-[12.5px] text-dim leading-relaxed pt-1 border-t border-line mt-2">{o.delivery.notes}</p>}
                </div>
              ) : (
                <p className="text-[13px] text-dim leading-relaxed flex items-start gap-2"><IClock size={15} className="text-ember-400 shrink-0 mt-0.5" /> {t("p.manualDesc")}</p>
              )}
            </div>
          )}
          <Link to="/support" className="sk-card p-4 flex items-center gap-3 hover:border-edge transition group">
            <span className="w-9 h-9 rounded-lg bg-raise border border-line text-dim group-hover:text-volt-400 flex items-center justify-center"><ILifebuoy size={16} /></span>
            <span className="text-[13px] font-bold flex-1">{t("o.help")}</span>
            <IArrowR size={14} className="text-faint rtl:rotate-180" />
          </Link>
        </div>

        <aside className="sk-card p-5">
          <h3 className="font-display text-[13.5px] font-bold mb-4">{t("ad.timeline")}</h3>
          <OrderTimeline o={o} />
        </aside>
      </div>
    </div>
  );
}

export default function Account() {
  const { tab = "orders", id } = useParams();
  const { db, t, user, ui, money } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [cur, setCur] = useState(""); const [next, setNext] = useState("");

  if (!user) return <div className="max-w-2xl mx-auto px-4 py-20"><Empty icon={<ILock size={22} />} title={t("e.unauthorized")} action={<Btn onClick={() => nav("/auth/login")}>{t("au.login")}</Btn>} /></div>;

  const myOrders = db.orders.filter((o) => o.customerId === user.id);
  const myKeys = db.licenseKeys.filter((k) => k.customerId === user.id && k.status !== "UNUSED" && k.status !== "RESERVED");
  const myWish = db.wishlist.filter((w) => w.userId === user.id).flatMap((w) => db.products.filter((p) => p.id === w.productId));
  const myNotifs = db.notifications.filter((n) => n.userId === user.id);
  const unread = myNotifs.filter((n) => !n.read).length;

  const items: [string, string, React.ReactNode, string?][] = [
    ["orders", t("a.orders"), <IGrid size={15} key="1" />],
    ["keys", t("a.keys"), <IKey size={15} key="2" />, String(myKeys.length)],
    ["wishlist", t("a.wishlist"), <IHeart size={15} key="3" />, String(myWish.length)],
    ["notifications", t("a.notifs"), <IBell size={15} key="4" />, unread ? String(unread) : undefined],
    ["profile", t("a.profile"), <IUser size={15} key="5" />],
    ["security", t("a.security"), <ILock size={15} key="6" />],
    ["settings", t("a.prefs"), <IGear size={15} key="7" />],
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 pt-10">
      <div className="flex items-center gap-4 mb-8 anim-fade-up flex-wrap">
        <span className="w-14 h-14 rounded-2xl bg-volt-500/12 border border-volt-500/30 text-volt-400 font-display text-xl font-extrabold flex items-center justify-center">{user.name[0]?.toUpperCase()}</span>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight">{user.name}</h1>
          <p className="text-[12.5px] text-faint font-semibold">{t("a.member")} {formatDate(user.createdAt, user.lang, false)} · <Badge tone={user.verified ? "volt" : "ember"} className="ms-1">{user.verified ? t("a.verified") : t("a.unverified")}</Badge></p>
        </div>
      </div>

      {!user.verified && (
        <div className="sk-card !border-ember-500/30 bg-ember-500/6 p-4 mb-8 flex items-center gap-3 flex-wrap anim-fade-up">
          <IMail size={17} className="text-ember-400" />
          <p className="text-[13px] font-semibold text-ember-400 flex-1 min-w-50">{t("au.verifyDesc", { email: user.email })}</p>
          <Btn size="sm" variant="soft" onClick={() => { api.resendVerification(); toast(t("au.sent"), "info"); }}>{t("au.resend")}</Btn>
        </div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-8 items-start">
        <nav className="sk-card p-2 lg:sticky lg:top-28 flex lg:flex-col gap-1 overflow-x-auto">
          {items.map(([key, label, icon, badge]) => (
            <button key={key} onClick={() => nav(`/account/${key}`)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-[13px] font-bold whitespace-nowrap transition ${tab === key || (key === "orders" && tab === "orders") ? "bg-volt-500/10 text-volt-400" : "text-dim hover:text-fog hover:bg-raise"}`}>
              {icon} <span className="flex-1 text-start">{label}</span>
              {badge && badge !== "0" && <span className="text-[10px] bg-raise border border-line rounded-full px-1.5 py-0.5 tabular-nums">{badge}</span>}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {tab === "orders" && !id && (
            <div className="space-y-3 anim-fade">
              {myOrders.length === 0 && <Empty icon={<IBox size={22} />} title={t("a.noOrders")} desc={t("cart.emptyDesc")} action={<Btn onClick={() => nav("/catalog")}>{t("c.continue")}</Btn>} />}
              {myOrders.map((o) => (
                <button key={o.id} onClick={() => nav(`/account/orders/${o.id}`)} className="w-full sk-card p-4.5 flex items-center gap-4 hover:border-edge transition text-start group">
                  <img src={o.items[0]?.image} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[13.5px] font-bold group-hover:text-volt-400 transition">{o.number}</p>
                    <p className="text-[12px] text-faint font-semibold mt-0.5 truncate">{o.items.map((i) => i.name).join(", ")}</p>
                    <p className="text-[11.5px] text-faint mt-0.5">{formatDate(o.createdAt, user.lang)}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-display text-[14.5px] font-bold tabular-nums" dir="ltr">{ui.currency === o.currency ? (o.totalMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }) : (o.totalUsd / 100).toFixed(2) + " $"} {ui.currency !== o.currency && "USD"}</p>
                    <div className="mt-1.5 flex justify-end"><OrderBadge stateKey={orderStateKey(o)} /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {tab === "orders" && id && <OrderDetail id={id} />}

          {tab === "keys" && (
            <div className="space-y-3 anim-fade">
              {myKeys.length === 0 && <Empty icon={<IKey size={22} />} title={t("a.noKeys")} desc={t("cart.emptyDesc")} action={<Btn onClick={() => nav("/catalog")}>{t("c.continue")}</Btn>} />}
              {myKeys.map((k) => {
                const p = db.products.find((x) => x.id === k.productId);
                const o = db.orders.find((x) => x.id === k.orderId);
                return (
                  <div key={k.id} className="sk-card p-4.5 flex items-center gap-4 flex-wrap">
                    <img src={p?.image} alt="" className="w-12 h-12 rounded-xl object-cover" />
                    <div className="flex-1 min-w-40">
                      <Link to={`/product/${p?.slug}`} className="font-display text-[13px] font-bold hover:text-volt-400 transition">{p?.name[user.lang]}</Link>
                      <p className="text-[11.5px] text-faint font-semibold mt-0.5">{o?.number} · {t("a.issued")} {k.deliveredAt ? formatDate(k.deliveredAt, user.lang) : "—"}</p>
                    </div>
                    <div className="w-full sm:w-72"><KeyField value={k.key} /></div>
                    <KeyBadge status={k.status} />
                  </div>
                );
              })}
            </div>
          )}

          {tab === "wishlist" && (
            <div className="anim-fade">
              {myWish.length === 0 ? <Empty icon={<IHeart size={22} />} title={t("a.noWish")} action={<Btn onClick={() => nav("/catalog")}>{t("c.continue")}</Btn>} /> : (
                <div className="space-y-3">
                  {myWish.map((p) => (
                    <div key={p.id} className="sk-card p-4 flex items-center gap-4 flex-wrap">
                      <Link to={`/product/${p.slug}`}><img src={p.image} alt="" className="w-14 h-14 rounded-xl object-cover" /></Link>
                      <div className="flex-1 min-w-40">
                        <Link to={`/product/${p.slug}`} className="font-display text-[13.5px] font-bold hover:text-volt-400 transition">{p.name[user.lang]}</Link>
                        <p className="text-[12px] text-faint font-semibold mt-0.5" dir="ltr">{money(p.priceUsd)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Btn size="sm" onClick={() => { try { api.addToCart(p.id, 1); toast(t("c.added")); } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); } }}><ICart size={13} /> {t("p.moveToCart")}</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => api.toggleWishlist(p.id)}>{t("c.remove")}</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "notifications" && (
            <div className="anim-fade">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold">{t("a.notifs")}</h2>
                {unread > 0 && <Btn size="sm" variant="soft" onClick={() => api.markAllRead()}>{t("a.markRead")}</Btn>}
              </div>
              {myNotifs.length === 0 ? <Empty icon={<IBell size={22} />} title={t("a.noNotifs")} /> : (
                <div className="space-y-2">
                  {myNotifs.map((n) => (
                    <button key={n.id} onClick={() => { api.markRead(n.id); if (n.link) nav(n.link); }}
                      className={`w-full sk-card p-4 flex items-center gap-3.5 text-start hover:border-edge transition ${n.read ? "opacity-55" : ""}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-edge" : "bg-volt-500"}`} />
                      <span className="flex-1 text-[13.5px] font-semibold">{t(n.type, n.vars)}</span>
                      <span className="text-[11.5px] text-faint font-semibold shrink-0">{formatDate(n.createdAt, user.lang)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "profile" && (
            <div className="sk-card p-6 max-w-lg anim-fade">
              <h2 className="font-display text-lg font-bold mb-5">{t("a.profile")}</h2>
              <div className="space-y-4">
                <Field label={t("a.name")}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label={t("a.email")}><Input value={user.email} readOnly className="opacity-60" dir="ltr" /></Field>
                <Btn onClick={() => { api.updateProfile({ name }); toast(t("a.profileOk")); }}>{t("a.saveProfile")}</Btn>
              </div>
            </div>
          )}

          {tab === "security" && (
            <div className="sk-card p-6 max-w-lg anim-fade">
              <h2 className="font-display text-lg font-bold mb-1.5">{t("a.security")}</h2>
              <p className="text-[12.5px] text-dim mb-5">Argon2id · HttpOnly sessions · SameSite=Lax</p>
              <div className="space-y-4">
                <Field label={t("a.curPass")}><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} dir="ltr" /></Field>
                <Field label={t("a.newPass")} hint={t("au.short")}><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} dir="ltr" /></Field>
                <Btn onClick={async () => { try { await api.changePassword(cur, next); toast(t("a.passOk")); setCur(""); setNext(""); } catch (e) { toast(t((e as { code?: string }).code ?? "e.generic"), "err"); } }}>{t("a.changePass")}</Btn>
              </div>
            </div>
          )}

          {tab === "settings" && (
            <div className="sk-card p-6 max-w-lg anim-fade space-y-6">
              <h2 className="font-display text-lg font-bold">{t("a.prefs")}</h2>
              <div>
                <p className="text-[12.5px] font-bold text-dim mb-2.5">{t("c.language")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {LANGS.filter((l) => db.settings.langs.includes(l.code)).map((l) => (
                    <button key={l.code} onClick={() => { store.setLang(l.code); }} className={`px-4 py-3 rounded-xl border text-[13px] font-bold transition ${ui.lang === l.code ? "border-volt-500 bg-volt-500/8 text-volt-400" : "border-line text-dim hover:border-edge"}`}>
                      {l.label} <span className="block text-[10px] font-semibold text-faint mt-0.5 uppercase">{langDir(l.code)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-dim mb-2.5">{t("c.currency")}</p>
                <div className="grid grid-cols-4 gap-2">
                  {db.settings.currencies.map((c) => (
                    <button key={c} onClick={() => { store.setCurrency(c); }} className={`px-2 py-3 rounded-xl border text-[13px] font-bold font-mono transition ${ui.currency === c ? "border-volt-500 bg-volt-500/8 text-volt-400" : "border-line text-dim hover:border-edge"}`}>{c}</button>
                  ))}
                </div>
                <p className="text-[11px] text-faint font-semibold mt-2">{CURRENCIES[ui.currency].label}</p>
              </div>
              <div>
                <p className="text-[12.5px] font-bold text-dim mb-2.5">{t("c.theme")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { store.setTheme("dark"); }} className={`px-4 py-3 rounded-xl border text-[13px] font-bold transition flex items-center justify-center gap-2 ${ui.theme === "dark" ? "border-volt-500 bg-volt-500/8 text-volt-400" : "border-line text-dim hover:border-edge"}`}><IMoon size={14} /> {t("c.dark")}</button>
                  <button onClick={() => { store.setTheme("light"); }} className={`px-4 py-3 rounded-xl border text-[13px] font-bold transition flex items-center justify-center gap-2 ${ui.theme === "light" ? "border-volt-500 bg-volt-500/8 text-volt-400" : "border-line text-dim hover:border-edge"}`}><ISun size={14} /> {t("c.light")}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* local price renderer for wishlist lines */
function useMoney(usdMinor: number): string {
  const { money } = useApp();
  return money(usdMinor);
}
