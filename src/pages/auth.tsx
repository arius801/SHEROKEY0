import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp, api } from "../state/store";
import { Btn, Field, Input, Badge, toast } from "../components/ui";
import { IKey, IMail, IShield, IBolt, ICheck, IAlert, IEye, IEyeOff } from "../components/icons";

function AuthShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const { t, db } = useApp();
  return (
    <div className="max-w-5xl mx-auto px-4 py-14 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-stretch">
      <aside className="hidden lg:flex flex-col justify-between sk-card p-8 relative overflow-hidden">
        <div className="absolute inset-0 sk-grid-overlay opacity-60" />
        <div className="relative">
          <span className="w-12 h-12 rounded-2xl bg-volt-500/12 border border-volt-500/30 text-volt-400 flex items-center justify-center mb-6"><IKey size={22} /></span>
          <h2 className="font-display text-2xl font-extrabold leading-tight">{t("h.title1")}<br /><span className="text-volt-400">{t("h.title2")}</span></h2>
          <p className="text-sm text-dim leading-relaxed mt-4">{t("f.tagline")}</p>
        </div>
        <div className="relative space-y-3">
          {[
            { icon: <IBolt size={14} />, txt: t("h.how3") },
            { icon: <IShield size={14} />, txt: "Argon2id · HttpOnly · SameSite" },
            { icon: <IMail size={14} />, txt: t("faq.a5") },
          ].map((x, i) => (
            <p key={i} className="flex items-center gap-2.5 text-[12.5px] font-bold text-dim"><span className="w-7 h-7 rounded-lg bg-raise border border-line text-volt-400 flex items-center justify-center">{x.icon}</span>{x.txt}</p>
          ))}
        </div>
      </aside>
      <div className="sk-card p-7 sm:p-9 anim-fade-up">
        <h1 className="font-display text-xl font-extrabold">{title}</h1>
        <p className="text-[13px] text-dim mt-1.5 mb-7">{sub}</p>
        {children}
      </div>
    </div>
  );
}

function PassInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir="ltr" className="pe-10" />
      <button type="button" onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 text-faint hover:text-fog" aria-label="toggle">
        {show ? <IEyeOff size={15} /> : <IEye size={15} />}
      </button>
    </div>
  );
}

export function Login() {
  const { t } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await api.login(email, pass); toast(t("au.welcome"), "ok"); nav("/"); }
    catch (ex) { setErr(t((ex as { code?: string }).code ?? "e.generic")); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title={t("au.welcome")} sub={t("nav.home") + " → SHEROKEY"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("au.email")}><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="demo@sherokey.com" dir="ltr" autoComplete="email" /></Field>
        <Field label={t("au.pass")}><PassInput value={pass} onChange={setPass} /></Field>
        {err && <p className="text-[12.5px] font-bold text-danger-400 flex items-center gap-2"><IAlert size={14} /> {err}</p>}
        <Btn type="submit" size="lg" className="w-full" loading={busy}>{t("au.login")}</Btn>
      </form>
      <div className="flex items-center justify-between mt-4 text-[12.5px] font-bold">
        <Link to="/auth/forgot" className="text-dim hover:text-volt-400 transition">{t("au.forgot")}</Link>
        <Link to="/auth/register" className="text-volt-400 hover:underline">{t("au.register")}</Link>
      </div>
      <div className="mt-7 rounded-xl border border-line bg-canvas p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-faint mb-2.5">{t("au.demo")}</p>
        <div className="grid sm:grid-cols-2 gap-1.5 text-[11.5px] font-mono text-dim" dir="ltr">
          <span>owner@sherokey.com / Owner@2024</span>
          <span>admin@sherokey.com / Admin@2024</span>
          <span>support@sherokey.com / Support@2024</span>
          <span>demo@sherokey.com / Demo@2024</span>
        </div>
      </div>
    </AuthShell>
  );
}

export function Register() {
  const { t } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (pass !== pass2) { setErr(t("au.mismatch")); return; }
    setBusy(true);
    try { await api.register(name, email, pass); nav("/auth/verify-sent"); }
    catch (ex) { setErr(t((ex as { code?: string }).code ?? "e.generic")); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title={t("au.join")} sub={t("f.tagline")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("au.name")}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label={t("au.email")}><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" autoComplete="email" /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("au.pass")}><PassInput value={pass} onChange={setPass} /></Field>
          <Field label={t("au.pass2")}><PassInput value={pass2} onChange={setPass2} /></Field>
        </div>
        {err && <p className="text-[12.5px] font-bold text-danger-400 flex items-center gap-2"><IAlert size={14} /> {err}</p>}
        <Btn type="submit" size="lg" className="w-full" loading={busy}>{t("au.register")}</Btn>
      </form>
      <p className="mt-4 text-[12.5px] font-bold text-dim">{t("au.have")} <Link to="/auth/login" className="text-volt-400 hover:underline">{t("au.login")}</Link></p>
    </AuthShell>
  );
}

/** After registration — shows the real verification link (dev shortcut for the emailed token). */
export function VerifySent() {
  const { t, user } = useApp();
  const nav = useNavigate();
  if (!user) return <AuthShell title={t("au.verifyTitle")} sub="">{null}</AuthShell>;
  const link = user.verifyToken ? `#/verify?t=${user.verifyToken}` : null;
  return (
    <AuthShell title={t("au.verifyTitle")} sub={t("au.verifyDesc", { email: user.email })}>
      <div className="sk-card !bg-canvas p-5 text-center space-y-4">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-sky-500/12 border border-sky-500/30 text-sky-400 items-center justify-center"><IMail size={24} /></span>
        <p className="text-[13px] text-dim leading-relaxed">{t("au.sent")} — <strong className="text-fog">{t("hdr.mailbox")}</strong></p>
        {link ? (
          <a href={link} className="inline-flex items-center gap-2 bg-volt-500 text-[#062b1b] font-bold text-sm rounded-[10px] px-5 h-11 hover:bg-volt-400 transition">
            <ICheck size={15} /> {t("au.verifyTitle")}
          </a>
        ) : (
          <p className="text-[13px] font-bold text-volt-400 flex items-center justify-center gap-2"><ICheck size={15} /> {t("a.verified")}</p>
        )}
        <p className="text-[11px] text-faint font-semibold">dev: token expires in 24h · one-time use</p>
      </div>
      <div className="flex gap-2 mt-5">
        <Btn variant="soft" className="flex-1" onClick={() => { api.resendVerification(); toast(t("au.sent"), "info"); }}>{t("au.resend")}</Btn>
        <Btn variant="ghost" onClick={() => nav("/")}>{t("c.back")}</Btn>
      </div>
    </AuthShell>
  );
}

export function Verify() {
  const { t } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [state, setState] = useState<"ok" | "err" | null>(null);
  useEffect(() => {
    const token = params.get("t") ?? "";
    try { api.verifyEmail(token); setState("ok"); } catch { setState("err"); }
  }, [params]);
  return (
    <AuthShell title={t("au.verifyTitle")} sub="">
      <div className="text-center py-6 space-y-5">
        {state === "ok" && <><span className="inline-flex w-14 h-14 rounded-2xl bg-volt-500/12 border border-volt-500/30 text-volt-400 items-center justify-center anim-pop"><ICheck size={24} /></span><p className="font-display font-bold">{t("au.verifiedOk")}</p></>}
        {state === "err" && <><span className="inline-flex w-14 h-14 rounded-2xl bg-danger-500/12 border border-danger-500/30 text-danger-400 items-center justify-center"><IAlert size={24} /></span><p className="font-display font-bold">{t("e.notFound")}</p></>}
        {state === null && <p className="text-dim text-sm">{t("c.loading")}</p>}
        <Btn onClick={() => nav("/catalog")}>{t("h.cta1")}</Btn>
      </div>
    </AuthShell>
  );
}

export function Forgot() {
  const { t } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { db } = useApp();
  const target = db.users.find((u) => u.email === email.trim().toLowerCase());

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    await api.requestReset(email);
    setBusy(false); setSent(true);
  };

  return (
    <AuthShell title={t("au.resetTitle")} sub={t("au.resetDesc")}>
      {!sent ? (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("au.email")}><Input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" autoComplete="email" /></Field>
          <Btn type="submit" size="lg" className="w-full" loading={busy}>{t("c.submit")}</Btn>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-dim font-semibold flex items-center gap-2"><ICheck size={15} className="text-volt-500" /> {t("au.resetOk")}</p>
          {target?.resetToken && (
            <div className="sk-card !bg-canvas p-4 text-center space-y-3">
              <p className="text-[11.5px] text-faint font-semibold">dev shortcut · {t("hdr.mailbox")}</p>
              <a href={`#/auth/reset?t=${target.resetToken}`} className="inline-flex items-center gap-2 bg-volt-500 text-[#062b1b] font-bold text-sm rounded-[10px] px-5 h-11 hover:bg-volt-400 transition">{t("au.reset")}</a>
            </div>
          )}
          <Btn variant="soft" className="w-full" onClick={() => nav("/auth/login")}>{t("c.back")}</Btn>
        </div>
      )}
    </AuthShell>
  );
}

export function Reset() {
  const { t } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const token = params.get("t") ?? "";

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (pass !== pass2) { setErr(t("au.mismatch")); return; }
    setBusy(true);
    try { await api.resetPassword(token, pass); toast(t("au.resetDone"), "ok"); nav("/auth/login"); }
    catch (ex) { setErr(t((ex as { code?: string }).code ?? "e.generic")); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell title={t("au.resetTitle")} sub={t("au.newPassHere")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("a.newPass")}><PassInput value={pass} onChange={setPass} /></Field>
        <Field label={t("au.pass2")}><PassInput value={pass2} onChange={setPass2} /></Field>
        {err && <p className="text-[12.5px] font-bold text-danger-400 flex items-center gap-2"><IAlert size={14} /> {err}</p>}
        <Btn type="submit" size="lg" className="w-full" loading={busy}>{t("au.reset")}</Btn>
      </form>
    </AuthShell>
  );
}
