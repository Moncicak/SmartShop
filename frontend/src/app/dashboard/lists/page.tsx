"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Minus, Trash2, Search, ShoppingCart,
  Check, Loader2, X, Package, ListChecks, ChevronRight,
  CalendarClock, ShoppingBag, Receipt, AlertCircle, Truck,
} from "lucide-react";
import { listsApi, rohlikApi, scheduleApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListItem {
  id: string;
  list_id: string;
  generic_name: string | null;
  rohlik_product_id: string | null;
  rohlik_product_name: string | null;
  rohlik_image_url: string | null;
  quantity: number;
  unit: string | null;
  notes: string | null;
  is_checked: boolean;
}

interface ShoppingList {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  is_active: boolean;
  last_ordered_at: string | null;
  item_count: number;
  items: ListItem[];
}

interface ShoppingItem extends ListItem {
  source_list_id: string;
  source_list_name: string;
  source_frequency: string;
}

interface RohlikProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  image_url: string | null;
  in_stock: boolean;
  sale_price: number | null;
  discount_percentage: number | null;
  sale_ends_at: string | null;
}

interface CartLine {
  item_id: string;
  label: string;
  quantity: number;
  unit: string | null;
  is_generic: boolean;
  source_list_id: string;
  source_list_name: string;
  source_frequency: string;
  matched: RohlikProduct | null;
  packages: number | null;
  line_total: number | null;
}

interface CartData {
  lines: CartLine[];
  total: number;
  matched_count: number;
  unmatched_count: number;
}

interface DeliverySlot {
  date: string;       // ISO "2026-06-05"
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string | null;
}

// ── Frequency config ────────────────────────────────────────────────────────────

const FREQUENCIES = [
  { key: "weekly",   label: "Týdně",       short: "Týdně",    color: "blue"   },
  { key: "biweekly", label: "Po 14 dnech", short: "14 dní",   color: "violet" },
  { key: "monthly",  label: "Měsíčně",     short: "Měsíčně",  color: "orange" },
  { key: "daily",    label: "Denně",       short: "Denně",    color: "teal"   },
] as const;

function freqCfg(key: string) {
  return FREQUENCIES.find((f) => f.key === key) ?? FREQUENCIES[0];
}

const FREQ_BADGE: Record<string, string> = {
  blue:   "bg-blue-100 text-blue-600",
  violet: "bg-violet-100 text-violet-600",
  orange: "bg-orange-100 text-orange-600",
  teal:   "bg-teal-100 text-teal-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function itemLabel(item: { rohlik_product_name: string | null; generic_name: string | null }) {
  return item.rohlik_product_name || item.generic_name || "Neznámá položka";
}

function pluralItems(n: number) {
  return n === 1 ? "položka" : n >= 2 && n <= 4 ? "položky" : "položek";
}

const DAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function formatSlotDate(slot: DeliverySlot) {
  const d = new Date(slot.date + "T00:00:00");
  return `${DAYS_SHORT[slot.day_of_week]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

function slotKey(slot: DeliverySlot) {
  return `${slot.date}_${slot.start_time}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ListsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"lists" | "shopping">("lists");

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
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <h1 className="font-bold text-gray-900">Nákupy</h1>
          </div>
        </div>

        {/* Top mode switcher: manage lists vs. shop */}
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
            <button
              onClick={() => setMode("lists")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                mode === "lists" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ListChecks className="w-4 h-4" />
              Seznamy
            </button>
            <button
              onClick={() => setMode("shopping")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                mode === "shopping" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Nákup
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {mode === "lists" ? <ListsManager /> : <ShoppingPanel />}
      </main>
    </div>
  );
}

// ── Mode: Seznamy (manage) ──────────────────────────────────────────────────────

function ListsManager() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function loadLists() {
    const { data } = await listsApi.getAll();
    setLists(data);
  }

  useEffect(() => {
    loadLists().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (selectedId) {
    return (
      <ListDetail
        listId={selectedId}
        onBack={() => { setSelectedId(null); loadLists(); }}
      />
    );
  }

  return (
    <ListsOverview
      lists={lists}
      onSelect={setSelectedId}
      onChanged={loadLists}
    />
  );
}

// ── Lists overview (grid of lists + create) ─────────────────────────────────────

function ListsOverview({
  lists,
  onSelect,
  onChanged,
}: {
  lists: ShoppingList[];
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [freq, setFreq] = useState<string>("weekly");
  const [saving, setSaving] = useState(false);

  async function createList() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await listsApi.create(name.trim(), freq);
      setName("");
      setFreq("weekly");
      setCreating(false);
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deleteList(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Opravdu smazat tento seznam včetně všech položek?")) return;
    await listsApi.delete(id);
    await onChanged();
  }

  return (
    <div className="space-y-4">
      {/* Create button / form */}
      {creating ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Nový seznam</span>
            <button onClick={() => setCreating(false)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createList()}
            placeholder="Název (např. Měsíční zásoby)"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Frekvence</p>
            <div className="grid grid-cols-4 gap-1.5">
              {FREQUENCIES.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFreq(f.key)}
                  className={`py-1.5 text-xs font-medium rounded-lg border-2 transition-colors ${
                    freq === f.key
                      ? "border-blue-500 bg-blue-50 text-blue-600"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {f.short}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={createList}
            disabled={!name.trim() || saving}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Vytvořit seznam
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nový seznam
        </button>
      )}

      {/* List grid */}
      {lists.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Zatím nemáš žádný seznam.</p>
          <p className="text-xs mt-1">Vytvoř si třeba „Týdenní nákup" a „Měsíční zásoby".</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => {
            const cfg = freqCfg(list.frequency);
            return (
              <button
                key={list.id}
                onClick={() => onSelect(list.id)}
                className="w-full bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3.5 flex items-center gap-3 hover:shadow-md hover:border-gray-300 transition-all text-left group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">{list.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${FREQ_BADGE[cfg.color]}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {list.item_count} {pluralItems(list.item_count)}
                  </p>
                </div>
                <Trash2
                  onClick={(e) => deleteList(e, list.id)}
                  className="w-4 h-4 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                />
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── List detail (single list: My items + Rohlík tabs) ───────────────────────────

function ListDetail({ listId, onBack }: { listId: string; onBack: () => void }) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"list" | "rohlik">("list");

  async function refreshList() {
    const { data } = await listsApi.getOne(listId);
    setList(data);
  }

  useEffect(() => {
    refreshList().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  if (loading || !list) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const checked = list.items.filter((i) => i.is_checked);
  const unchecked = list.items.filter((i) => !i.is_checked);
  const cfg = freqCfg(list.frequency);

  return (
    <div className="space-y-4">
      {/* Detail header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Seznamy
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="font-semibold text-gray-900 truncate">{list.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${FREQ_BADGE[cfg.color]}`}>
          {cfg.label}
        </span>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("list")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "list"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Položky
        </button>
        <button
          onClick={() => setTab("rohlik")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            tab === "rohlik"
              ? "border-orange-500 text-orange-500"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span className="text-base">🛒</span>
          Rohlík
        </button>
      </div>

      {tab === "list" ? (
        <MyListTab list={list} unchecked={unchecked} checked={checked} onRefresh={refreshList} />
      ) : (
        <RohlikTab list={list} onRefresh={refreshList} />
      )}
    </div>
  );
}

// ── Tab: Položky ───────────────────────────────────────────────────────────────

function MyListTab({
  list,
  unchecked,
  checked,
  onRefresh,
}: {
  list: ShoppingList;
  unchecked: ListItem[];
  checked: ListItem[];
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addItem() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await listsApi.addItem(list.id, {
        generic_name: name.trim(),
        quantity: parseFloat(qty) || 1,
        unit: unit.trim() || undefined,
      });
      setName("");
      setQty("1");
      setUnit("");
      await onRefresh();
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  async function toggleCheck(item: ListItem) {
    await listsApi.updateItem(list.id, item.id, { is_checked: !item.is_checked });
    await onRefresh();
  }

  async function updateQty(item: ListItem, delta: number) {
    const next = Math.max(0.5, Math.round((item.quantity + delta) * 10) / 10);
    await listsApi.updateItem(list.id, item.id, { quantity: next });
    await onRefresh();
  }

  async function removeItem(item: ListItem) {
    await listsApi.deleteItem(list.id, item.id);
    await onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Add item form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">Přidat položku</span>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Název (např. Mléko, Chléb…)"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Množství"
            type="number"
            min="0.1"
            step="0.1"
            className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="ks / l / kg"
            className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addItem}
            disabled={!name.trim() || saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Přidat
          </button>
        </div>
      </div>

      {/* Items */}
      {unchecked.length === 0 && checked.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Seznam je prázdný. Přidej první položku výše.</p>
        </div>
      ) : (
        <>
          {unchecked.length > 0 && (
            <div className="space-y-2">
              {unchecked.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onToggle={() => toggleCheck(item)}
                  onDelete={() => removeItem(item)}
                  onQtyChange={(d) => updateQty(item, d)}
                />
              ))}
            </div>
          )}

          {checked.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Hotovo ({checked.length})
              </p>
              <div className="space-y-2 opacity-60">
                {checked.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleCheck(item)}
                    onDelete={() => removeItem(item)}
                    onQtyChange={(d) => updateQty(item, d)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onDelete,
  onQtyChange,
}: {
  item: ListItem;
  onToggle: () => void;
  onDelete: () => void;
  onQtyChange: (delta: number) => void;
}) {
  const isRohlik = !!item.rohlik_product_id;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3 flex items-center gap-3">
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          item.is_checked ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-blue-400"
        }`}
      >
        {item.is_checked && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Image (Rohlík only) */}
      {isRohlik && (
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex-shrink-0 overflow-hidden">
          {item.rohlik_image_url ? (
            <img
              src={item.rohlik_image_url}
              alt={itemLabel(item)}
              loading="lazy"
              className="w-full h-full object-contain p-0.5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : null}
        </div>
      )}

      {/* Name */}
      <div className="flex-1 min-w-0">
        {isRohlik && (
          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium mr-1">
            Rohlík
          </span>
        )}
        <span className={`text-sm font-medium ${item.is_checked ? "line-through text-gray-400" : "text-gray-900"}`}>
          {itemLabel(item)}
        </span>
        {item.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>}
      </div>

      {/* Qty controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onQtyChange(-1)}
          className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="text-sm text-gray-700 w-8 text-center">
          {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)} {item.unit || "ks"}
        </span>
        <button
          onClick={() => onQtyChange(1)}
          className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Tab: Rohlík ───────────────────────────────────────────────────────────────

function formatSaleEnd(endsAt: string): string {
  const d = new Date(endsAt);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

function RohlikTab({
  list,
  onRefresh,
}: {
  list: ShoppingList;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RohlikProduct[]>([]);
  const [discounted, setDiscounted] = useState<RohlikProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDiscounted, setLoadingDiscounted] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load discounted products on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await rohlikApi.discounted();
        setDiscounted(data);
      } catch {
        setDiscounted([]);
      } finally {
        setLoadingDiscounted(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await rohlikApi.search(query);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query]);

  async function addToList(product: RohlikProduct) {
    setAddingId(product.id);
    try {
      await listsApi.addItem(list.id, {
        rohlik_product_id: product.id,
        rohlik_product_name: product.name,
        rohlik_image_url: product.image_url ?? undefined,
        quantity: 1,
        unit: product.unit,
      });
      setAdded((prev) => new Set(prev).add(product.id));
      await onRefresh();
    } finally {
      setAddingId(null);
    }
  }

  const alreadyInList = new Set(
    list.items.filter((i) => i.rohlik_product_id).map((i) => i.rohlik_product_id!)
  );

  const displayProducts = query.length >= 2 ? results : discounted;
  const isSearchMode = query.length >= 2;

  return (
    <div className="space-y-4">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat produkty na Rohlíku…"
          className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Section label */}
      {!isSearchMode && (
        <p className="text-xs font-medium text-orange-500 uppercase tracking-wide flex items-center gap-1">
          <span>🏷️</span> Aktuální slevy na Rohlíku
        </p>
      )}

      {/* Loading / empty states */}
      {(isSearchMode ? searching : loadingDiscounted) && (
        <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{isSearchMode ? "Hledám…" : "Načítám slevy…"}</span>
        </div>
      )}

      {!searching && isSearchMode && results.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Žádné výsledky pro „{query}".</p>
        </div>
      )}

      {!loadingDiscounted && !isSearchMode && discounted.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Momentálně žádné slevy. Zkus vyhledat produkt.</p>
        </div>
      )}

      {/* Product list */}
      {!(isSearchMode ? searching : loadingDiscounted) && displayProducts.length > 0 && (
        <div className="space-y-2">
          {displayProducts.map((product) => {
            const inList = alreadyInList.has(product.id) || added.has(product.id);
            const onSale = !!product.sale_price && product.sale_price < product.price;
            return (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3"
              >
                {/* Image */}
                <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-100 relative">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-contain p-1"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <span className="text-xl">🛒</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-tight ${!product.in_stock ? "text-gray-400" : "text-gray-900"}`}>
                    {product.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {onSale ? (
                      <>
                        <span className="text-sm font-bold text-orange-600">
                          {product.sale_price!.toFixed(2)} Kč
                        </span>
                        <span className="text-xs text-gray-400 line-through">
                          {product.price.toFixed(2)} Kč
                        </span>
                        <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-semibold">
                          -{product.discount_percentage}%
                        </span>
                        {product.sale_ends_at && (
                          <span className="text-xs text-gray-400">
                            do {formatSaleEnd(product.sale_ends_at)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-gray-600">
                        {product.price.toFixed(2)} Kč / {product.unit}
                      </span>
                    )}
                    {!product.in_stock && (
                      <span className="text-xs text-red-400">Není skladem</span>
                    )}
                  </div>
                </div>

                {/* Add button */}
                <button
                  onClick={() => !inList && product.in_stock && addToList(product)}
                  disabled={inList || !product.in_stock || addingId === product.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                    inList
                      ? "bg-green-100 text-green-600 cursor-default"
                      : !product.in_stock
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-orange-500 text-white hover:bg-orange-600"
                  }`}
                >
                  {addingId === product.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : inList ? (
                    <><Check className="w-3 h-3" /> Přidáno</>
                  ) : (
                    <><Plus className="w-3 h-3" /> Přidat</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mode: Nákup (merged shopping view) ──────────────────────────────────────────

function ShoppingPanel() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  // Cart sub-view
  const [view, setView] = useState<"list" | "cart">("list");
  const [cart, setCart] = useState<CartData | null>(null);
  const [building, setBuilding] = useState(false);

  async function load() {
    const { data } = await listsApi.getShopping();
    setItems(data.items);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function toggleCheck(item: ShoppingItem) {
    // optimistic
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_checked: !i.is_checked } : i))
    );
    await listsApi.updateItem(item.source_list_id, item.id, { is_checked: !item.is_checked });
  }

  async function buildCart() {
    setBuilding(true);
    try {
      const { data } = await listsApi.getCart();
      setCart(data);
      setView("cart");
    } finally {
      setBuilding(false);
    }
  }

  async function markOrdered() {
    if (!confirm("Označit aktuální nákup jako objednaný? Měsíční a další seznamy se schovají, dokud znovu nepřijdou na řadu.")) return;
    setMarking(true);
    try {
      await listsApi.markOrdered();
      setCart(null);
      setView("list");
      await load();
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium text-gray-500">Žádný nákup není naplánovaný</p>
        <p className="text-sm mt-1">Buď máš všechny seznamy prázdné, nebo žádný zrovna není na řadě.</p>
      </div>
    );
  }

  // Cart sub-view
  if (view === "cart" && cart) {
    return (
      <CartView
        cart={cart}
        marking={marking}
        onBack={() => setView("list")}
        onOrdered={markOrdered}
        onRebuild={buildCart}
      />
    );
  }

  // Group items by source list
  const groups = new Map<string, { name: string; frequency: string; items: ShoppingItem[] }>();
  for (const it of items) {
    if (!groups.has(it.source_list_id)) {
      groups.set(it.source_list_id, { name: it.source_list_name, frequency: it.source_frequency, items: [] });
    }
    groups.get(it.source_list_id)!.items.push(it);
  }

  const total = items.length;
  const done = items.filter((i) => i.is_checked).length;

  return (
    <div className="space-y-5">
      {/* Summary banner */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {total} {pluralItems(total)} k nákupu
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            ze {groups.size} {groups.size === 1 ? "seznamu" : "seznamů"}
            {done > 0 && ` · ${done} hotovo`}
          </p>
        </div>
        <button
          onClick={markOrdered}
          disabled={marking}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Objednáno
        </button>
      </div>

      {/* Build cart action */}
      <button
        onClick={buildCart}
        disabled={building}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-50 transition-colors text-sm font-medium"
      >
        {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
        {building ? "Sestavuji košík na Rohlíku…" : "Sestavit košík a spočítat cenu"}
      </button>

      {/* Grouped items */}
      {Array.from(groups.entries()).map(([listId, group]) => {
        const cfg = freqCfg(group.frequency);
        return (
          <div key={listId}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-sm font-semibold text-gray-700">{group.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${FREQ_BADGE[cfg.color]}`}>
                {cfg.label}
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map((item) => (
                <ShoppingItemRow key={item.id} item={item} onToggle={() => toggleCheck(item)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Cart view (priced) ──────────────────────────────────────────────────────────

function CartView({
  cart,
  marking,
  onBack,
  onOrdered,
  onRebuild,
}: {
  cart: CartData;
  marking: boolean;
  onBack: () => void;
  onOrdered: () => void;
  onRebuild: () => void;
}) {
  const [picker, setPicker] = useState<CartLine | null>(null);
  const [swapping, setSwapping] = useState(false);

  // Delivery slot suggestions (from the user's schedule)
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<DeliverySlot | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await scheduleApi.getDeliverySlots();
        setSlots(data);
        if (data.length > 0) setSelectedSlot(data[0]); // default: nearest
      } catch {
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, []);

  async function pickProduct(line: CartLine, product: RohlikProduct) {
    setSwapping(true);
    try {
      await listsApi.updateItem(line.source_list_id, line.item_id, {
        rohlik_product_id: product.id,
        rohlik_product_name: product.name,
        rohlik_image_url: product.image_url ?? undefined,
      });
      setPicker(null);
      onRebuild(); // re-price the cart with the new product
    } finally {
      setSwapping(false);
    }
  }

  // Group lines by source list, preserving order
  const groups = new Map<string, { name: string; frequency: string; lines: CartLine[] }>();
  for (const line of cart.lines) {
    if (!groups.has(line.source_list_id)) {
      groups.set(line.source_list_id, {
        name: line.source_list_name,
        frequency: line.source_frequency,
        lines: [],
      });
    }
    groups.get(line.source_list_id)!.lines.push(line);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zpět na seznam
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
        <span className="font-semibold text-gray-900">Návrh košíku</span>
      </div>

      {/* Unmatched warning */}
      {cart.unmatched_count > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {cart.unmatched_count} {pluralItems(cart.unmatched_count)} se nepodařilo najít na Rohlíku —
            cena je tak pouze orientační. Můžeš je upřesnit přes záložku Rohlík v daném seznamu.
          </span>
        </div>
      )}

      {/* Grouped priced lines */}
      {Array.from(groups.entries()).map(([listId, group]) => {
        const cfg = freqCfg(group.frequency);
        return (
          <div key={listId}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-sm font-semibold text-gray-700">{group.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${FREQ_BADGE[cfg.color]}`}>
                {cfg.label}
              </span>
            </div>
            <div className="space-y-2">
              {group.lines.map((line) => (
                <CartLineRow key={line.item_id} line={line} onSwap={() => setPicker(line)} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Product picker modal */}
      {picker && (
        <ProductPickerModal
          line={picker}
          swapping={swapping}
          onPick={(p) => pickProduct(picker, p)}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Delivery slot selection */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Truck className="w-4 h-4 text-teal-600" />
          <span className="text-sm font-semibold text-gray-700">Termín doručení</span>
        </div>
        {loadingSlots ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-3 px-1">
            <Loader2 className="w-4 h-4 animate-spin" /> Hledám termíny podle rozvrhu…
          </div>
        ) : slots.length === 0 ? (
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <CalendarClock className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
            <span>
              Zatím nevíme, kdy jsi doma. Označ si v <strong>Rozvrhu</strong> sloty „Jsem doma" a
              objeví se tu nejbližší termíny doručení.
            </span>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {slots.map((slot) => {
              const isSel = selectedSlot && slotKey(selectedSlot) === slotKey(slot);
              return (
                <button
                  key={slotKey(slot)}
                  onClick={() => setSelectedSlot(slot)}
                  className={`flex-shrink-0 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                    isSel
                      ? "border-teal-500 bg-teal-50"
                      : "border-gray-200 bg-white hover:border-teal-300"
                  }`}
                >
                  <p className={`text-xs font-bold ${isSel ? "text-teal-700" : "text-gray-700"}`}>
                    {formatSlotDate(slot)}
                  </p>
                  <p className={`text-xs mt-0.5 ${isSel ? "text-teal-600" : "text-gray-400"}`}>
                    {slot.start_time}–{slot.end_time}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Order summary + confirm */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-4 sticky bottom-4">
        {selectedSlot && (
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> Doručení
            </span>
            <span className="text-sm font-medium text-gray-700">
              {formatSlotDate(selectedSlot)} · {selectedSlot.start_time}–{selectedSlot.end_time}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">
            Celkem ({cart.matched_count} {pluralItems(cart.matched_count)})
          </span>
          <span className="text-2xl font-bold text-gray-900">
            {cart.total.toFixed(2)} Kč
          </span>
        </div>
        <button
          onClick={onOrdered}
          disabled={marking}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Objednáno
        </button>
      </div>
    </div>
  );
}

function fmtNum(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function CartLineRow({ line, onSwap }: { line: CartLine; onSwap: () => void }) {
  const m = line.matched;
  const onSale = !!m?.sale_price && m.sale_price < m.price;
  // What the user asked for, e.g. "500 g" or "2 ks"
  const requested = `${fmtNum(line.quantity)}${line.unit ? " " + line.unit : "×"}`;
  // How many packages we'll buy, e.g. "5× 100 g"
  const packLabel = m && line.packages ? `${fmtNum(line.packages)}× ${m.unit}` : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3 flex items-center gap-3">
      {/* Image */}
      <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {m?.image_url ? (
          <img
            src={m.image_url}
            alt={m.name}
            loading="lazy"
            className="w-full h-full object-contain p-0.5"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="text-lg opacity-40">🛒</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-tight truncate">
          {m ? m.name : line.label}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {packLabel ? (
            <span className="text-xs font-medium text-gray-600">{packLabel}</span>
          ) : (
            <span className="text-xs text-gray-400">{requested}</span>
          )}
          {line.is_generic && (
            <span className="text-xs text-gray-400">· chci {requested}</span>
          )}
          {m && (
            <span className={`text-xs ${onSale ? "text-orange-600 font-medium" : "text-gray-500"}`}>
              · {(onSale ? m.sale_price! : m.price).toFixed(2)} Kč/{m.unit}
            </span>
          )}
          {!m && <span className="text-xs text-amber-600">· nenalezeno na Rohlíku</span>}
        </div>
      </div>

      {/* Line total + swap */}
      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
        {line.line_total !== null ? (
          <span className="text-sm font-semibold text-gray-900">{line.line_total.toFixed(2)} Kč</span>
        ) : (
          <span className="text-sm text-gray-300">—</span>
        )}
        <button
          onClick={onSwap}
          className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
        >
          Změnit
        </button>
      </div>
    </div>
  );
}

// ── Product picker modal (manual swap) ──────────────────────────────────────────

function ProductPickerModal({
  line,
  swapping,
  onPick,
  onClose,
}: {
  line: CartLine;
  swapping: boolean;
  onPick: (product: RohlikProduct) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(line.label);
  const [results, setResults] = useState<RohlikProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await rohlikApi.search(query);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="font-bold text-gray-900">Vybrat produkt</h2>
            <p className="text-xs text-gray-400 truncate">pro „{line.label}" · chci {fmtNum(line.quantity)} {line.unit || "ks"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat na Rohlíku…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 relative">
          {swapping && (
            <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Hledám…</span>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Žádné výsledky.</div>
          ) : (
            results.map((p) => {
              const onSale = !!p.sale_price && p.sale_price < p.price;
              const isCurrent = line.matched?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => !isCurrent && onPick(p)}
                  disabled={isCurrent}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    isCurrent
                      ? "border-green-300 bg-green-50 cursor-default"
                      : "border-gray-200 hover:border-orange-300 hover:bg-orange-50"
                  }`}
                >
                  <div className="w-11 h-11 rounded-lg bg-gray-50 border border-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-contain p-0.5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <span className="text-lg opacity-40">🛒</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-tight truncate">{p.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-xs ${onSale ? "text-orange-600 font-medium" : "text-gray-500"}`}>
                        {(onSale ? p.sale_price! : p.price).toFixed(2)} Kč
                      </span>
                      <span className="text-xs text-gray-400">/ {p.unit}</span>
                      {!p.in_stock && <span className="text-xs text-red-400">· není skladem</span>}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="text-xs text-green-600 font-medium flex-shrink-0 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Vybráno
                    </span>
                  ) : (
                    <Plus className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ShoppingItemRow({ item, onToggle }: { item: ShoppingItem; onToggle: () => void }) {
  const isRohlik = !!item.rohlik_product_id;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-3 flex items-center gap-3">
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          item.is_checked ? "bg-green-500 border-green-500" : "border-gray-300 hover:border-blue-400"
        }`}
      >
        {item.is_checked && <Check className="w-3 h-3 text-white" />}
      </button>

      {isRohlik && (
        <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex-shrink-0 overflow-hidden">
          {item.rohlik_image_url ? (
            <img
              src={item.rohlik_image_url}
              alt={itemLabel(item)}
              loading="lazy"
              className="w-full h-full object-contain p-0.5"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : null}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {isRohlik && (
          <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-medium mr-1">
            Rohlík
          </span>
        )}
        <span className={`text-sm font-medium ${item.is_checked ? "line-through text-gray-400" : "text-gray-900"}`}>
          {itemLabel(item)}
        </span>
        {item.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>}
      </div>

      <span className="text-sm text-gray-500 flex-shrink-0">
        {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)} {item.unit || "ks"}
      </span>
    </div>
  );
}
