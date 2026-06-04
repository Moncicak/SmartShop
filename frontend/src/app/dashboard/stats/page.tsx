"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, BarChart2, Wallet, Tag, ShoppingBag, TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { ordersApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  product_name: string;
  total_price: number;
}

interface Order {
  total_amount: number | null;
  discount_saved: number;
  created_at: string;
  items: OrderItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS_CS = ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"];

function lastNMonths(n: number) {
  const now = new Date();
  const arr: { key: string; label: string; spend: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: `${MONTHS_CS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      spend: 0,
    });
  }
  return arr;
}

function fmtKc(n: number) {
  return `${n.toLocaleString("cs-CZ", { maximumFractionDigits: 0 })} Kč`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    ordersApi.getAll()
      .then((res) => setOrders(res.data))
      .catch(() => setOrders([]));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" />
            <h1 className="font-bold text-gray-900">Přehledy útrat</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {orders === null ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-gray-500">Zatím není co zobrazit</p>
            <p className="text-sm mt-1">Až objednáš první nákup, uvidíš tady svoje útraty.</p>
          </div>
        ) : (
          <StatsContent orders={orders} />
        )}
      </main>
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

function StatsContent({ orders }: { orders: Order[] }) {
  const totalSpend = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalSaved = orders.reduce((s, o) => s + (o.discount_saved || 0), 0);
  const orderCount = orders.length;
  const avgOrder = orderCount > 0 ? totalSpend / orderCount : 0;

  // Monthly spend (last 6 months)
  const months = lastNMonths(6);
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const o of orders) {
    const d = new Date(o.created_at);
    const m = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.spend += o.total_amount || 0;
  }
  const chartData = months.map((m) => ({ label: m.label, spend: Math.round(m.spend) }));
  const maxSpend = Math.max(...chartData.map((d) => d.spend), 0);

  // Top products by total spend
  const productTotals = new Map<string, number>();
  for (const o of orders) {
    for (const it of o.items) {
      productTotals.set(it.product_name, (productTotals.get(it.product_name) || 0) + it.total_price);
    }
  }
  const topProducts = [...productTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topMax = topProducts.length > 0 ? topProducts[0][1] : 1;

  const cards = [
    { label: "Útrata celkem", value: fmtKc(totalSpend), icon: Wallet, color: "text-blue-600 bg-blue-100" },
    { label: "Ušetřeno na slevách", value: fmtKc(totalSaved), icon: Tag, color: "text-orange-600 bg-orange-100" },
    { label: "Objednávek", value: String(orderCount), icon: ShoppingBag, color: "text-green-600 bg-green-100" },
    { label: "Průměrná objednávka", value: fmtKc(avgOrder), icon: TrendingUp, color: "text-violet-600 bg-violet-100" },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${c.color}`}>
              <c.icon className="w-4 h-4" />
            </div>
            <p className="text-lg font-bold text-gray-900 leading-tight">{c.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Monthly spend chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Útrata po měsících</h2>
        {maxSpend === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Za posledních 6 měsíců žádné objednávky.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                cursor={{ fill: "#f8fafc" }}
                formatter={(v: number) => [fmtKc(v), "Útrata"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
              />
              <Bar dataKey="spend" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.spend === maxSpend ? "#2563eb" : "#93c5fd"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Top products */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Nejnákladnější produkty</h2>
        <div className="space-y-2.5">
          {topProducts.map(([name, total]) => (
            <div key={name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700 truncate pr-2">{name}</span>
                <span className="text-sm font-medium text-gray-900 flex-shrink-0">{fmtKc(total)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400"
                  style={{ width: `${Math.max((total / topMax) * 100, 4)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
