import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import admin, alerts, auth, market, notifications, rules, watchlist
from app.core.config import settings
from app.scheduler.main import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
# yfinance logs every missing/delisted ticker at ERROR level; that noise is handled by our own code
logging.getLogger("yfinance").setLevel(logging.CRITICAL)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        start_scheduler()
        logger.info("Background scheduler started")
    except Exception:
        logger.exception("Scheduler failed to start")
    yield
    stop_scheduler()


app = FastAPI(title="BIST Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, market.router, rules.router, watchlist.router, notifications.router, alerts.router, admin.router):
    app.include_router(router, prefix=settings.API_V1_STR)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
