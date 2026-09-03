import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function S({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IKey = (p: P) => <S {...p}><circle cx="8" cy="10" r="4.2" /><path d="M11.2 13 20 21.5M16.5 18l2.6-2.6M13.8 15.5l2.2-2.2" /></S>;
export const IKeyCap = (p: P) => <S {...p}><rect x="3.5" y="5" width="17" height="14" rx="3" /><circle cx="9.2" cy="11" r="2.4" /><path d="M11.3 12.9 16 17M14 15l1.6-1.6" /></S>;
export const ICart = (p: P) => <S {...p}><path d="M3.5 4.5h2.2l2 11h10.6l2-8H7" /><circle cx="9.5" cy="19.6" r="1.4" /><circle cx="16.9" cy="19.6" r="1.4" /></S>;
export const IUser = (p: P) => <S {...p}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.8-3.5 3.6-5.4 7-5.4s6.2 1.9 7 5.4" /></S>;
export const IUsers = (p: P) => <S {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7M15.5 5.8a3.2 3.2 0 0 1 0 5.4M17.8 14.9c1.6.7 2.6 2.3 2.9 4.6" /></S>;
export const IGlobe = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.2 3.9 8.5S14.6 18.2 12 20.5C9.4 18.2 8.1 15.3 8.1 12S9.4 5.8 12 3.5Z" /></S>;
export const ICoins = (p: P) => <S {...p}><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></S>;
export const ISearch = (p: P) => <S {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="m15.2 15.2 5.3 5.3" /></S>;
export const IHeart = (p: P & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return <S {...rest} fill={filled ? "currentColor" : "none"}><path d="M12 20.2 4.8 13a4.7 4.7 0 0 1 0-6.7 4.8 4.8 0 0 1 6.7 0l.5.5.5-.5a4.8 4.8 0 0 1 6.7 0 4.7 4.7 0 0 1 0 6.7Z" /></S>;
};
export const IBell = (p: P) => <S {...p}><path d="M6 16v-5.5a6 6 0 1 1 12 0V16l1.5 2.5h-15Z" /><path d="M10 21a2.2 2.2 0 0 0 4 0" /></S>;
export const IStar = (p: P & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return <S {...rest} fill={filled ? "currentColor" : "none"} strokeWidth={filled ? 0 : 1.8}><path d="m12 3.6 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2 6.9 19l1.1-5.6-4.2-3.9 5.7-.7Z" stroke="currentColor" strokeWidth={1.5} /></S>;
};
export const IShield = (p: P) => <S {...p}><path d="M12 3.5 5 6v6c0 4.4 3 7.4 7 8.5 4-1.1 7-4.1 7-8.5V6Z" /><path d="m9 11.8 2.2 2.2L15.4 9.6" /></S>;
export const IBolt = (p: P) => <S {...p}><path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12Z" /></S>;
export const IBox = (p: P) => <S {...p}><path d="m12 3 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></S>;
export const ICheck = (p: P) => <S {...p}><path d="m4.5 12.5 5 5L19.5 7" /></S>;
export const ICheckCircle = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.3 2.6 2.6 4.8-5.4" /></S>;
export const IX = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const IChevronD = (p: P) => <S {...p}><path d="m6 9.5 6 6 6-6" /></S>;
export const IChevronR = (p: P) => <S {...p}><path d="m9.5 6 6 6-6 6" /></S>;
export const IMenu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h10" /></S>;
export const ILogout = (p: P) => <S {...p}><path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M10.5 12H21M17.5 8.5 21 12l-3.5 3.5" /></S>;
export const IGear = (p: P) => <S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4M6.2 6.2l1.7 1.7M16.1 16.1l1.7 1.7M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7" /></S>;
export const IMail = (p: P) => <S {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7.5 7.5 6 7.5-6" /></S>;
export const ITag = (p: P) => <S {...p}><path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5a1.4 1.4 0 0 1 0 2L14 20.5a1.4 1.4 0 0 1-2 0Z" /><circle cx="8" cy="8" r="1.4" /></S>;
export const IPercent = (p: P) => <S {...p}><path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.3" /><circle cx="16.5" cy="16.5" r="2.3" /></S>;
export const IGrid = (p: P) => <S {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></S>;
export const IChart = (p: P) => <S {...p}><path d="M4 4v16h16" /><path d="M8 15v-4M12 15V7M16 15v-6" /></S>;
export const IClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.4 2" /></S>;
export const IDownload = (p: P) => <S {...p}><path d="M12 4v10M8 10.5l4 4 4-4M4.5 19.5h15" /></S>;
export const IUpload = (p: P) => <S {...p}><path d="M12 14V4M8 7.5l4-4 4 4M4.5 19.5h15" /></S>;
export const ICopy = (p: P) => <S {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M5.5 15.5h-1a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" transform="translate(1,1)" /></S>;
export const IEye = (p: P) => <S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></S>;
export const IEyeOff = (p: P) => <S {...p}><path d="M4 4l16 16M9.9 5.9A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-3.2 3.9M6 8A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.5-.7" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></S>;
export const IPlus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IMinus = (p: P) => <S {...p}><path d="M5 12h14" /></S>;
export const ITrash = (p: P) => <S {...p}><path d="M4.5 6.5h15M9 6V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6M6.5 6.5l1 13h9l1-13M10 10.5v5M14 10.5v5" /></S>;
export const IEdit = (p: P) => <S {...p}><path d="M14.5 5 19 9.5 8.5 20H4v-4.5Z" /><path d="m12.5 7 4.5 4.5" /></S>;
export const IFilter = (p: P) => <S {...p}><path d="M4 5.5h16l-6.2 7v6L10.2 20v-7.5Z" /></S>;
export const IArrowR = (p: P) => <S {...p}><path d="M4 12h16M14 6l6 6-6 6" /></S>;
export const IRefresh = (p: P) => <S {...p}><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5" /></S>;
export const IAlert = (p: P) => <S {...p}><path d="M12 3.5 1.9 20.5h20.2Z" /><path d="M12 10v4.5M12 17.6v.1" /></S>;
export const IInfo = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 7.6v.1" /></S>;
export const ILock = (p: P) => <S {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" /></S>;
export const ILifebuoy = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M18 18l-3.5-3.5M6 18l3.5-3.5" /></S>;
export const ISun = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></S>;
export const IMoon = (p: P) => <S {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /></S>;
export const ICard = (p: P) => <S {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6 14.5h4" /></S>;
export const ITerminal = (p: P) => <S {...p}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7 9.5 3 2.7-3 2.7M12.5 15.5h4.5" /></S>;
export const ISpark = (p: P) => <S {...p}><path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5ZM18.5 15.5c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z" /></S>;
export const IFile = (p: P) => <S {...p}><path d="M6 3.5h8l4 4v13H6Z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></S>;
export const ICalendar = (p: P) => <S {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></S>;
export const ISend = (p: P) => <S {...p}><path d="M21 3.5 3 10.2l7 2.8 2.8 7Z" /><path d="M21 3.5 10 13" /></S>;
export const IDb = (p: P) => <S {...p}><ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" /><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" /></S>;
export const IActivity = (p: P) => <S {...p}><path d="M3 12h4l2.5-6.5 4.5 13L16.5 12H21" /></S>;
export const ITrend = (p: P) => <S {...p}><path d="m3.5 17 5.5-5.5 3.5 3.5 7-7.5" /><path d="M15 7.5h4.5V12" /></S>;
export const IBan = (p: P) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></S>;
export const IUndo = (p: P) => <S {...p}><path d="M8 5 4 9l4 4" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></S>;
export const IWrench = (p: P) => <S {...p}><path d="M14.5 6.5a4 4 0 0 0-5.3 5L4 16.7a2 2 0 1 0 2.9 2.9l5.2-5.2a4 4 0 0 0 5-5.3l-2.7 2.7-2.5-.7-.7-2.5Z" /></S>;
export const IHome = (p: P) => <S {...p}><path d="m4 10.5 8-7 8 7V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z" /></S>;
export const IChevronsR = (p: P) => <S {...p}><path d="m6.5 6 6 6-6 6M12.5 6l6 6-6 6" /></S>;
export const IDot = (p: P) => <S {...p} strokeWidth={0}><circle cx="12" cy="12" r="5" fill="currentColor" /></S>;
export const IPaypal = (p: P) => <S {...p}><path d="M7.5 20.5 9.7 5h5.1c2.9 0 4.6 1.6 4.3 4.3-.3 3-2.4 4.6-5.3 4.6h-2.5l-1 6.6Z" /><path d="M6 17.5 8.4 2h4.8" opacity=".45" /></S>;
export const IStripe = (p: P) => <S {...p}><path d="M12 4.5c-3.5 0-6 1.5-6 4.2 0 3.8 5.4 3.3 5.4 5 0 .6-.7 1-1.8 1-1.4 0-3-.5-4-1.2v3.4c1.2.6 2.9 1.1 4.6 1.1 3.6 0 6.1-1.5 6.1-4.3 0-4-5.5-3.4-5.5-5.1 0-.5.6-.9 1.6-.9 1.2 0 2.6.4 3.6 1V4.9c-1-.5-2.5-.9-4-.9Z" strokeWidth={1.5} /></S>;
export const ISoft = (p: P) => <S {...p}><rect x="3.5" y="4.5" width="17" height="12" rx="2" /><path d="M8 20h8M12 16.5V20M8 8.5l-2 2 2 2M16 8.5l2 2-2 2M13 8l-2 5" /></S>;
export const IFilm = (p: P) => <S {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4" /></S>;
export const IGamepad = (p: P) => <S {...p}><path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.5l-.8 3.5a2.4 2.4 0 0 1-4.2 1L15 16H9l-1.4 2a2.4 2.4 0 0 1-4.2-1l-.8-3.5A4.5 4.5 0 0 1 7 8Z" /><path d="M8 11v3M6.5 12.5h3M16 11.2v.1M18 13v.1" /></S>;
export const IVpn = (p: P) => <S {...p}><path d="M12 3.5 5 6v6c0 4.4 3 7.4 7 8.5 4-1.1 7-4.1 7-8.5V6Z" /><circle cx="12" cy="10.5" r="2" /><path d="M12 12.5V16" /></S>;
export const IAi = (p: P) => <S {...p}><circle cx="12" cy="12" r="2.2" /><circle cx="5" cy="6" r="1.6" /><circle cx="19" cy="6" r="1.6" /><circle cx="5" cy="18" r="1.6" /><circle cx="19" cy="18" r="1.6" /><path d="m6.4 7 3.8 3.4M17.6 7l-3.8 3.4M6.4 17l3.8-3.4M17.6 17l-3.8-3.4" /></S>;
