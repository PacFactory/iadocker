"""Async SQLite database connection and initialization."""

import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db_models import Base, SearchHistoryDB, AppSettingsDB

logger = logging.getLogger(__name__)

# Global engine and session factory
_engine = None
_session_factory = None


def _get_database_path() -> Path:
    """Determine DB path. Called inside init_db() after mkdir attempt."""
    env_path = os.environ.get("IADOCKER_DB_PATH")
    if env_path:
        return Path(env_path)

    config_path = Path("/config")
    try:
        config_path.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        pass

    if config_path.exists():
        return config_path / "iadocker.db"
    else:
        # Dev fallback
        return Path("./iadocker.db")


async def init_db():
    """Initialize database: create tables, set pragmas, run migrations."""
    global _engine, _session_factory

    database_path = _get_database_path()
    logger.info(f"Initializing database at: {database_path}")

    # Create engine with SQLite pragmas for concurrency
    _engine = create_async_engine(
        f"sqlite+aiosqlite:///{database_path}",
        echo=False,
    )

    # Set pragmas on connection
    async with _engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA synchronous=NORMAL"))
        await conn.execute(text("PRAGMA foreign_keys=ON"))
        await conn.execute(text("PRAGMA busy_timeout=5000"))

        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

    # Create session factory
    _session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Run one-time migration from settings.json
    await migrate_from_json()

    logger.info("Database initialized successfully")


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")

    async with _session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def migrate_from_json():
    """One-time migration from settings.json. Idempotent and race-safe.

    Uses INSERT OR IGNORE to handle concurrent worker races gracefully.
    """
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    settings_file = Path("/config/settings.json")
    if not settings_file.exists():
        logger.info("No settings.json found, skipping migration")
        return

    try:
        with open(settings_file) as f:
            data = json.load(f)
    except Exception as e:
        logger.warning(f"Failed to read settings.json for migration: {e}")
        return

    async with get_session() as session:
        # Migrate search_history using INSERT OR IGNORE for race safety
        # Dedupe legacy list (may contain duplicates from manual edits)
        # Use ordered UTC timestamps to preserve original list order
        if "search_history" in data:
            seen = set()
            unique_queries = []
            for q in data["search_history"]:
                if q and q not in seen:
                    seen.add(q)
                    unique_queries.append(q)

            base_time = datetime.utcnow()
            for i, query in enumerate(unique_queries[:10]):
                timestamp = base_time - timedelta(seconds=i)
                # INSERT OR IGNORE - if query exists, skip silently
                stmt = sqlite_insert(SearchHistoryDB).values(
                    query=query,
                    last_searched_at=timestamp.isoformat(),
                    search_count=1
                ).on_conflict_do_nothing(index_elements=["query"])
                await session.execute(stmt)

            logger.info(f"Migrated {len(unique_queries[:10])} search history entries")

        # Migrate app_settings using INSERT OR IGNORE for race safety
        for key, value in data.items():
            if key == "search_history":
                continue
            # INSERT OR IGNORE - if key exists, skip silently
            stmt = sqlite_insert(AppSettingsDB).values(
                key=key,
                value=json.dumps(value)
            ).on_conflict_do_nothing(index_elements=["key"])
            await session.execute(stmt)

        await session.commit()
        logger.info("Migration from settings.json completed")


async def close_db():
    """Close database connection."""
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None
        logger.info("Database connection closed")
