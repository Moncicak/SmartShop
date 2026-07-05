"""Rohlík MCP client — wrapper around the @tomaspavlin/rohlik-mcp stdio server.

Credentials are passed in per call (stored per-user, encrypted, in the DB), not
read from global env. Each operation spawns the Node MCP server over stdio
(open → initialize → call → close). TODO(perf): persistent session if needed.

`mcp` SDK imports are deferred into functions so a missing SDK never breaks app
startup — only the MCP features fail, loudly and locally.
"""
import os
import json
import asyncio
from contextlib import asynccontextmanager
from typing import Any, Optional

from app.core.config import settings

CONNECT_TIMEOUT = 60  # seconds — guard against a hanging stdio handshake


class RohlikMcpError(RuntimeError):
    """Any failure talking to the Rohlík MCP server."""


def _server_params(email: str, password: str):
    from mcp import StdioServerParameters

    env = dict(os.environ)  # keep PATH etc. so `npx` resolves
    env["ROHLIK_USERNAME"] = email
    env["ROHLIK_PASSWORD"] = password
    env["ROHLIK_BASE_URL"] = settings.ROHLIK_BASE_URL
    return StdioServerParameters(
        command="npx",
        args=["-y", "@tomaspavlin/rohlik-mcp"],
        env=env,
    )


@asynccontextmanager
async def _session(email: str, password: str):
    from mcp import ClientSession
    from mcp.client.stdio import stdio_client

    async with stdio_client(_server_params(email, password)) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


def _extract(result) -> Any:
    """Pull a JSON (or text) payload out of an MCP CallToolResult."""
    texts = []
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text is not None:
            texts.append(text)
    joined = "\n".join(texts).strip()
    if not joined:
        return None
    try:
        return json.loads(joined)
    except (ValueError, TypeError):
        return joined


def _looks_authenticated(data: Any) -> bool:
    """Heuristic: did get_account_data come back as real data (not an error)?"""
    if not data:
        return False
    if isinstance(data, str):
        low = data.lower()
        bad = ["error", "unauthor", "invalid", "failed", "přihlá", "login", "401", "403"]
        return not any(k in low for k in bad)
    if isinstance(data, dict):
        return not data.get("error")
    return True


# ── Public API ──────────────────────────────────────────────────────────────────

async def list_tools(email: str, password: str) -> list[dict]:
    async with _session(email, password) as session:
        res = await session.list_tools()
        return [{"name": t.name, "description": t.description} for t in res.tools]


async def call(email: str, password: str, tool: str, arguments: Optional[dict] = None) -> Any:
    async with _session(email, password) as session:
        result = await session.call_tool(tool, arguments or {})
        return _extract(result)


async def verify_credentials(email: str, password: str) -> dict:
    """Probe the MCP server and check the credentials actually authenticate.

    Returns {ok, tools, error}. Never raises — failures come back as ok=False.
    """
    try:
        async def _run():
            async with _session(email, password) as session:
                tres = await session.list_tools()
                tools = [{"name": t.name, "description": t.description} for t in tres.tools]
                acc = _extract(await session.call_tool("get_account_data", {}))
                return tools, acc

        tools, account = await asyncio.wait_for(_run(), timeout=CONNECT_TIMEOUT)
        if _looks_authenticated(account):
            return {"ok": True, "tools": tools, "error": None}
        return {"ok": False, "tools": tools, "error": (
            "Přihlášení se nezdařilo. Pokud jsou údaje správné, Rohlík ti právě poslal "
            "potvrzovací e-mail (přihlášení z nového zařízení) — potvrď ho a zkus to znovu. "
            "Jinak zkontroluj email a heslo."
        )}
    except asyncio.TimeoutError:
        return {"ok": False, "tools": [], "error": "Časový limit při spojení s Rohlíkem."}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "tools": [], "error": str(e)[:300]}


# ── Typed helpers (expand once we can inspect real responses) ────────────────────

async def get_delivery_slots(email: str, password: str) -> Any:
    return await call(email, password, "get_delivery_slots", {})


async def search_products(email: str, password: str, query: str, limit: int = 20) -> Any:
    return await call(email, password, "search_products", {"query": query, "limit": limit})
