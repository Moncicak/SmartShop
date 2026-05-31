"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Calendar, BarChart2, MessageSquare, LogOut, Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  revolut_connected: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.me()
      .then((res) => setUser(res.data))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
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
            { label: "Nákupní seznam", value: "—", sub: "Žádné položky", color: "blue" },
            { label: "Revolut", value: user?.revolut_connected ? "Připojen" : "Nepřipojen", sub: "Platební účet", color: user?.revolut_connected ? "green" : "gray" },
            { label: "Rozvrh", value: "—", sub: "Sloty nenastaveny", color: "purple" },
            { label: "Tento měsíc", value: "0 Kč", sub: "Celková útrata", color: "orange" },
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
            <div
              key={tile.title}
              className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
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
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
