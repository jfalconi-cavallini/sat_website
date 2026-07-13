import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake standing in for Upstash Redis, so this test exercises the
// real read-modify-write dedup/sort/cap logic without needing a live Redis
// instance or network access.
const store = new Map<string, unknown>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
  },
}));

// Rate limiting itself is Upstash's well-tested code, not mine - bypass it
// here so this test is about the leaderboard logic, not re-verifying their
// sliding-window implementation.
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return { success: true, limit: 5, remaining: 4, reset: Date.now() + 60_000 };
    }
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.1" })),
}));

const { POST, GET } = await import("./route");
const { NextRequest } = await import("next/server");

const DATE = "2026-07-13";

function makeSubmission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    date: DATE,
    displayName: "Alex",
    grade: "11",
    score: 8,
    percent: 80,
    elapsedSeconds: 300,
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(query: string) {
  return new NextRequest(`http://localhost/api/leaderboard?${query}`);
}

beforeEach(() => {
  store.clear();
});

describe("POST /api/leaderboard", () => {
  it("accepts a valid submission and persists it", async () => {
    const res = await POST(postRequest(makeSubmission()));
    expect(res.status).toBe(200);

    const listRes = await GET(getRequest(`date=${DATE}`));
    const entries = await listRes.json();
    expect(entries).toHaveLength(1);
    expect(entries[0].displayName).toBe("Alex");
  });

  it("rejects an invalid display name", async () => {
    const res = await POST(postRequest(makeSubmission({ displayName: "a" })));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range score", async () => {
    const res = await POST(postRequest(makeSubmission({ score: 11 })));
    expect(res.status).toBe(400);
  });

  it("replaces an existing entry when the new score is better", async () => {
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 5, elapsedSeconds: 400 })));
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 9, elapsedSeconds: 400 })));

    const entries = await (await GET(getRequest(`date=${DATE}`))).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].score).toBe(9);
  });

  it("does NOT replace an existing entry when the new score is worse", async () => {
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 9, elapsedSeconds: 400 })));
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 5, elapsedSeconds: 400 })));

    const entries = await (await GET(getRequest(`date=${DATE}`))).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].score).toBe(9);
  });

  it("replaces on a same-score but faster time", async () => {
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 8, elapsedSeconds: 400 })));
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 8, elapsedSeconds: 200 })));

    const entries = await (await GET(getRequest(`date=${DATE}`))).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].elapsedSeconds).toBe(200);
  });

  it("name matching for dedup is case-insensitive", async () => {
    await POST(postRequest(makeSubmission({ displayName: "Sam", score: 5 })));
    await POST(postRequest(makeSubmission({ displayName: "sam", score: 9 })));

    const entries = await (await GET(getRequest(`date=${DATE}`))).json();
    expect(entries).toHaveLength(1);
  });
});

describe("GET /api/leaderboard", () => {
  it("sorts by score desc, then elapsed time asc", async () => {
    await POST(postRequest(makeSubmission({ displayName: "Low", score: 5, elapsedSeconds: 100 })));
    await POST(postRequest(makeSubmission({ displayName: "HighSlow", score: 9, elapsedSeconds: 500 })));
    await POST(postRequest(makeSubmission({ displayName: "HighFast", score: 9, elapsedSeconds: 100 })));

    const entries = await (await GET(getRequest(`date=${DATE}`))).json();
    expect(entries.map((e: { displayName: string }) => e.displayName)).toEqual([
      "HighFast",
      "HighSlow",
      "Low",
    ]);
  });

  it("filters by grade", async () => {
    await POST(postRequest(makeSubmission({ displayName: "NinthGrader", grade: "9" })));
    await POST(postRequest(makeSubmission({ displayName: "EleventhGrader", grade: "11" })));

    const entries = await (await GET(getRequest(`date=${DATE}&grade=9`))).json();
    expect(entries).toHaveLength(1);
    expect(entries[0].displayName).toBe("NinthGrader");
  });

  it("returns 400 for a missing date", async () => {
    const res = await GET(getRequest(""));
    expect(res.status).toBe(400);
  });

  it("returns an empty array for a date with no entries", async () => {
    const entries = await (await GET(getRequest(`date=${DATE}`))).json();
    expect(entries).toEqual([]);
  });
});
