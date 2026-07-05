"""Chat with the SmartCart AI agent."""
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete

from app.api.v1.deps import DB, CurrentUser
from app.core.config import settings
from app.models.chat import ChatMessage, MessageRole

router = APIRouter()

HISTORY_LIMIT = 30  # turns sent to the model (also what the UI shows)


class ChatRequest(BaseModel):
    message: str


class ChatMessageOut(BaseModel):
    id: str
    role: str          # "user" | "agent"
    content: str
    created_at: str


class ChatResponse(BaseModel):
    reply: str
    tools_used: List[str] = []


@router.get("/", response_model=List[ChatMessageOut])
async def get_history(current_user: CurrentUser, db: DB):
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    rows = list(reversed(res.scalars().all()))
    return [ChatMessageOut(
        id=str(m.id), role=m.role.value, content=m.content,
        created_at=m.created_at.isoformat(),
    ) for m in rows]


@router.post("/", response_model=ChatResponse)
async def send_message(body: ChatRequest, current_user: CurrentUser, db: DB):
    if settings.agent_provider is None:
        raise HTTPException(
            status_code=503,
            detail="AI agent není nakonfigurován — přidej GEMINI_API_KEY (zdarma) "
                   "nebo ANTHROPIC_API_KEY do .env.",
        )
    text = body.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Prázdná zpráva.")

    # Build model history from persisted turns + the new message
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    past = list(reversed(res.scalars().all()))
    history = [
        {"role": "user" if m.role == MessageRole.USER else "assistant", "content": m.content}
        for m in past
    ]
    history.append({"role": "user", "content": text})

    from app.agents.shopping_agent import run_agent

    try:
        result = await run_agent(history, current_user, db)
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).exception("Agent run failed")
        if type(e).__name__ == "RateLimitError":
            raise HTTPException(
                status_code=429,
                detail="Vyčerpán free limit AI (5 zpráv/min) — počkej minutku a zkus to znovu.",
            )
        raise HTTPException(status_code=502, detail="Agent selhal — zkus to prosím znovu.")

    db.add(ChatMessage(user_id=current_user.id, role=MessageRole.USER, content=text))
    db.add(ChatMessage(user_id=current_user.id, role=MessageRole.AGENT, content=result["reply"]))
    await db.flush()

    return ChatResponse(reply=result["reply"], tools_used=result["tools_used"])


@router.delete("/", status_code=204)
async def clear_history(current_user: CurrentUser, db: DB):
    await db.execute(delete(ChatMessage).where(ChatMessage.user_id == current_user.id))
