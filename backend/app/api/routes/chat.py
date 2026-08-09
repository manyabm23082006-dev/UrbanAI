from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...schemas.schemas import ChatRequest, ChatResponse
from ...services.chat_engine import get_reply
from ..deps import get_current_user_optional

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


@router.post("/ask", response_model=ChatResponse)
async def ask(payload: ChatRequest, db: Session = Depends(get_db), user=Depends(get_current_user_optional)):
    reply, source = await get_reply(payload.message, payload.context, db, user)
    return ChatResponse(reply=reply, source=source)
