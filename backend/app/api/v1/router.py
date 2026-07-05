from fastapi import APIRouter

from app.api.v1.endpoints import auth, users, shopping_lists, schedule, orders, rohlik_mcp, chat

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(shopping_lists.router, prefix="/lists", tags=["Shopping Lists"])
api_router.include_router(schedule.router, prefix="/schedule", tags=["Schedule"])
api_router.include_router(orders.router, prefix="/orders", tags=["Orders"])
api_router.include_router(rohlik_mcp.router, prefix="/rohlik-mcp", tags=["Rohlík MCP"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
