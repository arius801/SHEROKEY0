import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp, api } from "../state/store";
import { formatDate } from "../lib/money";
import { Badge, Btn, Empty, Field, Input, Select, Textarea, toast } from "../components/ui";
import { ILifebuoy, ISend, IChevronD, IMail, IClock, ICheck, IUser, IKey } from "../components/icons";

function StatusBadge({ s }: { s: string }) {
  const { t } = useApp();
  const map: Record<string, ["volt" | "ember" | "dim", string]> = {
    OPEN: ["volt", t("s.open")], PENDING: ["ember", t("s.pending")], CLOSED: ["dim", t("s.closed")],
  };
  const [tone, label] = map[s] ?? ["dim", s];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Support() {
  const { db, t, user } = useApp();
  const nav = useNavigate();
  const [subject, setSubject] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const myTickets = user ? db.tickets.filter((tk) => tk.customerId === user.id) : [];
  const myOrders = user ? db.orders.filter((o) => o.customerId === user.id) : [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const id = api.createTicket(subject, orderId || null, message);
      toast(t("s.created"), "ok");
      setSubject(""); setMessage(""); setOrderId("");
      nav(`/support/${id}`);
    } catch (ex) { toast(t((ex as { code?: string }).code ?? "e.generic"), "err"); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pt-10">
      <header className="mb-10 anim-fade-up">
        <span className="sk-chip !text-volt-400 !border-volt-500/30 !bg-volt-500/8 mb-4"><ILifebuoy size={12} /> 24/7</span>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{t("s.title")}</h1>
        <p className="text-sm text-dim mt-2 max-w-xl">{t("s.desc")}</p>
      </header>

      {!user ? (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="sk-card p-8">
            <IMail size={22} className="text-volt-400 mb-4" />
            <h2 className="font-display text-lg font-bold mb-2">{t("s.contactTitle")}</h2>
            <p className="text-[13.5px] text-dim leading-relaxed">{t("s.contactDesc", { email: db.settings.supportEmail })}</p>
            <a href={`mailto:${db.settings.supportEmail}`} className="inline-flex mt-5 font-mono text-[13px] text-volt-400 hover:underline" dir="ltr">{db.settings.supportEmail}</a>
            <div className="mt-6"><Btn onClick={() => nav("/auth/login")}>{t("au.login")}</Btn></div>
          </div>
          <div className="sk-card p-8">
            <IClock size={22} className="text-ember-400 mb-4" />
            <h2 className="font-display text-lg font-bold mb-2">{t("s.faqTitle")}</h2>
            <p className="text-[13.5px] text-dim leading-relaxed">{t("faq.a1")}</p>
            <div className="mt-6"><Btn variant="soft" onClick={() => nav("/faq")}>{t("nav.faq")}</Btn></div>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
          <div>
            <h2 className="font-display text-lg font-bold mb-4">{t("s.mine")}</h2>
            <div className="space-y-2.5">
              {myTickets.length === 0 && <Empty icon={<ILifebuoy size={22} />} title={t("c.noResults")} desc={t("s.desc")} />}
              {myTickets.map((tk) => (
                <button key={tk.id} onClick={() => nav(`/support/${tk.id}`)} className="w-full sk-card p-4.5 flex items-center gap-4 hover:border-edge transition text-start">
                  <span className="w-10 h-10 rounded-xl bg-raise border border-line text-volt-400 flex items-center justify-center shrink-0"><ILifebuoy size={17} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-bold truncate">{tk.subject}</p>
                    <p className="text-[11.5px] text-faint font-semibold mt-0.5">
                      {formatDate(tk.updatedAt, user.lang)}
                      {tk.orderId && <> · {db.orders.find((o) => o.id === tk.orderId)?.number}</>}
                    </p>
                  </div>
                  <StatusBadge s={tk.status} />
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={submit} className="sk-card p-6 space-y-4 lg:sticky lg:top-28">
            <h2 className="font-display text-[15px] font-bold">{t("s.new")}</h2>
            <Field label={t("s.subject")}><Input value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={4} /></Field>
            <Field label={`${t("s.order")} (${t("c.optional")})`}>
              <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">—</option>
                {myOrders.map((o) => <option key={o.id} value={o.id}>{o.number}</option>)}
              </Select>
            </Field>
            <Field label={t("s.message")}><Textarea value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} /></Field>
            <Btn type="submit" className="w-full" loading={busy}><ISend size={15} /> {t("c.submit")}</Btn>
          </form>
        </div>
      )}
    </div>
  );
}

export function TicketThread() {
  const { id } = useParams();
  const { db, t, user } = useApp();
  const nav = useNavigate();
  const [reply, setReply] = useState("");
  const tk = db.tickets.find((x) => x.id === id);
  if (!tk || !user || (tk.customerId !== user.id && user.role === "CUSTOMER"))
    return <div className="max-w-2xl mx-auto px-4 py-20"><Empty icon={<ILifebuoy size={22} />} title={t("e.404t")} action={<Btn variant="soft" onClick={() => nav("/support")}>{t("c.back")}</Btn>} /></div>;
  const msgs = db.ticketMessages.filter((m) => m.ticketId === tk.id);
  const order = tk.orderId ? db.orders.find((o) => o.id === tk.orderId) : null;
  const isStaffUser = user.role !== "CUSTOMER";

  return (
    <div className="max-w-3xl mx-auto px-4 pt-10">
      <button onClick={() => nav("/support")} className="text-[12.5px] font-bold text-volt-400 hover:underline mb-4">← {t("s.mine")}</button>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-xl font-extrabold">{tk.subject}</h1>
          <p className="text-[12px] text-faint font-semibold mt-1">{t("s.ticket")} #{tk.id.slice(-6).toUpperCase()} · {formatDate(tk.createdAt, user.lang)}</p>
        </div>
        <div className="flex gap-2 items-center">
          {order && <Badge tone="dim" className="font-mono">{order.number}</Badge>}
          <StatusBadge s={tk.status} />
        </div>
      </div>

      <div className="space-y-3.5 mb-8">
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.staff ? "flex-row-reverse" : ""}`}>
            <span className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-[12px] font-extrabold ${m.staff ? "bg-volt-500/12 border border-volt-500/30 text-volt-400" : "bg-raise border border-line text-dim"}`}>
              {m.staff ? <IKey size={15} /> : m.authorName[0]}
            </span>
            <div className={`sk-card p-4 max-w-[85%] ${m.staff ? "!border-volt-500/25" : ""}`}>
              <p className="text-[11.5px] font-extrabold mb-1.5 flex items-center gap-2">
                {m.staff ? t("s.staff") : m.authorName}
                {m.staff && <Badge tone="volt" className="!text-[9.5px]">STAFF</Badge>}
                <span className="text-faint font-semibold">{formatDate(m.createdAt, user.lang)}</span>
              </p>
              <p className="text-[13.5px] text-dim leading-relaxed whitespace-pre-wrap">{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      {tk.status !== "CLOSED" ? (
        <form onSubmit={(e) => { e.preventDefault(); try { api.replyTicket(tk.id, reply); setReply(""); } catch (ex) { toast(t((ex as { code?: string }).code ?? "e.generic"), "err"); } }} className="sk-card p-4 flex gap-2.5 items-end">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("s.reply")} className="min-h-12" required minLength={2} />
          <div className="flex flex-col gap-2">
            <Btn type="submit"><ISend size={14} /> {t("s.send")}</Btn>
            <Btn type="button" variant="ghost" size="sm" onClick={() => api.closeTicket(tk.id)}>{t("s.closeTicket")}</Btn>
          </div>
        </form>
      ) : (
        <div className="sk-card p-5 text-center">
          <p className="text-[13.5px] font-bold text-dim flex items-center justify-center gap-2"><ICheck size={16} className="text-volt-500" /> {t("s.closed")}</p>
        </div>
      )}
      {isStaffUser && tk.status !== "CLOSED" && (
        <div className="flex gap-2 mt-4">
          <Btn size="sm" variant="soft" onClick={() => { api.assignTicket(tk.id); toast(t("c.saved"), "info"); }}>{t("ad.tickets")}: assign me</Btn>
          <Btn size="sm" variant="soft" onClick={() => api.setTicketStatus(tk.id, "CLOSED")}>{t("s.closeTicket")}</Btn>
        </div>
      )}
    </div>
  );
}

export function Faq() {
  const { t, db } = useApp();
  const [open, setOpen] = useState(0);
  const qs = [1, 2, 3, 4, 5, 6];
  return (
    <div className="max-w-3xl mx-auto px-4 pt-10">
      <header className="mb-9 anim-fade-up text-center">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{t("s.faqTitle")}</h1>
        <p className="text-sm text-dim mt-2">{t("s.contactDesc", { email: db.settings.supportEmail })}</p>
      </header>
      <div className="space-y-3">
        {qs.map((n, i) => (
          <div key={n} className={`sk-card overflow-hidden transition ${open === i ? "!border-volt-500/30" : ""}`}>
            <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-start" aria-expanded={open === i}>
              <span className="font-display text-[14px] font-bold">{t(`faq.q${n}`)}</span>
              <IChevronD size={16} className={`text-faint transition-transform duration-200 ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && <p className="px-5 pb-5 text-[13.5px] text-dim leading-relaxed anim-fade">{t(`faq.a${n}`)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
