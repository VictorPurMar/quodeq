import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDashboard, dashboardViewForPage } from "./useDashboard";
import { ApiProvider } from "../../../api/ApiContext.jsx";
import { DASHBOARD_VIEW } from "../../../vocab/dashboardView.js";
import { NAV_TAB } from "../../../vocab/navTab.js";

// The dashboard view: which shape the hook asks for, how it keys it, and
// that the two shapes never stand in for each other.

function makeFakeApi() {
  return {
    getDashboard: vi.fn(async (project, run) => ({
      project, run: run || "latest", trend: [], dimensions: [],
      selectedRun: { runId: "r1", dateLabel: "2026-05-01" },
    })),
    sharedGetDashboard: vi.fn(),
    getProjectScores: vi.fn(async () => ({ accumulated: { score: 90 }, trend: [], availableRuns: [] })),
    sharedGetProjectScores: vi.fn(),
    sharedGetProjectInfo: vi.fn(),
  };
}

// One client for the whole test: a wrapper that builds a new one per render
// would remount the hook and never hand it a previous query.
function makeWrapper(fakeApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={client}><ApiProvider value={fakeApi}>{children}</ApiProvider></QueryClientProvider>
  );
}

describe("useDashboard view", () => {
  it("keys and fetches by view", async () => {
    const fakeApi = makeFakeApi();
    const { result } = renderHook(
      () => useDashboard({ selectedProject: "p1", selectedRun: null, view: DASHBOARD_VIEW.OVERVIEW }),
      { wrapper: makeWrapper(fakeApi) },
    );
    await waitFor(() => expect(result.current.dashboard).not.toBeNull());
    expect(fakeApi.getDashboard).toHaveBeenCalledWith("p1", null, "overview");
  });

  it("does not reuse the overview payload as a placeholder for the full view", async () => {
    // Overview -> run page: the slim overview entry has no bodies, so
    // showing it while the full one loads would flash an empty worst-files
    // table. Fall through to a real loading state instead.
    const fakeApi = makeFakeApi();
    const { result, rerender } = renderHook(
      ({ view }) => useDashboard({ selectedProject: "p1", selectedRun: null, view, keepPlaceholder: true }),
      { wrapper: makeWrapper(fakeApi), initialProps: { view: DASHBOARD_VIEW.OVERVIEW } },
    );
    await waitFor(() => expect(result.current.dashboard).not.toBeNull());

    rerender({ view: DASHBOARD_VIEW.FULL });
    expect(result.current.dashboard).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.dashboard).not.toBeNull());
    expect(fakeApi.getDashboard).toHaveBeenCalledWith("p1", null, "full");
  });

  it("dashboardViewForPage is full only on run pages", () => {
    expect(dashboardViewForPage(NAV_TAB.RUN)).toBe(DASHBOARD_VIEW.FULL);
    expect(dashboardViewForPage(NAV_TAB.HISTORY_RUN)).toBe(DASHBOARD_VIEW.FULL);
    expect(dashboardViewForPage(NAV_TAB.OVERVIEW)).toBe(DASHBOARD_VIEW.OVERVIEW);
    expect(dashboardViewForPage(NAV_TAB.HISTORY)).toBe(DASHBOARD_VIEW.OVERVIEW);
  });
});
