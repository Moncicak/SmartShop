from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional

from app.api.v1.deps import DB, CurrentUser
from app.schemas.auth import UserResponse

router = APIRouter()


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    fcm_token: Optional[str] = None


@router.get("/me", response_model=UserResponse)
async def get_profile(current_user: CurrentUser):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        revolut_connected=current_user.revolut_connected,
    )


@router.patch("/me", response_model=UserResponse)
async def update_profile(body: UpdateProfileRequest, current_user: CurrentUser, db: DB):
    if body.full_name is not None:
        current_user.full_name = body.full_name
    if body.fcm_token is not None:
        current_user.fcm_token = body.fcm_token

    db.add(current_user)
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        revolut_connected=current_user.revolut_connected,
    )
