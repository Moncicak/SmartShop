"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingCart, Calendar, BarChart2, MessageSquare, LogOut, Loader2, Settings } from "lucide-react";
import { authApi, listsApi, scheduleApi, ordersApi, rohlikMcpApi } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  revolut_connected: boolean;
}

interface DashboardStats {
  listCount: number;
  itemCount: number;
  slotCount: number;
  homeDays: number[]; // distinct weekday indexes (0=Po … 6=Ne) with a home slot
  monthSpend: number; // total of this month's orders
  monthOrders: number;
  rohlikConnected: boolean;
}

const DAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function pluralItems(n: number) {
  return n === 1 ? "položka" : n >= 2 && n <= 4 ? "položky" : "položek";
}

function pluralDays(n: number) {
  return n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní";
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    authApi.me()
      .then((res) => setUser(res.data))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));

    // Load real summary data for the status cards (best-effort).
    Promise.all([
      listsApi.getAll(),
      scheduleApi.getAll(),
      ordersApi.getAll(),
      rohlikMcpApi.getStatus().catch(() => ({ data: { connected: false } })),
    ])
      .then(([listsRes, scheduleRes, ordersRes, rohlikRes]) => {
        const lists = listsRes.data as { item_count: number }[];
        const slots = scheduleRes.data as { is_home: boolean; day_of_week: number }[];
        const orders = ordersRes.data as { total_amount: number | null; created_at: string }[];
        const rohlikConnected = Boolean((rohlikRes.data as { connected?: boolean })?.connected);
        const homeDays = [...new Set(slots.filter((s) => s.is_home).map((s) => s.day_of_week))].sort(
          (a, b) => a - b
        );
        const now = new Date();
        const thisMonth = orders.filter((o) => {
          const d = new Date(o.created_at);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        setStats({
          listCount: lists.length,
          itemCount: lists.reduce((sum, l) => sum + (l.item_count || 0), 0),
          slotCount: slots.length,
          homeDays,
          monthSpend: thisMonth.reduce((sum, o) => sum + (o.total_amount || 0), 0),
          monthOrders: thisMonth.length,
          rohlikConnected,
        });
      })
      .catch(() => setStats(null));
  }, [router]);

  function logout() {
    localStorage.clear();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">SmartCart</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:block">
              {user?.full_name || user?.email}
            </span>
            <Link
              href="/dashboard/settings"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              title="Nastavení"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Odhlásit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Ahoj{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-gray-500 mt-1">Tvůj AI nákupní asistent je připraven.</p>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Nákupní seznamy",
              value: stats ? (stats.listCount > 0 ? String(stats.listCount) : "—") : "…",
              sub: stats && stats.listCount > 0
                ? `${stats.itemCount} ${pluralItems(stats.itemCount)} celkem`
                : "Žádné seznamy",
              color: "blue",
            },
            {
              label: "Rohlík",
              value: stats ? (stats.rohlikConnected ? "Připojeno" : "Nepřipojeno") : "…",
              sub: stats?.rohlikConnected ? "Účet připojen" : "Připoj v nastavení",
              color: stats?.rohlikConnected ? "green" : "gray",
            },
            {
              label: "Rozvrh",
              value: stats
                ? (stats.homeDays.length > 0
                    ? `${stats.homeDays.length} ${pluralDays(stats.homeDays.length)}`
                    : "—")
                : "…",
              sub: stats
                ? (stats.homeDays.length > 0
                    ? `Doma: ${stats.homeDays.map((d) => DAYS_SHORT[d]).join(" · ")}`
                    : stats.slotCount > 0
                    ? "Žádný den doma"
                    : "Sloty nenastaveny")
                : "",
              color: "purple",
            },
            {
              label: "Tento měsíc",
              value: stats ? `${Math.round(stats.monthSpend)} Kč` : "…",
              sub: stats && stats.monthOrders > 0
                ? `${stats.monthOrders} ${stats.monthOrders === 1 ? "objednávka" : stats.monthOrders <= 4 ? "objednávky" : "objednávek"}`
                : "Zatím žádné objednávky",
              color: "orange",
            },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{card.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Feature tiles */}
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              icon: ShoppingCart,
              title: "Nákupní seznamy",
              desc: "Spravuj týdenní a měsíční nákupy. Agent automaticky vybere nejlepší produkty a čas objednávky.",
              href: "/dashboard/lists",
              badge: "Fáze 3",
            },
            {
              icon: Calendar,
              title: "Můj rozvrh",
              desc: "Nastav, kdy jsi doma — agent naplánuje doručení tak, aby ti to sedělo.",
              href: "/dashboard/schedule",
              badge: "Fáze 4",
            },
            {
              icon: MessageSquare,
              title: "Chat s agentem",
              desc: "Řekni agentovi co potřebuješ — přidá ingredience, navrhne nákup nebo upraví seznam.",
              href: "/dashboard/chat",
              badge: "Fáze 4",
            },
            {
              icon: BarChart2,
              title: "Přehledy útrat",
              desc: "Sleduj kolik utrácíš, kde šetříš díky slevám a jak se vyvíjí tvůj nákupní košík.",
              href: "/dashboard/stats",
              badge: "Fáze 6",
            },
          ].map((tile) => (
            <Link
              key={tile.title}
              href={tile.href}
              className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                  <tile.icon className="w-5 h-5 text-blue-600 group-hover:text-white transition-colors" />
                </div>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {tile.badge}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{tile.title}</h3>
              <p className="text-sm text-gray-500">{tile.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
