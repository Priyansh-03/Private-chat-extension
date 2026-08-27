from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.db.mongo import create_client, ensure_indexes, get_database, seed_default_config
from src.routes import config as config_routes
from src.routes import devices as device_routes
from src.routes import messages as message_routes
from src.routes import pairing as pairing_routes
from src.ws.manager import ConnectionManager
from src.ws.router import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = create_client()
    db = get_database(client)
    await ensure_indexes(db)
    await seed_default_config(db)

    app.state.client = client
    app.state.db = db
    app.state.manager = ConnectionManager()

    yield

    client.close()


app = FastAPI(title="Private Chat Overlay Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(device_routes.router)
app.include_router(pairing_routes.router)
app.include_router(message_routes.router)
app.include_router(config_routes.router)
app.include_router(ws_router)
