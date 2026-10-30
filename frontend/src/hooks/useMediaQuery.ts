import { useSyncExternalStore } from "react";

/** Must match the breakpoint in account.css that moves the account nav into the sidebar. */
export const SIDEBAR_HEADER_QUERY = "(max-width: 900px)";

/** False where matchMedia is unavailable (tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
}
