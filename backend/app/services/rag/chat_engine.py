"""Ollama-powered chat engine with RAG context."""

import json
import logging
import redis as redis_lib
from datetime import datetime, timezone
from app.config import get_settings
from app.services.rag.retriever import get_context_for_query, search_similar_jobs

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are TJSR Assistant, an intelligent job search advisor for the TJSR platform.
You have access to a database of real job postings that have been scraped and indexed.
Answer questions about jobs, career advice, and market insights using the provided context.
Be concise, helpful, and specific. When referencing jobs, include the company name and title.
If you don't have enough information from the context, say so clearly."""


async def get_chat_response(query: str, user_id: str, session_id: str) -> dict:
    """Get a RAG-powered chat response."""
    settings = get_settings()

    # Retrieve relevant context
    context = await get_context_for_query(query, user_id=user_id, limit=5)
    sources = await search_similar_jobs(query, limit=5)

    # Build conversation history from Redis
    history = _load_history(user_id, session_id)

    # Build messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Add recent history (last 6 messages = 3 turns)
    messages.extend(history[-6:])

    # Add user message with context
    user_message = f"""Context from job database:
{context}

User question: {query}"""
    messages.append({"role": "user", "content": user_message})

    # Call Ollama
    response_text = await _call_ollama(messages, settings)

    # Save to history
    _save_to_history(user_id, session_id, query, response_text)

    return {
        "response": response_text,
        "sources": [
            {
                "job_id": s["job_id"],
                "title": s["title"],
                "company": s["company"],
                "relevance_score": s["score"],
            }
            for s in sources[:3]
        ],
    }


async def stream_chat_response(query: str, user_id: str, session_id: str):
    """Stream a RAG-powered chat response as SSE chunks."""
    settings = get_settings()

    context = await get_context_for_query(query, user_id=user_id, limit=5)
    history = _load_history(user_id, session_id)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history[-6:])
    messages.append({
        "role": "user",
        "content": f"Context:\n{context}\n\nQuestion: {query}"
    })

    full_response = ""

    async for chunk in _stream_ollama(messages, settings):
        full_response += chunk
        yield {"type": "chunk", "content": chunk}

    # Save to history after streaming completes
    _save_to_history(user_id, session_id, query, full_response)

    # Send sources
    sources = await search_similar_jobs(query, limit=3)
    yield {
        "type": "sources",
        "sources": [
            {
                "job_id": s["job_id"],
                "title": s["title"],
                "company": s["company"],
                "relevance_score": s["score"],
            }
            for s in sources
        ]
    }


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks produced by reasoning models like qwen3."""
    import re
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


async def _call_ollama(messages: list[dict], settings) -> str:
    """Call Ollama API and return full response."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": messages,
                    "stream": False,
                    "think": False,
                    "options": {"temperature": 0.3, "num_predict": 1024},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data.get("message", {}).get("content", "I'm sorry, I couldn't generate a response.")
            return _strip_thinking(content)
    except Exception as e:
        logger.error(f"Ollama call failed: {e}")
        return f"I'm currently unable to process your request. Please ensure Ollama is running with the {settings.ollama_model} model."


async def _stream_ollama(messages: list[dict], settings):
    """Stream response from Ollama, suppressing thinking tokens."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": messages,
                    "stream": True,
                    "think": False,
                    "options": {"temperature": 0.3},
                },
            ) as resp:
                inside_think = False
                buffer = ""
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            # skip thinking chunks (thinking=True flag from Ollama)
                            if data.get("thinking"):
                                continue
                            content = data.get("message", {}).get("content", "")
                            if not content:
                                continue
                            # Also strip any <think> tags that sneak through
                            buffer += content
                            # Flush buffer when not inside a think block
                            while True:
                                if inside_think:
                                    end = buffer.find("</think>")
                                    if end == -1:
                                        buffer = ""
                                        break
                                    buffer = buffer[end + 8:]
                                    inside_think = False
                                else:
                                    start = buffer.find("<think>")
                                    if start == -1:
                                        yield buffer
                                        buffer = ""
                                        break
                                    if start > 0:
                                        yield buffer[:start]
                                    buffer = buffer[start + 7:]
                                    inside_think = True
                        except json.JSONDecodeError:
                            continue
    except Exception as e:
        logger.error(f"Ollama stream failed: {e}")
        yield "Error: Could not stream response from Ollama."


def _load_history(user_id: str, session_id: str) -> list[dict]:
    """Load chat history from Redis."""
    try:
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        key = f"chat:history:{user_id}:{session_id}"
        history = r.lrange(key, 0, -1)
        r.close()
        return [json.loads(h) for h in history]
    except Exception:
        return []


def _save_to_history(user_id: str, session_id: str, user_msg: str, assistant_msg: str):
    """Save messages to chat history in Redis."""
    try:
        settings = get_settings()
        r = redis_lib.from_url(settings.redis_url)
        key = f"chat:history:{user_id}:{session_id}"
        ts = datetime.now(timezone.utc).isoformat()
        r.rpush(key, json.dumps({"role": "user", "content": user_msg, "timestamp": ts}))
        r.rpush(key, json.dumps({"role": "assistant", "content": assistant_msg, "timestamp": ts}))
        r.expire(key, 86400 * 7)  # 7 days TTL
        r.close()
    except Exception as e:
        logger.warning(f"Could not save chat history: {e}")
