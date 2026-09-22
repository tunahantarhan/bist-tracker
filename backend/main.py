from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routers import rules
# from app.scheduler.main import start_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # start_scheduler()
    yield

app = FastAPI(title="BIST Rule Engine MVP", lifespan=lifespan)

# Next.js ile iletişim için CORS yapılandırması
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router'ı API versiyonlamasıyla sisteme kaydetme
app.include_router(rules.router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "ok"}