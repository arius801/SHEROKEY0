import { Link } from "react-router-dom";
import { useApp, stats } from "../state/store";
import { legalContent } from "../lib/i18n";
import { Btn, Empty } from "../components/ui";
import { IBox, IAlert, IKey, IGlobe, ICoins, IBolt } from "../components/icons";

export function LegalPage({ page }: { page: "terms" | "privacy" | "refunds" | "cookies" | "about" }) {
  const { t, ui, db } = useApp();
  const titles: Record<string, string> = {
    terms: t("f.terms"), privacy: t("f.privacy"), refunds: t("f.refunds"), cookies: t("f.cookies"), about: t("nav.about"),
  };
  const paras = legalContent[page]?.[ui.lang] ?? legalContent[page]?.en ?? [];
  const s = stats(db);
  return (
    <div className="max-w-3xl mx-auto px-4 pt-12">
      <header className="mb-9 anim-fade-up">
        <span className="sk-chip !text-volt-400 !border-volt-500/30 !bg-volt-500/8 mb-4"><IKey size={12} /> SHEROKEY</span>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">{titles[page]}</h1>
        <p className="text-[12.5px] text-faint font-semibold mt-2">{t("legal.updated")}: 2025-01-17</p>
      </header>
      <div className="space-y-5 anim-fade-up" style={{ animationDelay: "0.08s" }}>
        {paras.map((p, i) => (
          <p key={i} className="text-[14.5px] text-dim leading-[1.85] sk-card p-5">{p}</p>
        ))}
      </div>
      {page === "about" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line rounded-2xl overflow-hidden mt-9">
          {[
            { icon: <IKey size={15} />, v: s.vaultKeys, l: t("h.vault") },
            { icon: <IBolt size={15} />, v: s.deliveredKeys, l: t("h.delivered") },
            { icon: <IGlobe size={15} />, v: 4, l: t("c.language") + " · RTL/LTR" },
            { icon: <ICoins size={15} />, v: 4, l: t("c.currency") },
          ].map((x, i) => (
            <div key={i} className="bg-panel px-4 py-5 text-center">
              <span className="inline-flex text-volt-400 mb-2">{x.icon}</span>
              <p className="font-display text-xl font-extrabold tabular-nums">{x.v}</p>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-faint mt-1">{x.l}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-10">
        <Link to="/" className="text-[13px] font-bold text-volt-400 hover:underline">← {t("e.home")}</Link>
      </div>
    </div>
  );
}

export function NotFound() {
  const { t } = useApp();
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <p className="font-display text-[92px] font-extrabold leading-none text-volt-400/25 select-none anim-fade-up">404</p>
      <h1 className="font-display text-2xl font-extrabold -mt-4 mb-3">{t("e.404t")}</h1>
      <p className="text-sm text-dim max-w-md mx-auto mb-8 leading-relaxed">{t("e.404d")}</p>
      <div className="flex justify-center gap-3">
        <Btn onClick={() => (window.location.hash = "#/")}>{t("e.home")}</Btn>
        <Btn variant="soft" onClick={() => (window.location.hash = "#/catalog")}>{t("nav.catalog")}</Btn>
      </div>
    </div>
  );
}

export function ErrorPage() {
  const { t } = useApp();
  return (
    <div className="max-w-2xl mx-auto px-4 py-24">
      <Empty icon={<IAlert size={22} />} title={t("e.500t")} desc={t("e.500d")}
        action={<Btn onClick={() => window.location.reload()}>{t("c.retry")}</Btn>} />
    </div>
  );
}
