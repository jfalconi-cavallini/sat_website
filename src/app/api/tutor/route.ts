import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import OpenAI from "openai";
import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";
import { loadEnglishRaw } from "@/lib/english";
import { loadMathRaw } from "@/lib/math";
import { SYSTEM_PROMPT, formatQuestionContext } from "@/lib/tutor-prompt";

const MODEL = process.env.TUTOR_MODEL || "gpt-4o-mini";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 12; // ~6 turns of context, keeps token cost bounded

// Free, no-login, unauthenticated AI endpoints are a textbook cost-abuse
// target. Reuses the same Redis instance as the leaderboard's rate limiter,
// under a different prefix/window suited to LLM call cost rather than a
// leaderboard submission.
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"),
  prefix: "tutor-ratelimit",
});

type HistoryMessage = { role: "user" | "bot"; text: string };

async function getClientIP(): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIP = headersList.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = headersList.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

async function findQuestionById(id: string) {
  const [english, math] = await Promise.all([loadEnglishRaw(), loadMathRaw()]);
  return english.find((q) => q.id === id) ?? math.find((q) => q.id === id) ?? null;
}

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set");
    return NextResponse.json(
      { error: "The AI tutor isn't configured yet. Set OPENAI_API_KEY to enable it." },
      { status: 500 }
    );
  }

  const clientIP = await getClientIP();
  const rateLimitResult = await ratelimit.limit(clientIP);
  if (!rateLimitResult.success) {
    const resetInMinutes = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 60000));
    return NextResponse.json(
      { error: `You've hit the tutor's usage limit. Try again in ${resetInMinutes} minutes.` },
      { status: 429, headers: { "Retry-After": String(resetInMinutes * 60) } }
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 20_000) {
      return NextResponse.json({ error: "Request payload too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { message, history, contextQuestionId } = (body ?? {}) as {
    message?: unknown;
    history?: unknown;
    contextQuestionId?: unknown;
  };

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  const safeHistory: HistoryMessage[] = Array.isArray(history)
    ? history
        .filter(
          (m): m is HistoryMessage =>
            !!m &&
            typeof m === "object" &&
            (m.role === "user" || m.role === "bot") &&
            typeof m.text === "string"
        )
        .slice(-MAX_HISTORY_MESSAGES)
    : [];

  let contextBlock: string | null = null;
  if (typeof contextQuestionId === "string" && contextQuestionId) {
    const question = await findQuestionById(contextQuestionId);
    if (question) contextBlock = formatQuestionContext(question);
  }

  const systemContent = contextBlock ? `${SYSTEM_PROMPT}\n\n${contextBlock}` : SYSTEM_PROMPT;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...safeHistory.map(
      (m): OpenAI.Chat.ChatCompletionMessageParam => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.text.slice(0, MAX_MESSAGE_LENGTH),
      })
    ),
    { role: "user", content: trimmedMessage },
  ];

  const openai = new OpenAI(); // lazy: constructing this at module load would
  // throw and break `next build` in environments without the key set yet.

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await openai.chat.completions.create({
      model: MODEL,
      messages,
      max_tokens: 600,
      temperature: 0.4,
      stream: true,
    });
  } catch (error) {
    console.error("OpenAI request failed:", error);
    return NextResponse.json(
      { error: "The tutor is having trouble responding right now. Please try again shortly." },
      { status: 502 }
    );
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        console.error("Error while streaming tutor response:", error);
        controller.enqueue(encoder.encode("\n\n_The tutor's connection dropped - please try again._"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(Math.max(0, rateLimitResult.remaining)),
    },
  });
}
