from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse
import uuid
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a chat message and get a RAG-powered response."""
    from app.services.rag.chat_engine import get_chat_response

    session_id = data.session_id or str(uuid.uuid4())

    result = await get_chat_response(
        query=data.message,
        user_id=user.id,
        session_id=session_id,
    )

    return ChatResponse(
        message=result["response"],
        sources=result.get("sources", []),
        session_id=session_id,
    )


@router.post("/stream")
async def chat_stream(
    data: ChatRequest,
    user: User = Depends(get_current_user),
):
    """Stream a chat response via SSE."""
    from app.services.rag.chat_engine import stream_chat_response

    session_id = data.session_id or str(uuid.uuid4())

    async def event_generator():
        async for chunk in stream_chat_response(
            query=data.message,
            user_id=user.id,
            session_id=session_id,
        ):
            yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/history")
async def chat_history(
    session_id: str | None = None,
    user: User = Depends(get_current_user),
):
    """Get chat history for a session."""
    import redis as redis_lib
    from app.config import get_settings
    settings = get_settings()

    r = redis_lib.from_url(settings.redis_url)
    key = f"chat:history:{user.id}:{session_id}" if session_id else f"chat:history:{user.id}:*"

    if session_id:
        history = r.lrange(key, 0, -1)
        r.close()
        return [json.loads(h) for h in history]
    else:
        # List all sessions
        keys = r.keys(f"chat:history:{user.id}:*")
        sessions = [k.decode().split(":")[-1] for k in keys]
        r.close()
        return {"sessions": sessions}


@router.delete("/history")
async def clear_history(
    session_id: str | None = None,
    user: User = Depends(get_current_user),
):
    """Clear chat history."""
    import redis as redis_lib
    from app.config import get_settings
    settings = get_settings()

    r = redis_lib.from_url(settings.redis_url)
    if session_id:
        r.delete(f"chat:history:{user.id}:{session_id}")
    else:
        keys = r.keys(f"chat:history:{user.id}:*")
        for key in keys:
            r.delete(key)
    r.close()

    return {"message": "History cleared"}
