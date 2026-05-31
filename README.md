# SmartCart — AI nákupní asistent pro Rohlik.cz

Diplomová práce | Webová aplikace s AI agentem pro automatizované nákupní plánování.

## Rychlý start

```bash
# 1. Zkopíruj env template
cp .env.example .env
# Uprav .env — přidej SECRET_KEY, ANTHROPIC_API_KEY atd.

# 2. Spusť celý stack
docker-compose up --build

# 3. Spusť databázové migrace (poprvé)
docker exec smartcart_backend alembic upgrade head
```

Aplikace poběží na:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API dokumentace: http://localhost:8000/api/docs

## Struktura projektu

```
DP/
├── frontend/          # Next.js 15 + TypeScript + Tailwind
├── backend/           # Python + FastAPI + LangGraph
│   ├── app/
│   │   ├── api/       # REST endpointy
│   │   ├── models/    # SQLAlchemy modely
│   │   ├── schemas/   # Pydantic schémata
│   │   ├── core/      # Config, DB, Security, Celery
│   │   ├── services/  # Business logika, Celery tasks
│   │   └── agents/    # LangGraph AI agent
│   └── alembic/       # DB migrace
├── docker-compose.yml
└── .env.example
```

## Vývoj fáze po fázi

| Fáze | Co se buduje | Stav |
|------|-------------|------|
| F1 | Základy, Docker, DB, Auth | ✅ Hotovo |
| F2 | Rohlik integrace | ⏳ Plánováno |
| F3 | Nákupní seznamy | ⏳ Plánováno |
| F4 | AI agent (LangGraph) | ⏳ Plánováno |
| F5 | Revolut platby | ⏳ Plánováno |
| F6 | UI finalizace, chat, přehledy | ⏳ Plánováno |

## Technologie

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Zustand, React Hook Form
- **Backend**: FastAPI, SQLAlchemy (async), Alembic, Pydantic v2
- **AI**: LangGraph, Claude API (Anthropic)
- **Scheduling**: Celery + Redis
- **DB**: PostgreSQL 16
- **Infrastruktura**: Docker Compose
