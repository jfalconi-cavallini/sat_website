"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import ChatQuestionCard, { type QuestionData } from "./ChatQuestionCard";

type Message = {
  id: string;
  role: "user" | "bot";
  text: string;
  question?: QuestionData;
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "init", role: "bot", text: "Hi! I'm your SAT AI Tutor. Ask me anything about math, reading, or writing!" },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<unknown>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleQuestionChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setCurrentQuestion(customEvent.detail);
    };

    window.addEventListener("sat-question-change", handleQuestionChange);
    return () => {
      window.removeEventListener("sat-question-change", handleQuestionChange);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: inputValue.trim(),
    };

    const newHistory = [...messages, userMsg];

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      // UPDATED PORT TO 5051
      const res = await fetch("http://localhost:5051/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMsg.text,
          history: messages,
          context: currentQuestion // include active question data
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to fetch response");
      }

      const data = await res.json();
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        text: data.response || "Sorry, I couldn't understand that.",
        question: data.question // Store optional question payload
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "bot",
        text: "Sorry, I'm having trouble connecting to the server. Please try again later.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 h-[500px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-200">
          {/* Header */}
          <div className="p-4 bg-indigo-600 flex justify-between items-center text-white">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              AI Tutor
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-indigo-700 p-1 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm prose prose-sm prose-p:my-1 max-w-none ${msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-none prose-invert"
                    : "bg-slate-800 text-slate-200 rounded-bl-none prose-headings:text-slate-200 prose-strong:text-slate-200"
                    }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                      a: ({ node, ...props }) => <a className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                  {/* Interactive Question Card */}
                  {msg.question && <ChatQuestionCard question={msg.question} />}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 p-3 rounded-lg rounded-bl-none">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-slate-900">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about SAT math..."
                className="flex-1 bg-slate-800 text-white border-none rounded-lg focus:ring-2 focus:ring-indigo-500 px-3 py-2 text-sm placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-105 ${isOpen ? "bg-slate-700 rotate-90" : "bg-indigo-600 hover:bg-indigo-700"
          } text-white`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </div>
  );
}
