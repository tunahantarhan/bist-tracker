from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routers import rules
from app.scheduler.main import start_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Scheduler starts when the application starts and stops when the application shuts down
    try:
        start_scheduler()
        print("Scheduler başarıyla başlatıldı.")
    except Exception as e:
        print(f"Scheduler başlatılırken hata: {e}")
    yield

app = FastAPI(title="BIST Rule Engine MVP", lifespan=lifespan)

# CORS settings for to Next.js frontend running on localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router connection for API endpoints
app.include_router(rules.router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "ok"}