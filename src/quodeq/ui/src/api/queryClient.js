/**
 * Singleton QueryClient for the dashboard.
 *
 * Defaults:
 * - staleTime: 30s — most server data is fresh enough on reload.
 * - gcTime: 5min (library default) — kept long enough for screen-back navigation.
 * - retry: 1 — fail fast on real errors.
 * - refetchOnWindowFocus / refetchOnReconnect: true — natural recovery.
 *
 * Per-query overrides live at each useQuery call site (refetchInterval
 * for polling-driven sources; staleTime: Infinity when SSE owns updates).
 *
 * focusManager is driven by utils/appVisibility.js rather than the library's
 * own listener. No query sets refetchIntervalInBackground, so reporting the
 * window as unfocused is what stops every refetchInterval while the app is
 * hidden — including the health poll, which resumes on its next tick.
 */
import { QueryClient, focusManager } from "@tanstack/react-query";
import { isHidden, subscribeVisibility } from "../utils/appVisibility.js";

focusManager.setEventListener((handleFocus) => {
  handleFocus(!isHidden());
  return subscribeVisibility(() => handleFocus(!isHidden()));
});

// gcTime: 5min (library default) — kept long enough for screen-back
// navigation (see docstring above).
const GC_TIME_MINUTES = 5;
const MINUTE_MS = 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: GC_TIME_MINUTES * MINUTE_MS,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
