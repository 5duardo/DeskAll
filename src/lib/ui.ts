/** Shared Tailwind class fragments */
export const btn =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 cursor-pointer transition duration-150 enabled:hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45";

export const btnPrimary = `${btn} bg-accent text-white hover:bg-accent-deep dark:text-zinc-900`;

export const btnGhost = `${btn} border border-line bg-surface text-ink`;

export const btnDanger = `${btn} border border-danger/30 bg-danger/10 text-danger`;

export const searchBox =
  "flex max-w-[420px] flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:shadow-none";

/** Scrollable area without visible scrollbar */
export const hideScrollbar =
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export const toast =
  "fixed bottom-5 left-1/2 z-[100] max-w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 animate-rise-fast rounded-2xl bg-ink px-4 py-2.5 text-sm leading-snug text-paper shadow-desk line-clamp-3";
