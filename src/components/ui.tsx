import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useApp, store } from "../state/store";
import { IX, ICheck, IAlert, IInfo, IChevronD, IChevronR, IStar, ICopy, IEye, IEyeOff, IMinus, IPlus, ISearch } from "./icons";
import { maskKey } from "../lib/money";

/* ---------------- Button ---------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "soft" | "dark";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
};
export function Btn({ variant = "primary", size = "md", loading, className = "", children, disabled, ...rest }: BtnProps) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-all duration-150 active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap";
  const sizes = { xs: "text-xs px-2.5 h-7", sm: "text-[13px] px-3.5 h-9", md: "text-sm px-4.5 h-10.5", lg: "text-[15px] px-6 h-12" }[size];
  const variants = {
    primary: "bg-volt-500 text-[#062b1b] hover:bg-volt-400 shadow-[0_4px_18px_-4px_rgba(47,201,138,0.5)]",
    outline: "border border-edge text-fog hover:border-volt-500 hover:text-volt-400",
    ghost: "text-dim hover:text-fog hover:bg-raise",
    danger: "bg-danger-500/12 text-danger-400 border border-danger-500/30 hover:bg-danger-500/20",
    soft: "bg-raise text-fog border border-line hover:border-edge",
    dark: "bg-fog text-canvas hover:opacity-90",
  }[variant];
  return (
    <button className={`${base} ${sizes} ${variants} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------- Inputs ---------------- */
export function Field({ label, error, hint, children }: { label?: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="block text-[12.5px] font-semibold text-dim mb-1.5">{label}</span>}
      {children}
      {error ? <span className="block text-xs text-danger-400 mt-1.5">{error}</span>
        : hint ? <span className="block text-xs text-faint mt-1.5">{hint}</span> : null}
    </label>
  );
}
export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`sk-input ${className}`} {...rest} />;
}
export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`sk-input min-h-24 resize-y ${className}`} {...rest} />;
}
export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`sk-input appearance-none pe-9 ${className}`} {...rest}>{children}</select>
      <IChevronD size={15} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
    </div>
  );
}

/* ---------------- Badges ---------------- */
export function Badge({ tone = "dim", children, className = "" }: { tone?: "volt" | "ember" | "danger" | "sky" | "dim" | "fog"; children: ReactNode; className?: string }) {
  const tones = {
    volt: "bg-volt-500/12 text-volt-400 border-volt-500/25",
    ember: "bg-ember-500/12 text-ember-400 border-ember-500/25",
    danger: "bg-danger-500/12 text-danger-400 border-danger-500/25",
    sky: "bg-sky-500/12 text-sky-400 border-sky-500/25",
    dim: "bg-raise text-dim border-line",
    fog: "bg-fog/10 text-fog border-edge",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${tones} ${className}`}>{children}</span>;
}

export function OrderBadge({ stateKey }: { stateKey: string }) {
  const { t } = useApp();
  const tone = stateKey.includes("PAID") || stateKey.includes("DELIVERED") || stateKey.includes("COMPLETED") ? "volt"
    : stateKey.includes("FAILED") || stateKey.includes("CANCELLED") || stateKey.includes("REFUNDED") ? "danger"
    : stateKey.includes("PROCESSING") ? "sky" : "ember";
  return <Badge tone={tone as "volt"}>{t(stateKey)}</Badge>;
}

export function KeyBadge({ status }: { status: string }) {
  const { t } = useApp();
  const tone = status === "UNUSED" ? "volt" : status === "RESERVED" ? "ember" : status === "DELIVERED" ? "sky" : status === "USED" ? "dim" : "danger";
  return <Badge tone={tone as "volt"}>{t(`ks.${status}`)}</Badge>;
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", fn); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px] anim-fade" onClick={onClose} />
      <div className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} max-h-[92vh] overflow-y-auto bg-panel border border-line sm:rounded-2xl rounded-t-2xl shadow-2xl anim-scale`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-panel z-10">
          <h3 className="font-display text-sm font-bold">{title}</h3>
          <button onClick={onClose} className="text-dim hover:text-fog p-1.5 rounded-lg hover:bg-raise transition" aria-label="Close"><IX size={17} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Toasts ---------------- */
export function ToastHost() {
  const { toasts } = useApp();
  return createPortal(
    <div className="fixed bottom-5 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold shadow-xl anim-slide max-w-md ${
          t.kind === "ok" ? "bg-[#0d2b1f] border-volt-500/40 text-volt-300"
          : t.kind === "err" ? "bg-[#2b1113] border-danger-500/40 text-danger-400"
          : "bg-panel border-line text-fog"}`}>
          {t.kind === "ok" ? <ICheck size={16} /> : t.kind === "err" ? <IAlert size={16} /> : <IInfo size={16} />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
export const toast = (msg: string, kind: "ok" | "err" | "info" = "ok") => store.toast(msg, kind);

/* ---------------- Tabs ---------------- */
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-line overflow-x-auto" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={value === tab.id} onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition ${
            value === tab.id ? "border-volt-500 text-fog" : "border-transparent text-dim hover:text-fog"}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Stars ---------------- */
export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${onChange ? "cursor-pointer" : ""}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} onClick={() => onChange(n)} aria-label={`${n} stars`} className="text-ember-400 hover:scale-110 transition-transform">
            <IStar size={size + 6} filled={n <= value} />
          </button>
        ) : (
          <span key={n} className={n <= Math.round(value) ? "text-ember-400" : "text-faint/50"}>
            <IStar size={size} filled={n <= Math.round(value)} />
          </span>
        ),
      )}
    </span>
  );
}

/* ---------------- Empty ---------------- */
export function Empty({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 anim-fade-up">
      <div className="w-14 h-14 rounded-2xl bg-raise border border-line flex items-center justify-center text-faint mb-4">{icon}</div>
      <h3 className="font-display text-sm font-bold mb-1.5">{title}</h3>
      {desc && <p className="text-sm text-dim max-w-sm mb-5">{desc}</p>}
      {action}
    </div>
  );
}

/* ---------------- Qty picker ---------------- */
export function Qty({ value, onChange, max = 5 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="inline-flex items-center border border-line rounded-[10px] overflow-hidden bg-canvas">
      <button onClick={() => onChange(Math.max(1, value - 1))} className="px-2.5 py-2 text-dim hover:text-fog hover:bg-raise transition" aria-label="Decrease"><IMinus size={13} /></button>
      <span className="w-8 text-center text-sm font-bold tabular-nums">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="px-2.5 py-2 text-dim hover:text-fog hover:bg-raise transition disabled:opacity-30" disabled={value >= max} aria-label="Increase"><IPlus size={13} /></button>
    </div>
  );
}

/* ---------------- Key field with reveal + copy ---------------- */
export function KeyField({ value }: { value: string }) {
  const { t } = useApp();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* noop */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="flex items-center gap-2 bg-canvas border border-line rounded-[10px] px-3 py-2 group hover:border-edge transition">
      <code className="font-mono text-[13px] tracking-wide flex-1 min-w-0 truncate" dir="ltr">{shown ? value : maskKey(value)}</code>
      <button onClick={() => setShown(!shown)} className="text-faint hover:text-fog transition p-1" aria-label={shown ? t("c.hide") : t("c.reveal")}>
        {shown ? <IEyeOff size={15} /> : <IEye size={15} />}
      </button>
      <button onClick={copy} className={`transition p-1 ${copied ? "text-volt-400" : "text-faint hover:text-fog"}`} aria-label={t("c.copy")}>
        {copied ? <ICheck size={15} /> : <ICopy size={15} />}
      </button>
    </div>
  );
}

/* ---------------- Dropdown ---------------- */
export function Dropdown({ trigger, children, align = "end", width = "w-52" }: { trigger: (open: boolean) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: "start" | "end"; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger(open)}</div>
      {open && (
        <div className={`absolute z-[70] mt-2 ${align === "end" ? "end-0" : "start-0"} ${width} bg-panel border border-line rounded-xl shadow-2xl overflow-hidden anim-slide`}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
export function DropItem({ onClick, children, danger }: { onClick?: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-start transition ${danger ? "text-danger-400 hover:bg-danger-500/10" : "text-dim hover:text-fog hover:bg-raise"}`}>
      {children}
    </button>
  );
}

/* ---------------- Misc ---------------- */
export function SectionHead({ title, sub, link }: { title: string; sub?: string; link?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-dim mt-1.5">{sub}</p>}
      </div>
      {link}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`sk-shimmer rounded-lg ${className}`} />;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const { t } = useApp();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      <Btn variant="soft" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><IChevronR size={14} className="rotate-180 rtl:rotate-0" /></Btn>
      <span className="text-sm text-dim font-semibold tabular-nums px-2">{page} {t("c.of")} {pages}</span>
      <Btn variant="soft" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}><IChevronR size={14} className="rtl:rotate-180" /></Btn>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <ISearch size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
      <input className="sk-input ps-9.5" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function Stat({ label, value, icon, tone = "volt", spark }: { label: string; value: ReactNode; icon?: ReactNode; tone?: "volt" | "ember" | "danger" | "sky"; spark?: ReactNode }) {
  const tones = { volt: "text-volt-400 bg-volt-500/10 border-volt-500/20", ember: "text-ember-400 bg-ember-500/10 border-ember-500/20", danger: "text-danger-400 bg-danger-500/10 border-danger-500/20", sky: "text-sky-400 bg-sky-500/10 border-sky-500/20" }[tone];
  return (
    <div className="sk-card p-4.5 flex flex-col gap-3 hover:border-edge transition group">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-bold uppercase tracking-wider text-faint">{label}</span>
        {icon && <span className={`w-8 h-8 rounded-lg border flex items-center justify-center ${tones}`}>{icon}</span>}
      </div>
      <div className="font-display text-[22px] font-bold tabular-nums leading-none">{value}</div>
      {spark}
    </div>
  );
}

export function BarChart({ data, money }: { data: { label: string; usd: number }[]; money: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.usd), 1);
  return (
    <div className="flex items-end gap-1.5 h-36">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group" title={`${d.label}: ${money(d.usd)}`}>
          <div className="w-full relative rounded-t-[5px] bg-volt-500/75 group-hover:bg-volt-400 transition-colors sk-bar-grow"
            style={{ height: `${Math.max(3, (d.usd / max) * 100)}%`, animationDelay: `${i * 40}ms` }} />
          <span className="text-[9px] text-faint tabular-nums hidden sm:block">{d.label.slice(0, 5)}</span>
        </div>
      ))}
    </div>
  );
}
