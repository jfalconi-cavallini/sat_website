import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

let rateLimitShouldSucceed = true;
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return {
        success: rateLimitShouldSucceed,
        limit: 20,
        remaining: rateLimitShouldSucceed ? 19 : 0,
        reset: Date.now() + 60_000,
      };
    }
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.1" })),
}));

// Fake streamed completion: three chunks spelling out a short reply.
async function* fakeChunks() {
  yield { choices: [{ delta: { content: "Let's " } }] };
  yield { choices: [{ delta: { content: "think " } }] };
  yield { choices: [{ delta: { content: "step by step." } }] };
}

type CreateParams = { messages: { role: string; content: string }[] };
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature needed so createMock.mock.calls is typed, body doesn't need the value
const createMock = vi.fn(async (params: CreateParams) => fakeChunks());
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

vi.mock("@/lib/english", () => ({
  loadEnglishRaw: vi.fn(async () => [
    {
      id: "e-1",
      domain_desc: "Craft and Structure",
      skill_desc: "Words in Context",
      difficulty: "M",
      stem: "What does 'ubiquitous' most nearly mean in the passage?",
      choices: [
        { key: "A", text: "Rare" },
        { key: "B", text: "Everywhere" },
      ],
      correct_letters: "B",
      rationale: "The passage uses ubiquitous to mean widespread.",
    },
  ]),
}));
vi.mock("@/lib/math", () => ({
  loadMathRaw: vi.fn(async () => []),
}));

const { POST } = await import("./route");
const { NextRequest } = await import("next/server");

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readStreamText(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

beforeEach(() => {
  store.clear();
  rateLimitShouldSucceed = true;
  createMock.mockClear();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
});

describe("POST /api/tutor", () => {
  it("returns 500 with a clear message when OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await POST(postRequest({ message: "hi" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/isn't configured/i);
  });

  it("rejects a missing message", async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
  });

  it("streams the model's response back as plain text", async () => {
    const res = await POST(postRequest({ message: "Can you help me with this question?" }));
    expect(res.status).toBe(200);
    const text = await readStreamText(res);
    expect(text).toBe("Let's think step by step.");
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    rateLimitShouldSucceed = false;
    const res = await POST(postRequest({ message: "hi" }));
    expect(res.status).toBe(429);
  });

  it("grounds the prompt in the looked-up question when contextQuestionId is provided", async () => {
    await POST(postRequest({ message: "Why is B correct?", contextQuestionId: "e-1" }));
    const args = createMock.mock.calls.at(-1)?.[0];
    const systemMessage = args?.messages.find((m) => m.role === "system");
    expect(systemMessage?.content).toContain("ubiquitous");
    expect(systemMessage?.content).toContain("widespread");
  });

  it("ignores an unknown contextQuestionId instead of erroring", async () => {
    const res = await POST(postRequest({ message: "hi", contextQuestionId: "does-not-exist" }));
    expect(res.status).toBe(200);
  });

  it("caps history to the most recent messages", async () => {
    const longHistory = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "bot",
      text: `message ${i}`,
    }));
    await POST(postRequest({ message: "hi", history: longHistory }));
    const args = createMock.mock.calls.at(-1)?.[0];
    // system + at most 12 history + the new user message
    expect(args?.messages.length).toBeLessThanOrEqual(14);
  });
});
