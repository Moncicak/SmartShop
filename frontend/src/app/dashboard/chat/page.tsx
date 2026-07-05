"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Send, Loader2, Sparkles, Trash2, Wrench,
} from "lucide-react";
import { chatApi } from "@/lib/api";

interface ChatMsg {
  id: string;
  role: "user" | "agent";
  content: string;
  tools_used?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  get_shopping_overview: "přehled seznamů",
  add_items: "přidání položek",
  remove_item: "odebrání položky",
  search_rohlik: "hledání na Rohlíku",
  build_cart: "sestavení košíku",
  get_delivery_slots: "termíny doručení",
  push_cart_to_rohlik: "košík na Rohlík",
};

const SUGGESTIONS = [
  "Co mám teď na nákupním seznamu?",
  "Přidej mi ingredience na svíčkovou pro 4 lidi",
  "Kolik bude stát můj nákup?",
  "Kdy mi to můžou doručit?",
];

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await chatApi.getHistory();
        setMessages(data);
      } catch {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: msg },
    ]);
    try {
      const { data } = await chatApi.send(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}-a`,
          role: "agent",
          content: data.reply,
          tools_used: data.tools_used,
        },
      ]);
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Něco se pokazilo — zkus to znovu.";
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-e`, role: "agent", content: `⚠️ ${detail}` },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function clearChat() {
    if (!confirm("Smazat celou historii konverzace?")) return;
    await chatApi.clear();
    setMessages([]);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-tight">SmartCart agent</h1>
              <p className="text-xs text-gray-400 leading-tight">AI nákupní asistent</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
              title="Smazat konverzaci"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-28">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 text-violet-600" />
            </div>
            <p className="font-semibold text-gray-800">Ahoj! Jsem tvůj nákupní asistent.</p>
            <p className="text-sm text-gray-500 mt-1 mb-6">
              Umím spravovat seznamy, hledat na Rohlíku, spočítat nákup i naplnit košík.
            </p>
            <div className="flex flex-col gap-2 max-w-sm mx-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-sm text-left px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50 text-gray-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${m.role === "user" ? "order-1" : ""}`}>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-violet-600 text-white rounded-br-md"
                        : "bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === "agent" && m.tools_used && m.tools_used.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 px-1">
                      {[...new Set(m.tools_used)].map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded"
                        >
                          <Wrench className="w-2.5 h-2.5" />
                          {TOOL_LABELS[t] ?? t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md shadow-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                  <span className="text-sm text-gray-400">Přemýšlím a pracuju…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Napiš, co potřebuješ nakoupit…"
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:bg-gray-50"
            autoFocus
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || sending}
            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
