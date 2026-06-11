import { describe, expect, it } from "vitest";
import {
  MAX_THREADS,
  type Thread,
  addThread,
  appendDelta,
  appendError,
  appendUser,
  attachSources,
  closeThread,
  ensureAssistant,
  finishStream,
  launchThreads,
  setDraft,
  setSession,
  titleFor,
} from "./threads";

const SOURCES = { citations: [], disclaimer: "Not advice.", humanEscalationRequired: false };

function bareThread(id: string, n: number): Thread {
  return { id, title: `Thread ${n}`, titleLocked: false, draft: "", busy: false, sessionId: null, msgs: [] };
}

describe("titleFor", () => {
  it("maps known topics (prototype keyword order)", () => {
    expect(titleFor("What can I afford on $120k income?")).toBe("Affordability");
    expect(titleFor("What are rates today?")).toBe("Rates today");
    expect(titleFor("minimum down payment for a condo")).toBe("Down payment");
    expect(titleFor("Should I refinance?")).toBe("Refinance");
    expect(titleFor("Do I qualify for an FHA program?")).toBe("Affordability"); // "qualify" wins by order
    expect(titleFor("first-time buyer credit options")).toBe("Programs");
  });
  it("falls back to the truncated question", () => {
    expect(titleFor("Tell me about HOA fees")).toBe("Tell me about HOA fees");
    expect(titleFor("Can you explain how escrow accounts actually work")).toBe("Can you explain how escr…");
  });
});

describe("launch / add / close", () => {
  it("launchThreads creates one busy thread holding the user message", () => {
    const ts = launchThreads("t1", "m1", "What are rates today?");
    expect(ts).toHaveLength(1);
    expect(ts[0].busy).toBe(true);
    expect(ts[0].msgs).toEqual([{ id: "m1", role: "user", text: "What are rates today?" }]);
    expect(ts[0].title).toBe("Thread 1");
  });
  it("addThread appends an empty numbered thread and caps at MAX_THREADS", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = addThread(ts, "t2");
    expect(ts).toHaveLength(2);
    expect(ts[1]).toMatchObject({ id: "t2", title: "Thread 2", msgs: [], busy: false });
    for (let i = 3; i <= 7; i++) ts = addThread(ts, `t${i}`);
    expect(ts).toHaveLength(MAX_THREADS);
  });
  it("closeThread is a no-op with one thread", () => {
    const ts = launchThreads("t1", "m1", "hi");
    expect(closeThread(ts, "t1", "t1")).toEqual({ threads: ts, activeId: "t1" });
  });
  it("closing the active thread falls back to the last remaining", () => {
    const ts = [bareThread("t1", 1), bareThread("t2", 2), bareThread("t3", 3)];
    const r = closeThread(ts, "t2", "t2");
    expect(r.threads.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(r.activeId).toBe("t3");
  });
  it("closing an inactive thread keeps the active id", () => {
    const ts = [bareThread("t1", 1), bareThread("t2", 2)];
    const r = closeThread(ts, "t1", "t2");
    expect(r.activeId).toBe("t1");
  });
});

describe("streaming appliers", () => {
  it("appendUser adds the message, sets busy, clears the draft", () => {
    let ts = [{ ...bareThread("t1", 1), draft: "What are rates today?" }];
    ts = appendUser(ts, "t1", "m1", "What are rates today?");
    expect(ts[0].msgs).toEqual([{ id: "m1", role: "user", text: "What are rates today?" }]);
    expect(ts[0]).toMatchObject({ busy: true, draft: "" });
  });
  it("ensureAssistant opens one bubble, idempotently", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = ensureAssistant(ts, "t1", "m2");
    ts = ensureAssistant(ts, "t1", "m2");
    expect(ts[0].msgs).toHaveLength(2);
    expect(ts[0].msgs[1]).toMatchObject({ id: "m2", role: "assistant", text: "", done: false });
  });
  it("sources arriving before text open the bubble and later deltas fill the SAME bubble", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = attachSources(ts, "t1", "m2", SOURCES);
    ts = ensureAssistant(ts, "t1", "m2");
    ts = appendDelta(ts, "t1", "m2", "Hello");
    ts = appendDelta(ts, "t1", "m2", " there");
    expect(ts[0].msgs).toHaveLength(2);
    expect(ts[0].msgs[1]).toMatchObject({ role: "assistant", text: "Hello there", sources: SOURCES });
  });
  it("finishStream marks done, clears busy, and locks the title from the first user message once", () => {
    let ts = launchThreads("t1", "m1", "Should I refinance?");
    ts = ensureAssistant(ts, "t1", "m2");
    ts = appendDelta(ts, "t1", "m2", "Yes.");
    ts = finishStream(ts, "t1", "m2");
    expect(ts[0]).toMatchObject({ busy: false, title: "Refinance", titleLocked: true });
    ts = appendUser(ts, "t1", "m3", "What are rates today?");
    ts = ensureAssistant(ts, "t1", "m4");
    ts = finishStream(ts, "t1", "m4");
    expect(ts[0].title).toBe("Refinance"); // locked — no retitle
  });
  it("appendError clears busy and appends an error turn", () => {
    let ts = launchThreads("t1", "m1", "hi");
    ts = appendError(ts, "t1", "Sorry — try again.");
    expect(ts[0].busy).toBe(false);
    expect(ts[0].msgs[1]).toMatchObject({ role: "error", text: "Sorry — try again." });
  });
  it("setSession and setDraft update only the targeted thread", () => {
    let ts = [bareThread("t1", 1), bareThread("t2", 2)];
    ts = setSession(ts, "t2", "sess-9");
    ts = setDraft(ts, "t1", "typing…");
    expect(ts[0]).toMatchObject({ sessionId: null, draft: "typing…" });
    expect(ts[1]).toMatchObject({ sessionId: "sess-9", draft: "" });
  });
});
