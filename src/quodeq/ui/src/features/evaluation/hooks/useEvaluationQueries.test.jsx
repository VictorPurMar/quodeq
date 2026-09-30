import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// These tests exercise the polling path, which SSE_ENABLED (read once at
// import) now turns off by default. Pin the flag before the hook is imported.
vi.hoisted(() => { import.meta.env.VITE_USE_SSE_EVENTS = "false"; });

import { mergeLiveFindings, useEvaluationQueries } from "./useEvaluationQueries.js";
import { withQueryClient } from "../../../test-utils/withQueryClient.jsx";

// The polling path (VITE_USE_SSE_EVENTS=false) fetches each dimension's eval and hands the
// rows to the live feed, which reads `principle` — a field the backend has
// never emitted. It emits `practiceId`, on the report path and on the live
// evidence path alike, so a raw spread reached the feed with no rule to show.

const REPORT_ROW = {
  practiceId: "Authenticity",
  req: "S-AUT-3",
  file: "src/quodeq/api/_assistant_helpers.py",
  line: 116,
  severity: "minor",
  title: "Path traversal via project_uuid",
  snippet: "Path(session[\"project_uuid\"])",
  reqRefs: [{ label: "CWE-22", url: "https://cwe.mitre.org/data/definitions/22.html" }],
  confidence: 25,
};

function makeApi(violations, extraDimensions = {}) {
  return {
    getEvaluation: vi.fn().mockResolvedValue({
      jobId: "job-1",
      status: "running",
      outputProject: "proj",
      outputRunId: "run-1",
      dimensions: ["security", ...Object.keys(extraDimensions)],
    }),
    getLiveFindings: vi.fn().mockResolvedValue({
      project: "proj",
      runId: "run-1",
      dimensions: { security: { state: "ready", violations }, ...extraDimensions },
    }),
  };
}

function renderQueries(api) {
  const QC = withQueryClient();
  return renderHook(() => useEvaluationQueries(api, "job-1"), { wrapper: QC });
}

describe("useEvaluationQueries findings mapping", () => {
  it("exposes the backend's practiceId as `principle`", async () => {
    const { result } = renderQueries(makeApi([REPORT_ROW]));
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(1));
    expect(result.current.liveViolations.security[0].principle).toBe("Authenticity");
  });

  it("keeps wire-only fields the canonical model does not carry", async () => {
    const { result } = renderQueries(makeApi([REPORT_ROW]));
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(1));
    expect(result.current.liveViolations.security[0].confidence).toBe(25);
  });

  it("tags each row with the dimension it was fetched for", async () => {
    const { result } = renderQueries(makeApi([REPORT_ROW]));
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(1));
    expect(result.current.liveViolations.security[0].dimension).toBe("security");
  });

  it("gives two findings on one line distinct identities", async () => {
    // The feed keys rows on `${dim}-${file}-${principle}-${line}`. With
    // principle undefined on every row, two findings raised against the same
    // line under different principles collapsed onto one React key.
    const second = { ...REPORT_ROW, practiceId: "Integrity", req: "S-INT-1" };
    const { result } = renderQueries(makeApi([REPORT_ROW, second]));
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(2));
    const principles = result.current.liveViolations.security.map((v) => v.principle);
    expect(new Set(principles).size).toBe(2);
  });

  it("survives a dimension eval that carries no violations", async () => {
    const { result } = renderQueries(makeApi(undefined));
    await waitFor(() => expect(result.current.job).not.toBeNull());
    expect(result.current.liveViolations).toEqual({});
  });

  it("asks for every job dimension in one request", async () => {
    const api = makeApi([REPORT_ROW], { usability: { state: "waiting", violations: [] } });
    const { result } = renderQueries(api);
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(1));
    expect(api.getLiveFindings).toHaveBeenCalledWith("proj", "run-1", ["security", "usability"], {});
    expect(api.getLiveFindings.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("groups two dimensions from one body and tags each row", async () => {
    const other = { ...REPORT_ROW, practiceId: "Clarity", file: "src/b.py" };
    const api = makeApi([REPORT_ROW], { usability: { state: "ready", violations: [other] } });
    const { result } = renderQueries(api);
    await waitFor(() => expect(result.current.liveViolations.usability).toHaveLength(1));
    expect(result.current.liveViolations.security[0].dimension).toBe("security");
    expect(result.current.liveViolations.usability[0].dimension).toBe("usability");
  });

  it("tolerates a body without dimensions", async () => {
    const api = makeApi([REPORT_ROW]);
    api.getLiveFindings.mockResolvedValue({});
    const { result } = renderQueries(api);
    await waitFor(() => expect(result.current.job).not.toBeNull());
    expect(result.current.liveViolations).toEqual({});
  });

  it("keeps the job's dimension order, not the body's key order", async () => {
    const other = { ...REPORT_ROW, practiceId: "Clarity", file: "src/b.py" };
    const api = makeApi([REPORT_ROW]);
    api.getEvaluation.mockResolvedValue({
      jobId: "job-1", status: "running", outputProject: "proj", outputRunId: "run-1",
      dimensions: ["usability", "security"],
    });
    // Flask's jsonify sorts keys, so the wire order is alphabetical.
    api.getLiveFindings.mockResolvedValue({ dimensions: {
      security: { state: "ready", violations: [REPORT_ROW] },
      usability: { state: "ready", violations: [other] },
    } });
    const { result } = renderQueries(api);
    await waitFor(() => expect(result.current.liveViolations.usability).toHaveLength(1));
    expect(Object.keys(result.current.liveViolations)).toEqual(["usability", "security"]);
  });

  it("keeps one grouped object while the findings response is unchanged", async () => {
    const api = makeApi([REPORT_ROW]);
    const { result, rerender } = renderQueries(api);
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(1));
    const grouped = result.current.liveViolations;
    rerender();
    // A new object every render would re-render every live subscriber.
    expect(result.current.liveViolations).toBe(grouped);
  });
});

describe("mergeLiveFindings", () => {
  const job = { dimensions: ["security", "usability"] };
  const held = [
    { ...REPORT_ROW, line: 1, dimension: "security" },
    { ...REPORT_ROW, line: 2, dimension: "security" },
  ];

  it("appends the rows past the echoed offset", () => {
    const body = { dimensions: {
      security: { state: "ready", since: 2, count: 3, violations: [{ ...REPORT_ROW, line: 3 }] },
    } };
    const merged = mergeLiveFindings(held, job, body);
    expect(merged.map((r) => r.line)).toEqual([1, 2, 3]);
    expect(merged[0]).toBe(held[0]);
    expect(merged[2].principle).toBe("Authenticity");
    expect(merged[2].dimension).toBe("security");
  });

  it("replaces the held rows when the server reset the offset", () => {
    const body = { dimensions: {
      security: { state: "ready", since: 0, count: 1, violations: [{ ...REPORT_ROW, line: 9 }] },
    } };
    expect(mergeLiveFindings(held, job, body).map((r) => r.line)).toEqual([9]);
  });

  it("keeps the held rows on an empty delta", () => {
    const body = { dimensions: { security: { state: "ready", since: 2, count: 2, violations: [] } } };
    expect(mergeLiveFindings(held, job, body)).toEqual(held);
  });

  it("treats a body without offsets as a full list", () => {
    const body = { dimensions: { security: { state: "ready", violations: [{ ...REPORT_ROW, line: 7 }] } } };
    expect(mergeLiveFindings(held, job, body).map((r) => r.line)).toEqual([7]);
  });
});

describe("polling with since", () => {
  it("asks for rows past what it holds on the next poll and appends them", async () => {
    const api = makeApi([REPORT_ROW]);
    api.getLiveFindings.mockResolvedValueOnce({ dimensions: {
      security: { state: "ready", since: 0, count: 1, violations: [REPORT_ROW] },
    } });
    api.getLiveFindings.mockResolvedValue({ dimensions: {
      security: { state: "ready", since: 1, count: 2, violations: [{ ...REPORT_ROW, line: 200 }] },
    } });
    const { result } = renderQueries(api);
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(1));
    expect(api.getLiveFindings).toHaveBeenCalledWith("proj", "run-1", ["security"], {});
    await waitFor(() => expect(result.current.liveViolations.security).toHaveLength(2), { timeout: 4000 });
    expect(api.getLiveFindings).toHaveBeenLastCalledWith("proj", "run-1", ["security"], { security: 1 });
    expect(result.current.liveViolations.security.map((r) => r.line)).toEqual([116, 200]);
  });
});
