from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="checkm8", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from app.auth.router import router as auth_router
from app.lists.router import router as lists_router
from app.nodes.router import router as nodes_router
from app.sharing.router import router as sharing_router
from app.sections_router import router as sections_router
from app.ws.router import router as ws_router

app.include_router(auth_router)
app.include_router(lists_router)
app.include_router(nodes_router)
app.include_router(sharing_router)
app.include_router(sections_router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
