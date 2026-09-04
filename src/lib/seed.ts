import type {
  Category, Coupon, DB, EmailLog, KeyStatus, Lang, L10n, LicenseKey, Notification, Order,
  Product, Review, Settings, Ticket, TicketMessage, User, AuditLog,
} from "./types";
import { makeSalt, hashPassword, seededRng, uid } from "./crypto";
import { DEFAULT_PROVIDERS, DEFAULT_ROUTING } from "./payments";

const l = (en: string, ar: string, ru: string, fr: string): L10n => ({ en, ar, ru, fr });

export const IMG = {
  win11: "https://image.qwenlm.ai/generated-images/673f6c1f-5e8c-404d-a013-3b95c7548654/_result.png",
  office: "https://image.qwenlm.ai/generated-images/021e8752-e743-4b70-b942-d49ac2b0c451/_result.png",
  adobe: "https://image.qwenlm.ai/generated-images/37d220be-3230-4e3d-95ea-b2ddc476a22f/_result.png",
  spotify: "https://image.qwenlm.ai/generated-images/9497ffc4-ac2b-471c-94cd-81fd21be8fc4/_result.png",
  netflix: "https://image.qwenlm.ai/generated-images/55cce501-57f7-4a28-b338-a617225e1059/_result.png",
  psn: "https://image.qwenlm.ai/generated-images/34428383-dd8a-40e4-bebd-3feb3b5d5f66/_result.png",
  nordvpn: "https://image.qwenlm.ai/generated-images/fb393129-57d1-4c04-86ba-be50b65ab99b/_result.png",
  chatgpt: "https://image.qwenlm.ai/generated-images/64f42ac1-c241-4770-8451-18da547b4726/_result.png",
};

const categories: Category[] = [
  { id: "software", slug: "software", icon: "software", name: l("Software & OS", "برامج وأنظمة تشغيل", "Программы и ОС", "Logiciels & OS") },
  { id: "entertainment", slug: "entertainment", icon: "entertainment", name: l("Entertainment", "ترفيه", "Развлечения", "Divertissement") },
  { id: "gaming", slug: "gaming", icon: "gaming", name: l("Gaming", "ألعاب", "Игры", "Jeux vidéo") },
  { id: "security", slug: "security", icon: "security", name: l("Security & VPN", "أمان وشبكات خاصة", "Безопасность и VPN", "Sécurité & VPN") },
  { id: "ai", slug: "ai", icon: "ai", name: l("AI & Cloud", "ذكاء اصطناعي وسحابة", "ИИ и облако", "IA & Cloud") },
];

const T = (name: string) => l(name, name, name, name);

const products: Product[] = [
  {
    id: "p-win11", slug: "windows-11-pro", name: T("Windows 11 Pro — Lifetime"),
    short: l(
      "Genuine retail license key for Windows 11 Pro — activate once, own it forever.",
      "مفتاح ترخيص أصلي لنسخة Windows 11 Pro — فعّله مرة واحدة وامتلكه مدى الحياة.",
      "Настоящий розничный ключ Windows 11 Pro — активируйте один раз, владейте вечно.",
      "Véritable clé de licence Windows 11 Pro — activez une fois, gardez-la à vie."),
    description: l(
      "A genuine retail license for Windows 11 Pro, delivered as a 25-character activation key. The license binds to your Microsoft account on first activation and survives reinstalls and hardware upgrades.",
      "ترخيص أصلي لنظام Windows 11 Pro يُسلَّم كمفتاح تفعيل من 25 حرفًا. يرتبط الترخيص بحساب مايكروسوفت عند أول تفعيل ويبقى بعد إعادة التثبيت وترقية العتاد.",
      "Настоящая розничная лицензия Windows 11 Pro в виде ключа из 25 символов. Лицензия привязывается к аккаунту Microsoft при первой активации и переживает переустановки и апгрейд железа.",
      "Une licence authentique Windows 11 Pro, livrée sous forme de clé d'activation de 25 caractères. Elle se lie à votre compte Microsoft à la première activation et survit aux réinstallations."),
    requirements: l(
      "Internet connection · Microsoft account · 64-bit PC meeting Windows 11 minimum requirements.",
      "اتصال بالإنترنت · حساب مايكروسوفت · حاسوب 64 بت يستوفي الحد الأدنى لمتطلبات Windows 11.",
      "Интернет · аккаунт Microsoft · 64-битный ПК, соответствующий минимальным требованиям Windows 11.",
      "Connexion internet · compte Microsoft · PC 64 bits conforme aux prérequis Windows 11."),
    category: "software", tags: ["microsoft", "os", "oem"],
    priceUsd: 1999, compareAtUsd: 3999, deliveryMethod: "AUTO", durationMonths: null,
    stock: 0, lowStockThreshold: 6, active: true, featured: true, isNew: false,
    image: IMG.win11, accent: "#4c9aff", seoTitle: "Buy Windows 11 Pro Key — Instant Delivery | SHEROKEY",
    seoDescription: "Genuine Windows 11 Pro license key, delivered instantly after payment. Lifetime validity, replacement warranty.",
    createdAt: Date.now() - 86400000 * 90,
  },
  {
    id: "p-office", slug: "office-2024-pro-plus", name: T("Microsoft Office 2024 Pro Plus"),
    short: l(
      "Perpetual license for Word, Excel, PowerPoint and Outlook — no subscription.",
      "ترخيص دائم لـ Word وExcel وPowerPoint وOutlook — بلا اشتراك.",
      "Бессрочная лицензия Word, Excel, PowerPoint и Outlook — без подписки.",
      "Licence perpétuelle Word, Excel, PowerPoint et Outlook — sans abonnement."),
    description: l(
      "Office 2024 Professional Plus perpetual license for one PC. Includes Word, Excel, PowerPoint, Outlook, Access and Publisher with updates for the 2024 generation.",
      "ترخيص دائم لحزمة Office 2024 بروفيشنال بلس لجهاز واحد. يشمل Word وExcel وPowerPoint وOutlook وAccess وPublisher مع تحديثات جيل 2024.",
      "Бессрочная лицензия Office 2024 Professional Plus на один ПК. Включает Word, Excel, PowerPoint, Outlook, Access и Publisher с обновлениями поколения 2024.",
      "Licence perpétuelle Office 2024 Professional Plus pour un PC. Inclut Word, Excel, PowerPoint, Outlook, Access et Publisher avec les mises à jour de la génération 2024."),
    requirements: l(
      "Windows 10/11 or macOS · 4 GB RAM · 4 GB disk space · internet for activation.",
      "ويندوز 10/11 أو ماك · ذاكرة 4 غيغابايت · مساحة 4 غيغابايت · إنترنت للتفعيل.",
      "Windows 10/11 или macOS · 4 ГБ ОЗУ · 4 ГБ на диске · интернет для активации.",
      "Windows 10/11 ou macOS · 4 Go de RAM · 4 Go d'espace disque · internet pour l'activation."),
    category: "software", tags: ["microsoft", "office", "perpetual"],
    priceUsd: 2999, compareAtUsd: 5999, deliveryMethod: "AUTO", durationMonths: null,
    stock: 0, lowStockThreshold: 6, active: true, featured: true, isNew: false,
    image: IMG.office, accent: "#f0a63c", seoTitle: "Office 2024 Pro Plus License Key | SHEROKEY",
    seoDescription: "One-time purchase Office 2024 Professional Plus key. Instant automatic delivery.",
    createdAt: Date.now() - 86400000 * 75,
  },
  {
    id: "p-adobe", slug: "adobe-creative-cloud-12m", name: T("Adobe Creative Cloud — 12 Months"),
    short: l(
      "Full Creative Cloud suite — 20+ apps including Photoshop, Illustrator and Premiere Pro.",
      "حزمة Creative Cloud الكاملة — أكثر من 20 تطبيقًا تشمل فوتوشوب وإليستريتور وبريميير برو.",
      "Полный набор Creative Cloud — 20+ приложений, включая Photoshop, Illustrator и Premiere Pro.",
      "Suite Creative Cloud complète — plus de 20 applis dont Photoshop, Illustrator et Premiere Pro."),
    description: l(
      "Twelve months of the complete Adobe Creative Cloud: Photoshop, Illustrator, Premiere Pro, After Effects, Lightroom and 20+ more apps, with 100 GB of cloud storage.",
      "اثنا عشر شهرًا من حزمة أدوبي الإبداعية الكاملة: فوتوشوب وإليستريتور وبريميير برو وأفتر إفكتس ولايت روم وأكثر من 20 تطبيقًا، مع 100 غيغابايت تخزين سحابي.",
      "Двенадцать месяцев полного Adobe Creative Cloud: Photoshop, Illustrator, Premiere Pro, After Effects, Lightroom и ещё 20+ приложений, плюс 100 ГБ облачного хранилища.",
      "Douze mois du Creative Cloud complet : Photoshop, Illustrator, Premiere Pro, After Effects, Lightroom et plus de 20 applis, avec 100 Go de stockage cloud."),
    requirements: l(
      "Adobe ID · Windows 10+ or macOS 12+ · 8 GB RAM recommended · internet connection.",
      "حساب Adobe · ويندوز 10+ أو ماك 12+ · يُنصح بذاكرة 8 غيغابايت · اتصال بالإنترنت.",
      "Adobe ID · Windows 10+ или macOS 12+ · рекомендуется 8 ГБ ОЗУ · интернет.",
      "Adobe ID · Windows 10+ ou macOS 12+ · 8 Go de RAM recommandés · connexion internet."),
    category: "software", tags: ["adobe", "design", "subscription"],
    priceUsd: 14999, compareAtUsd: 19999, deliveryMethod: "AUTO", durationMonths: 12,
    stock: 0, lowStockThreshold: 10, active: true, featured: true, isNew: false,
    image: IMG.adobe, accent: "#e5484d", seoTitle: "Adobe Creative Cloud 12 Months — Cheap Key | SHEROKEY",
    seoDescription: "12 months of Adobe CC All Apps at a fraction of retail. Key delivered instantly.",
    createdAt: Date.now() - 86400000 * 60,
  },
  {
    id: "p-spotify", slug: "spotify-premium-6m", name: T("Spotify Premium — 6 Months"),
    short: l(
      "Six months of ad-free music, offline listening and top audio quality.",
      "ستة أشهر من الموسيقى بلا إعلانات والاستماع دون اتصال وأعلى جودة صوت.",
      "Шесть месяцев музыки без рекламы, офлайн-прослушивания и максимального качества звука.",
      "Six mois de musique sans pub, d'écoute hors ligne et de qualité audio maximale."),
    description: l(
      "Spotify Premium subscription credit for six months on one account. Limits removed, offline downloads enabled, highest audio quality on all your devices.",
      "رصيد اشتراك سبوتيفاي بريميوم لستة أشهر على حساب واحد. تُزال القيود وتُفعَّل التنزيلات دون اتصال وأعلى جودة صوت على جميع أجهزتك.",
      "Подписка Spotify Premium на шесть месяцев для одного аккаунта. Без ограничений, офлайн-загрузки, максимальное качество звука на всех устройствах.",
      "Crédit d'abonnement Spotify Premium pour six mois sur un compte. Limites supprimées, téléchargements hors ligne, qualité audio maximale sur tous vos appareils."),
    requirements: l(
      "Existing Spotify account (free tier is fine) · any device · email access for redemption.",
      "حساب سبوتيفاي قائم (المجاني يكفي) · أي جهاز · بريد إلكتروني للاستبدال.",
      "Существующий аккаунт Spotify (подойдёт бесплатный) · любое устройство · email для активации.",
      "Compte Spotify existant (gratuit accepté) · tout appareil · email pour l'activation."),
    category: "entertainment", tags: ["music", "subscription"],
    priceUsd: 3499, compareAtUsd: 4194, deliveryMethod: "AUTO", durationMonths: 6,
    stock: 0, lowStockThreshold: 8, active: true, featured: false, isNew: false,
    image: IMG.spotify, accent: "#2fc98a", seoTitle: "Spotify Premium 6 Months Key | SHEROKEY",
    seoDescription: "Spotify Premium for 6 months, delivered as a redemption code in seconds.",
    createdAt: Date.now() - 86400000 * 45,
  },
  {
    id: "p-netflix", slug: "netflix-premium-3m", name: T("Netflix Premium UHD — 3 Months"),
    short: l(
      "Three months of Netflix Premium with 4K UHD streaming on four screens.",
      "ثلاثة أشهر من نتفليكس بريميوم ببث 4K UHD على أربع شاشات.",
      "Три месяца Netflix Premium с 4K UHD на четырёх экранах.",
      "Trois mois de Netflix Premium avec streaming 4K UHD sur quatre écrans."),
    description: l(
      "Netflix Premium plan for three months, provisioned by an operator on a private profile. Stream in 4K UHD with HDR on up to four screens simultaneously.",
      "خطة نتفليكس بريميوم لثلاثة أشهر يجهّزها مشغّل على ملف شخصي خاص. شاهد بدقة 4K UHD مع HDR على أربع شاشات في وقت واحد.",
      "Тариф Netflix Premium на три месяца, подготавливаемый оператором на приватном профиле. Стриминг в 4K UHD с HDR на четырёх экранах одновременно.",
      "Forfait Netflix Premium pour trois mois, provisionné par un opérateur sur un profil privé. Streaming 4K UHD avec HDR sur quatre écrans simultanés."),
    requirements: l(
      "Netflix account · any device with the Netflix app · ~15 min provisioning window.",
      "حساب نتفليكس · أي جهاز بتطبيق نتفليكس · نافذة تجهيز ~15 دقيقة.",
      "Аккаунт Netflix · любое устройство с приложением · ~15 минут на подготовку.",
      "Compte Netflix · tout appareil avec l'appli · ~15 min de provisionning."),
    category: "entertainment", tags: ["video", "subscription", "4k"],
    priceUsd: 2799, compareAtUsd: 3897, deliveryMethod: "MANUAL", durationMonths: 3,
    stock: 24, lowStockThreshold: 6, active: true, featured: false, isNew: true,
    image: IMG.netflix, accent: "#e5484d", seoTitle: "Netflix Premium 3 Months — 4K UHD | SHEROKEY",
    seoDescription: "Netflix Premium for 3 months on a private profile, 4K UHD, delivered by operator.",
    createdAt: Date.now() - 86400000 * 10,
  },
  {
    id: "p-psn", slug: "psn-card-50-us", name: T("PlayStation Network Card — $50 (US)"),
    short: l(
      "$50 PlayStation Store wallet top-up for US accounts — code delivered instantly.",
      "رصيد 50 دولارًا لمتجر بلايستيشن للحسابات الأمريكية — الرمز يصل فورًا.",
      "Пополнение PlayStation Store на $50 для американских аккаунтов — код мгновенно.",
      "Crédit de 50 $ pour le PlayStation Store (comptes US) — code livré instantanément."),
    description: l(
      "A $50 PlayStation Store gift card code for US-region accounts. Redeem for games, add-ons, PlayStation Plus and movies. Code delivered the moment payment clears.",
      "رمز بطاقة هدايا بقيمة 50 دولارًا لمتجر بلايستيشن لحسابات المنطقة الأمريكية. استبدله بالألعاب والإضافات وبلايستيشن بلس والأفلام. يصل الرمز لحظة تأكيد الدفع.",
      "Код подарочной карты PlayStation Store на $50 для аккаунтов региона США. Подходит для игр, дополнений, PlayStation Plus и фильмов. Код приходит сразу после оплаты.",
      "Un code carte cadeau PlayStation Store de 50 $ pour comptes région US. À échanger contre jeux, DLC, PlayStation Plus et films. Livré dès confirmation du paiement."),
    requirements: l(
      "US-region PlayStation account · redeem at playstation.com or on console.",
      "حساب بلايستيشن بمنطقة أمريكا · الاستبدال عبر playstation.com أو الجهاز.",
      "Аккаунт PlayStation региона США · активация на playstation.com или консоли.",
      "Compte PlayStation région US · activation sur playstation.com ou sur console."),
    category: "gaming", tags: ["playstation", "gift-card"],
    priceUsd: 4699, compareAtUsd: null, deliveryMethod: "AUTO", durationMonths: null,
    stock: 0, lowStockThreshold: 5, active: true, featured: false, isNew: true,
    image: IMG.psn, accent: "#5aa7f0", seoTitle: "PSN Card $50 US — Instant Code | SHEROKEY",
    seoDescription: "$50 PlayStation Network gift card code for US accounts, delivered instantly.",
    createdAt: Date.now() - 86400000 * 8,
  },
  {
    id: "p-nordvpn", slug: "nordvpn-2-years", name: T("NordVPN — 2 Years"),
    short: l(
      "Two years of NordVPN — 6 devices, double VPN, Threat Protection.",
      "سنتان من نورد في بي إن — 6 أجهزة وDouble VPN وحماية من التهديدات.",
      "Два года NordVPN — 6 устройств, двойной VPN, Threat Protection.",
      "Deux ans de NordVPN — 6 appareils, double VPN, Threat Protection."),
    description: l(
      "NordVPN two-year subscription for up to six devices. Military-grade encryption, double VPN, Threat Protection and a strict no-logs policy, activated with a single key.",
      "اشتراك نورد في بي إن لسنتين حتى ستة أجهزة. تشفير عسكري وDouble VPN وحماية من التهديدات وسياسة صارمة لعدم الاحتفاظ بالسجلات، ويُفعَّل بمفتاح واحد.",
      "Подписка NordVPN на два года для шести устройств. Военное шифрование, двойной VPN, Threat Protection и строгая политика без логов — активация одним ключом.",
      "Abonnement NordVPN de deux ans pour six appareils. Chiffrement de niveau militaire, double VPN, Threat Protection et politique stricte zéro log — activation par une seule clé."),
    requirements: l(
      "Any device (Windows, macOS, Android, iOS, Linux) · one NordVPN account.",
      "أي جهاز (ويندوز، ماك، أندرويد، iOS، لينكس) · حساب نورد في بي إن واحد.",
      "Любое устройство (Windows, macOS, Android, iOS, Linux) · один аккаунт NordVPN.",
      "Tout appareil (Windows, macOS, Android, iOS, Linux) · un compte NordVPN."),
    category: "security", tags: ["vpn", "privacy", "subscription"],
    priceUsd: 5999, compareAtUsd: 8999, deliveryMethod: "AUTO", durationMonths: 24,
    stock: 0, lowStockThreshold: 8, active: true, featured: true, isNew: false,
    image: IMG.nordvpn, accent: "#2ec4b6", seoTitle: "NordVPN 2 Years — Best Price | SHEROKEY",
    seoDescription: "NordVPN 2-year plan key at a fraction of the official price. Instant delivery.",
    createdAt: Date.now() - 86400000 * 30,
  },
  {
    id: "p-chatgpt", slug: "chatgpt-plus-1m", name: T("ChatGPT Plus — 1 Month"),
    short: l(
      "One month of ChatGPT Plus — priority access, GPT-4o and advanced voice.",
      "شهر من ChatGPT Plus — وصول ذو أولوية وGPT-4o والصوت المتقدم.",
      "Месяц ChatGPT Plus — приоритетный доступ, GPT-4o и продвинутый голос.",
      "Un mois de ChatGPT Plus — accès prioritaire, GPT-4o et voix avancée."),
    description: l(
      "ChatGPT Plus membership for one month, provisioned by our operators on your account. Priority access at peak times, GPT-4o, advanced voice and image generation.",
      "عضوية ChatGPT Plus لشهر واحد يجهّزها مشغلونا على حسابك. وصول ذو أولوية في أوقات الذروة وGPT-4o والصوت المتقدم وتوليد الصور.",
      "Подписка ChatGPT Plus на месяц, активируемая операторами на вашем аккаунте. Приоритетный доступ в пиковые часы, GPT-4o, продвинутый голос и генерация изображений.",
      "Abonnement ChatGPT Plus d'un mois, provisionné par nos opérateurs sur votre compte. Accès prioritaire aux heures de pointe, GPT-4o, voix avancée et génération d'images."),
    requirements: l(
      "Existing ChatGPT account · account email shared securely at checkout · ~15 min provisioning.",
      "حساب ChatGPT قائم · تُشارك بريد الحساب بأمان عند الشراء · تجهيز ~15 دقيقة.",
      "Существующий аккаунт ChatGPT · email передаётся безопасно при оформлении · ~15 минут на активацию.",
      "Compte ChatGPT existant · email transmis en toute sécurité au paiement · ~15 min de provisionning."),
    category: "ai", tags: ["ai", "subscription"],
    priceUsd: 1899, compareAtUsd: 2299, deliveryMethod: "MANUAL", durationMonths: 1,
    stock: 15, lowStockThreshold: 4, active: true, featured: false, isNew: true,
    image: IMG.chatgpt, accent: "#2fc98a", seoTitle: "ChatGPT Plus 1 Month — Fast Activation | SHEROKEY",
    seoDescription: "ChatGPT Plus for one month, activated by operators in ~15 minutes.",
    createdAt: Date.now() - 86400000 * 5,
  },
];

const keyPrefix: Record<string, string> = {
  "p-win11": "W11P", "p-office": "OF24", "p-adobe": "ADCC", "p-spotify": "SPTP", "p-psn": "PSN5", "p-nordvpn": "NVPN",
};

function genKey(prefix: string, rnd: () => number): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const group = () => Array.from({ length: 5 }, () => chars[Math.floor(rnd() * chars.length)]).join("");
  return `${prefix}-${group()}-${group()}-${group()}`;
}

export async function buildSeed(): Promise<DB> {
  const rnd = seededRng(20240117);
  const now = Date.now();
  const day = 86400000;

  async function mkUser(name: string, email: string, pw: string, role: User["role"], extra: Partial<User> = {}): Promise<User> {
    const salt = makeSalt();
    return {
      id: uid("u"), name, email, salt, passwordHash: await hashPassword(pw, salt), role,
      lang: "en", currency: "USD", verified: true, verifyToken: null, verifyExpires: null,
      resetToken: null, resetExpires: null, createdAt: now - Math.floor(rnd() * 90 + 10) * day,
      failedLogins: 0, lockedUntil: null, ...extra,
    };
  }

  const owner = await mkUser("Sherokey Owner", "owner@sherokey.com", "Owner@2024", "OWNER", { createdAt: now - 200 * day });
  const admin = await mkUser("Nadia Osman", "admin@sherokey.com", "Admin@2024", "ADMIN");
  const support = await mkUser("Yusuf Karim", "support@sherokey.com", "Support@2024", "SUPPORT");
  const demo = await mkUser("Demo Customer", "demo@sherokey.com", "Demo@2024", "CUSTOMER", { lang: "en", currency: "USD" });
  const c2 = await mkUser("Layla Haddad", "layla@example.com", "Customer@1", "CUSTOMER", { lang: "ar", currency: "SAR" });
  const c3 = await mkUser("Dmitri Volkov", "dmitri@example.com", "Customer@1", "CUSTOMER", { lang: "ru", currency: "RUB" });
  const c4 = await mkUser("Camille Roux", "camille@example.com", "Customer@1", "CUSTOMER", { lang: "fr", currency: "EUR" });
  const users = [owner, admin, support, demo, c2, c3, c4];

  /* ---- key vault ---- */
  const keyCounts: Record<string, number> = { "p-win11": 18, "p-office": 14, "p-adobe": 8, "p-spotify": 22, "p-psn": 12, "p-nordvpn": 26 };
  const licenseKeys: LicenseKey[] = [];
  for (const [pid, n] of Object.entries(keyCounts))
    for (let i = 0; i < n; i++)
      licenseKeys.push({ id: uid("k"), productId: pid, key: genKey(keyPrefix[pid], rnd), status: "UNUSED", orderId: null, reservedAt: null, deliveredAt: null, customerId: null });

  /* ---- coupons ---- */
  const coupons: Coupon[] = [
    { code: "WELCOME10", type: "PERCENT", value: 10, minOrderUsd: 1000, startsAt: now - 30 * day, expiresAt: now + 335 * day, maxUses: 1000, maxPerCustomer: 1, uses: 3, active: true, productIds: [] },
    { code: "VAULT5", type: "FIXED", value: 500, minOrderUsd: 5000, startsAt: now - 10 * day, expiresAt: now + 60 * day, maxUses: 500, maxPerCustomer: 2, uses: 1, active: true, productIds: [] },
    { code: "GAMER15", type: "PERCENT", value: 15, minOrderUsd: 2000, startsAt: now - 90 * day, expiresAt: now + 30 * day, maxUses: 200, maxPerCustomer: 1, uses: 200, active: false, productIds: ["p-psn"] },
  ];

  /* ---- orders (historical, aggregated by dashboards) ---- */
  const orders: Order[] = [];
  const payments: DB["payments"] = [];
  const paymentEvents: DB["paymentEvents"] = [];
  const emailLogs: EmailLog[] = [];
  const notifications: Notification[] = [];
  const customers = [demo, c2, c3, c4];
  const autoPool = ["p-win11", "p-office", "p-adobe", "p-spotify", "p-psn", "p-nordvpn"];
  let seq = 1;

  const orderNumber = () => `SK-${new Date().getFullYear()}-${String(seq++).padStart(4, "0")}`;
  const productById = (id: string) => products.find((p) => p.id === id)!;

  function takeKeys(pid: string, qty: number, orderId: string, customerId: string, at: number): string[] {
    const out: string[] = [];
    for (const k of licenseKeys) {
      if (out.length >= qty) break;
      if (k.productId === pid && k.status === "UNUSED") {
        k.status = "DELIVERED"; k.orderId = orderId; k.customerId = customerId;
        k.reservedAt = at - 1000; k.deliveredAt = at;
        out.push(k.key);
      }
    }
    return out;
  }

  function mkOrder(p: Product, customer: User, daysAgo: number, opts: Partial<Order> & { fail?: boolean; refund?: boolean; manualPending?: boolean } = {}): Order {
    const created = now - daysAgo * day - Math.floor(rnd() * 20000000);
    const qty = rnd() < 0.2 ? 2 : 1;
    const lineTotal = p.priceUsd * qty;
    const id = uid("o");
    const number = orderNumber();
    const payAt = created + 40000 + Math.floor(rnd() * 60000);
    const deliverAt = payAt + 15000 + Math.floor(rnd() * 45000);
    const o: Order = {
      id, number, customerId: customer.id, customerName: customer.name, email: customer.email,
      items: [{ productId: p.id, name: p.name.en, image: p.image, qty, unitUsd: p.priceUsd, lineTotalUsd: lineTotal, deliveryMethod: p.deliveryMethod }],
      couponCode: null, discountUsd: 0, taxUsd: 0, totalUsd: lineTotal,
      currency: customer.currency, fxRate: 1, totalMinor: lineTotal,
      paymentMethod: rnd() < 0.65 ? "STRIPE" : "PAYPAL", paymentId: `pi_${uid("").slice(3)}`,
      paymentStatus: "PAID", fulfillmentStatus: p.deliveryMethod === "AUTO" ? "DELIVERED" : "DELIVERED",
      delivery: null, deliveredBy: null,
      history: [
        { at: created, state: "PENDING_PAYMENT", by: "system" },
        { at: payAt, state: "PAID", by: "webhook" },
        { at: deliverAt, state: "DELIVERED", by: "fulfillment" },
      ],
      createdAt: created, paidAt: payAt, deliveredAt: deliverAt,
    };
    if (p.deliveryMethod === "AUTO" && !opts.fail && !opts.refund) {
      const keys = takeKeys(p.id, qty, id, customer.id, deliverAt);
      o.delivery = { keys, activationCode: null, account: null, downloadLink: null, notes: null };
    }
    if (opts.fail) {
      o.paymentStatus = "FAILED"; o.fulfillmentStatus = "CANCELLED"; o.paymentId = null;
      o.history = [{ at: created, state: "PENDING_PAYMENT", by: "system" }, { at: payAt, state: "FAILED", by: "webhook" }];
      o.deliveredAt = null;
    }
    if (opts.refund) {
      o.paymentStatus = "REFUNDED"; o.fulfillmentStatus = "CANCELLED";
      o.history.push({ at: payAt + 2 * day, state: "REFUNDED", by: "admin" });
      for (const k of licenseKeys) if (k.orderId === id) k.status = "REVOKED";
    }
    if (opts.manualPending) {
      o.fulfillmentStatus = "PROCESSING"; o.deliveredAt = null;
      o.history = [
        { at: created, state: "PENDING_PAYMENT", by: "system" },
        { at: payAt, state: "PAID", by: "webhook" },
        { at: payAt + 1000, state: "PROCESSING", by: "fulfillment" },
      ];
      o.delivery = null;
    }
    orders.push(o);
    const provId = o.paymentMethod === "MIR" ? "MIR_ACQUIRER" as const : o.paymentMethod;
    const pm = o.paymentMethod === "MIR" ? "CARD_MIR" as const : o.paymentMethod === "PAYPAL" ? "PAYPAL" as const : "CARD_INTL" as const;
    payments.push({
      id: uid("pay"), orderId: id, provider: provId, providerRef: o.paymentId, providerCustomerId: null, paymentMethod: pm,
      amountUsd: o.totalUsd, currency: o.currency, amountMinor: o.totalMinor,
      status: o.paymentStatus, createdAt: created, capturedAt: o.paymentStatus === "PAID" || o.paymentStatus === "REFUNDED" ? payAt : null, updatedAt: payAt,
    });
    if (o.paymentStatus !== "FAILED")
      paymentEvents.push({ eventId: `evt_${id}`, provider: provId, type: "payment.captured", orderId: id, signatureValid: true, payloadHash: null, processed: true, receivedAt: payAt });
    else
      paymentEvents.push({ eventId: `evt_${id}`, provider: provId, type: "payment.failed", orderId: id, signatureValid: true, payloadHash: null, processed: true, receivedAt: payAt });
    emailLogs.push({
      id: uid("em"), to: customer.email, toName: customer.name, type: o.paymentStatus === "FAILED" ? "payment_failed" : "order_receipt",
      subject: o.paymentStatus === "FAILED" ? `Payment failed for ${number}` : `Receipt for order ${number}`,
      lang: customer.lang, status: "SENT", provider: "resend", createdAt: payAt + 2000,
    });
    return o;
  }

  /* 16 healthy historical orders across the last 14 days */
  const weights = [0, 0, 1, 2, 3, 4, 4, 5, 6, 8, 9, 11, 12, 13, 13, 14];
  for (let i = 0; i < 16; i++) {
    const p = productById(autoPool[Math.floor(rnd() * autoPool.length)]);
    const customer = customers[Math.floor(rnd() * customers.length)];
    const o = mkOrder(p, customer, Math.min(weights[i] ?? 1, 14));
    if (rnd() < 0.5) { o.fulfillmentStatus = "COMPLETED"; o.history.push({ at: (o.deliveredAt ?? o.createdAt) + 3600000, state: "COMPLETED", by: "system" }); }
  }
  /* one refunded, one failed, one manual-pending for demo user */
  const refunded = mkOrder(productById("p-spotify"), c3, 9, { refund: true });
  const failed = mkOrder(productById("p-adobe"), c4, 3, { fail: true });
  const manualPending = mkOrder(productById("p-chatgpt"), demo, 0, { manualPending: true });

  const refunds: DB["refunds"] = [{
    id: uid("rf"), orderId: refunded.id, paymentId: payments.find((p) => p.orderId === refunded.id)!.id,
    providerRefundId: `re_${refunded.id.slice(-10)}`, status: "SUCCEEDED",
    amountUsd: refunded.totalUsd, reason: "Key failed activation twice", issuedBy: admin.id, createdAt: refunded.history[refunded.history.length - 1].at,
  }];

  /* demo user's own delivered orders */
  const demoOrder1 = mkOrder(productById("p-win11"), demo, 12);
  const demoOrder2 = mkOrder(productById("p-spotify"), demo, 6);
  /* RUB order settled through the MIR acquirer route */
  mkOrder(productById("p-office"), c3, 4, { paymentMethod: "MIR" });

  /* ---- reviews ---- */
  const reviewSeed: [string, User, number, string, string, string, string][] = [
    ["p-win11", demo, 5, "Activated in under a minute, bound to my Microsoft account instantly.", "تفعّل خلال أقل من دقيقة وارتبط بحسابي فورًا.", "Активировался за минуту, привязался к аккаунту сразу.", "Activé en moins d'une minute, lié à mon compte Microsoft."],
    ["p-win11", c3, 5, "Genuine retail key, passed Microsoft's activation without issues.", "مفتاح أصلي وتجاوز تفعيل مايكروسوفت بلا مشاكل.", "Настоящий ключ, активация Microsoft прошла без проблем.", "Clé authentique, activation Microsoft sans souci."],
    ["p-office", c2, 4, "Word and Excel activated on the first try. One star off for the 40-second wait.", "تفعّل Word وExcel من أول محاولة.", "Word и Excel активировались с первого раза.", "Word et Excel activés du premier coup."],
    ["p-adobe", c4, 5, "Full suite activated on my Adobe ID. Cheaper than any reseller I found.", "تفعّلت الحزمة الكاملة على حسابي.", "Весь набор активировался на мой Adobe ID.", "Suite complète activée sur mon Adobe ID."],
    ["p-spotify", demo, 5, "Six months landed on my account in seconds. Flawless.", "وصلت ستة أشهر إلى حسابي خلال ثوانٍ.", "Шесть месяцев упали на аккаунт за секунды.", "Six mois arrivés sur mon compte en quelques secondes."],
    ["p-nordvpn", c3, 5, "Two years for this price is unreal. Key worked immediately.", "سنتان بهذا السعر لا يُصدق.", "Два года за эту цену — невероятно.", "Deux ans à ce prix, incroyable."],
    ["p-psn", c2, 4, "Code redeemed fine on my US account.", "استُبدل الرمز على حسابي الأمريكي بلا مشكلة.", "Код погасился на американском аккаунте.", "Code échangé sans problème sur mon compte US."],
    ["p-chatgpt", c4, 5, "Operator upgraded my account in about ten minutes.", "رقّى المشغّل حسابي خلال عشر دقائق تقريبًا.", "Оператор подключил Plus примерно за десять минут.", "L'opérateur a mis à niveau mon compte en dix minutes."],
  ];
  const reviews: Review[] = reviewSeed.map(([pid, u, rating, en, ar, ru, fr], i) => ({
    id: uid("rv"), productId: pid, customerId: u.id, customerName: u.name, rating,
    text: { en: u.lang, ar: "ar", ru: "ru", fr: "fr" }[u.lang] === "en" ? en : u.lang === "ar" ? ar : u.lang === "ru" ? ru : fr,
    verified: true, approved: i !== 6, reported: false, createdAt: now - Math.floor(rnd() * 40 + 2) * day,
  }));

  /* ---- support ---- */
  const tickets: Ticket[] = [
    { id: uid("tk"), customerId: demo.id, orderId: manualPending.id, subject: "Status of my ChatGPT Plus order", status: "OPEN", assignee: support.id, createdAt: now - 3600000 * 5, updatedAt: now - 3600000 * 4 },
    { id: uid("tk"), customerId: c3.id, orderId: refunded.id, subject: "Refund for failed Spotify key", status: "CLOSED", assignee: support.id, createdAt: now - 9 * day, updatedAt: now - 8 * day },
  ];
  const ticketMessages: TicketMessage[] = [
    { id: uid("tm"), ticketId: tickets[0].id, authorId: demo.id, authorName: demo.name, staff: false, text: "Hi! I paid for ChatGPT Plus about an hour ago — the order still says processing. Could you check?", createdAt: now - 3600000 * 5 },
    { id: uid("tm"), ticketId: tickets[0].id, authorId: support.id, authorName: "Yusuf Karim", staff: true, text: "Hello! Your payment is confirmed — an operator is provisioning your account right now. You'll get an email and a notification the second it's done.", createdAt: now - 3600000 * 4 },
    { id: uid("tm"), ticketId: tickets[1].id, authorId: c3.id, authorName: c3.name, staff: false, text: "The Spotify key failed to redeem twice.", createdAt: now - 9 * day },
    { id: uid("tm"), ticketId: tickets[1].id, authorId: support.id, authorName: "Yusuf Karim", staff: true, text: "Sorry about that — we've issued a full refund to your card. It will appear within 5–10 business days.", createdAt: now - 8 * day },
  ];

  notifications.push(
    { id: uid("nt"), userId: demo.id, type: "n.manual", vars: { n: manualPending.number }, link: `/account/orders/${manualPending.id}`, read: false, createdAt: manualPending.paidAt! + 2000 },
    { id: uid("nt"), userId: demo.id, type: "n.delivered", vars: { n: demoOrder2.number }, link: `/account/orders/${demoOrder2.id}`, read: false, createdAt: demoOrder2.deliveredAt! + 2000 },
    { id: uid("nt"), userId: demo.id, type: "n.delivered", vars: { n: demoOrder1.number }, link: `/account/orders/${demoOrder1.id}`, read: true, createdAt: demoOrder1.deliveredAt! + 2000 },
  );
  for (const [uidKey, name] of [[owner.id, "Owner"], [admin.id, "Nadia"], [support.id, "Yusuf"]] as [string, string][])
    notifications.push({ id: uid("nt"), userId: uidKey, type: "n.manual", vars: { n: manualPending.number }, link: `/admin/orders/${manualPending.id}`, read: name !== "Yusuf", createdAt: manualPending.paidAt! + 2500 });

  /* welcome emails */
  for (const u of users.slice(3))
    emailLogs.push({ id: uid("em"), to: u.email, toName: u.name, type: "welcome", subject: "Welcome to SHEROKEY", lang: u.lang, status: "SENT", provider: "resend", createdAt: u.createdAt + 3000 });
  emailLogs.push({ id: uid("em"), to: c4.email, toName: c4.name, type: "payment_failed", subject: `Payment failed for ${failed.number}`, lang: "fr", status: "FAILED", provider: "resend", createdAt: failed.createdAt + 4000 });

  const auditLogs: AuditLog[] = [
    { id: uid("al"), actorId: owner.id, actorName: "Sherokey Owner", action: "SEED_IMPORTED", target: "catalog", meta: "8 products, 100 keys, 7 users", at: now - 200 * day },
    { id: uid("al"), actorId: admin.id, actorName: "Nadia Osman", action: "PRICE_CHANGED", target: "p-adobe", meta: "159.99 → 149.99 USD", at: now - 12 * day },
    { id: uid("al"), actorId: admin.id, actorName: "Nadia Osman", action: "REFUND_ISSUED", target: refunded.number, meta: `$${(refunded.totalUsd / 100).toFixed(2)} — key failed activation`, at: refunded.history[refunded.history.length - 1].at },
    { id: uid("al"), actorId: support.id, actorName: "Yusuf Karim", action: "TICKET_REPLIED", target: tickets[1].id.slice(0, 12), meta: "Refund confirmation sent", at: now - 8 * day },
  ];

  const settings: Settings = {
    storeName: "SHEROKEY", supportEmail: "support@sherokey.com", contactEmail: "hello@sherokey.com",
    description: "Digital keys, licenses and subscriptions — delivered in seconds.",
    langs: ["en", "ar", "ru", "fr"], currencies: ["USD", "EUR", "SAR", "RUB"],
    defaultLang: "en", defaultCurrency: "USD",
    fx: { USD: 1, EUR: 0.9234, SAR: 3.75, RUB: 96.42 },
    stripeEnabled: true, paypalEnabled: true, taxRatePct: 0, maintenanceMode: false,
    emailProvider: "RESEND", emailFrom: "SHEROKEY <no-reply@sherokey.com>", requireReviewApproval: true,
    providers: DEFAULT_PROVIDERS, routing: DEFAULT_ROUTING,
  };

  return {
    users, sessionUserId: null, sessionToken: null, sessionExpires: null,
    categories, products, licenseKeys, orders, payments, paymentEvents, refunds, coupons, reviews,
    wishlist: [{ userId: demo.id, productId: "p-nordvpn" }, { userId: demo.id, productId: "p-psn" }],
    notifications, tickets, ticketMessages, auditLogs, emailLogs, settings,
    carts: [], orderSeq: seq,
  };
}
