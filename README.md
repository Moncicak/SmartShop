# SmartCart — AI nákupní asistent pro Rohlik.cz

Diplomová práce | Webová aplikace, která pomáhá plánovat a automatizovat týdenní
nákup na Rohlíku — od nákupních seznamů přes sestavení a ocenění košíku až po výběr
času doručení podle rozvrhu a uložení objednávky do historie.

## Co aplikace umí

- **Nákupní seznamy podle frekvence** — víc seznamů (týdenní, měsíční…), přepínač
  *Seznamy / Nákup / Historie*. Položky obecné („mléko, 2 l") i konkrétní Rohlík produkty.
- **Vyhledávání produktů z Rohlíku** přímo v appce (slevy, ceny, obrázky).
- **Sestavení a ocenění košíku** — obecné položky se chytře napárují na konkrétní
  produkty (výběr velikosti balení dle množství), spočítá se cena i ušetřeno na slevách.
  Produkt u řádku lze ručně přehodit (swap).
- **Rozvrh + návrh času doručení** — týdenní kalendář „kdy jsem doma"; z něj se navrhnou
  nejbližší termíny doručení a spojí s košíkem do souhrnu objednávky.
- **Objednávky a historie** — „Objednat" uloží snapshot košíku (položky, cena, termín);
  historie a měsíční útrata na dashboardu.
- **Přehledy útrat** — grafy útraty po měsících + nejnákladnější produkty.
- **Připojení Rohlík účtu** přes oficiální [Rohlík MCP server](https://github.com/tomaspavlin/rohlik-mcp)
  (přihlášení k existujícímu účtu; heslo uloženo šifrovaně, per uživatel).

## Rychlý start

```bash
# 1. Zkopíruj env template a uprav .env (SECRET_KEY, ANTHROPIC_API_KEY, …)
cp .env.example .env

# 2. Spusť celý stack (backend image obsahuje i Node.js kvůli Rohlík MCP)
docker compose up --build

# 3. Spusť databázové migrace (poprvé i po nových migracích)
docker exec smartcart_backend alembic upgrade head
```

Aplikace poběží na:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Připojení Rohlík účtu

V appce: **Dashboard → ⚙️ Nastavení → Rohlík účet** → zadej email a heslo.

> **Pozn.:** Aplikace účet na Rohlíku **nezakládá** — Rohlík vytváří zákaznický účet
> až s první objednávkou ([podmínky](https://www.rohlik.cz/stranka/podminky-uziti)).
> Připoj proto **existující** účet. Heslo se ověří přihlášením přes MCP a uloží se
> šifrovaně (Fernet, klíč odvozený ze `SECRET_KEY`).

## Struktura projektu

```
DP/
├── frontend/                # Next.js 15 + TypeScript + Tailwind + recharts
│   └── src/app/dashboard/   # lists, schedule, stats, settings
├── backend/                 # Python 3.13 + FastAPI
│   ├── app/
│   │   ├── api/v1/endpoints # auth, users, shopping_lists, schedule, orders, rohlik_mcp
│   │   ├── models/          # SQLAlchemy modely (User, ShoppingList, Order, …)
│   │   ├── core/            # config, database, security, crypto
│   │   └── services/        # rohlik_client (HTTP), rohlik_mcp (MCP klient), tasks
│   ├── alembic/             # DB migrace
│   └── Dockerfile           # Python + Node.js (pro Rohlík MCP server)
├── docker-compose.yml
└── .env.example
```

## Technologie

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, recharts, axios, Zustand
- **Backend**: FastAPI, SQLAlchemy (async), Alembic, Pydantic v2
- **Rohlík integrace**: vlastní HTTP klient (vyhledávání) + `mcp` SDK k MCP serveru (Node.js)
- **AI** (plánováno): LangGraph, Claude API (Anthropic)
- **Scheduling**: Celery + Redis
- **DB**: PostgreSQL 17
- **Infrastruktura**: Docker Compose

## Stav vývoje

| Fáze | Co se buduje | Stav |
|------|-------------|------|
| F1 | Základy, Docker, DB, Auth | ✅ Hotovo |
| F2a | Rohlík HTTP klient (vyhledávání, slevy) | ✅ Hotovo |
| F2b | Rohlík MCP integrace + připojení účtu | 🟡 Plumbing + connect hotové (reálná data s údaji) |
| F3 | Nákupní seznamy (+ více seznamů, switcher) | ✅ Hotovo |
| F3.2 | Sestavení a ocenění košíku (+ swap produktu) | ✅ Hotovo |
| F3.3 | Návrh času doručení + souhrn objednávky | ✅ Hotovo |
| F3.4 | Objednávky + historie + útrata na dashboardu | ✅ Hotovo |
| F3.5 | Přehledy útrat (grafy) | ✅ Hotovo |
| F4 | AI agent (LangGraph) + chat | ⏳ Plánováno |
| F5 | Revolut platby | ❓ Pravděpodobně odpadá (potvrzení ručně v Rohlíku) |
| F6 | UI finalizace, chat | ⏳ Plánováno |
