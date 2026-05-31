from fastapi import APIRouter
from app.api.v1.endpoints import auth, jobs, applications, scraper, chat, graph, bot, stats, logs, health, resume, notifications

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(resume.router, prefix="/resume", tags=["Resume"])
api_router.include_router(applications.router, prefix="/applications", tags=["Applications"])
api_router.include_router(scraper.router, prefix="/scraper", tags=["Scraper"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
api_router.include_router(graph.router, prefix="/graph", tags=["Graph"])
api_router.include_router(bot.router, prefix="/bot", tags=["Bot"])
api_router.include_router(stats.router, prefix="/stats", tags=["Stats"])
api_router.include_router(logs.router, prefix="/logs", tags=["Logs"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
