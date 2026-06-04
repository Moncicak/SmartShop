"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Check, X, ShoppingBag, AlertCircle, Link2, Eye, EyeOff,
} from "lucide-react";
import { rohlikMcpApi } from "@/lib/api";

interface RohlikStatus {
  connected: boolean;
  email: string | null;
  tools_count: number | null;
  error: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RohlikStatus | null>(null);

  async function loadStatus() {
    const { data } = await rohlikMcpApi.getStatus();
    setStatus(data);
  }

  useEffect(() => {
    loadStatus().catch(() => setStatus({ connected: false, email: null, tools_count: null, error: null }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-gray-900">Nastavení</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {status === null ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <RohlikCard status={status} onChange={loadStatus} />
        )}
      </main>
    </div>
  );
}

function RohlikCard({ status, onChange }: { status: RohlikStatus; onChange: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await rohlikMcpApi.connect(email.trim(), password);
      setEmail("");
      setPassword("");
      await onChange();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Připojení k Rohlíku selhalo.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Odpojit Rohlík účet? Uložené přihlašovací údaje se smažou.")) return;
    setBusy(true);
    try {
      await rohlikMcpApi.disconnect();
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center gap-3 border-b border-gray-100">
        <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-4 h-4 text-orange-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900">Rohlík účet</p>
          <p className="text-xs text-gray-400">Přihlášení k Rohlíku pro sestavení a objednání košíku</p>
        </div>
        {status.connected ? (
          <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full font-medium flex items-center gap-1 flex-shrink-0">
            <Check className="w-3 h-3" /> Připojeno
          </span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-medium flex-shrink-0">
            Nepřipojeno
          </span>
        )}
      </div>

      <div className="p-4">
        {status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Link2 className="w-4 h-4 text-gray-400" />
              Přihlášen jako <span className="font-medium">{status.email}</span>
            </div>
            <button
              onClick={disconnect}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              Odpojit účet
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email k Rohlíku"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                placeholder="Heslo"
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={connect}
              disabled={busy || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {busy ? "Ověřuji přihlášení…" : "Připojit účet"}
            </button>

            <p className="text-xs text-gray-400 leading-relaxed">
              Heslo se ukládá zašifrovaně a používá se jen k přihlášení k Rohlíku přes oficiální
              MCP server. Potřebuješ existující Rohlík účet — účet ti nezakládáme.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
