"""Repository for settings and search history CRUD operations."""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import select, delete
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.database import get_session
from app.db_models import AppSettingsDB, SearchHistoryDB
from app.settings_defaults import DEFAULT_SETTINGS, DOWNLOAD_SETTING_KEYS

logger = logging.getLogger(__name__)


async def get_settings() -> dict:
    """Get all settings merged with defaults, plus search_history from table."""
    # Start with defaults (excluding search_history which comes from its own table)
    result = DEFAULT_SETTINGS.copy()

    async with get_session() as session:
        # Overlay DB values
        rows = await session.execute(select(AppSettingsDB))
        for row in rows.scalars():
            try:
                result[row.key] = json.loads(row.value)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON for setting {row.key}")

        # Add search_history from dedicated table, sorted by last_searched_at DESC
        history_rows = await session.execute(
            select(SearchHistoryDB)
            .order_by(SearchHistoryDB.last_searched_at.desc())
            .limit(10)
        )
        result["search_history"] = [row.query for row in history_rows.scalars()]

    return result


async def get_setting(key: str, default: Any = None) -> Any:
    """Get a single setting value, JSON-decoded."""
    async with get_session() as session:
        row = await session.scalar(
            select(AppSettingsDB).where(AppSettingsDB.key == key)
        )
        if row:
            try:
                return json.loads(row.value)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON for setting {key}")
        return default


async def set_setting(key: str, value: Any) -> None:
    """Set a single setting value, JSON-encoded. Uses upsert for atomicity."""
    async with get_session() as session:
        stmt = sqlite_insert(AppSettingsDB).values(
            key=key,
            value=json.dumps(value)
        ).on_conflict_do_update(
            index_elements=['key'],
            set_={'value': json.dumps(value)}
        )
        await session.execute(stmt)
        await session.commit()


async def get_download_defaults() -> dict:
    """Get only download-related settings (single DB query for efficiency).

    This is used by JobManager to get defaults without loading search_history.
    """
    # Start with defaults for download-related keys
    result = {k: DEFAULT_SETTINGS.get(k) for k in DOWNLOAD_SETTING_KEYS}

    async with get_session() as session:
        # Single query to fetch all download-related keys
        rows = await session.execute(
            select(AppSettingsDB).where(AppSettingsDB.key.in_(DOWNLOAD_SETTING_KEYS))
        )
        for row in rows.scalars():
            try:
                value = json.loads(row.value)
                # Treat JSON null as "unset" for keys with concrete defaults
                # (timeout legitimately allows None)
                if value is None and row.key != "timeout":
                    continue
                result[row.key] = value
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON for setting {row.key}")

    return result


async def sync_search_history(queries: list[str]) -> None:
    """Sync search history - UI list is authoritative, max 10.

    Dedupes silently, preserves order via distinct UTC timestamps.
    Uses single transaction (delete+insert) to avoid race conditions.
    search_count is reset to 1 on sync (counter vestigial, kept for future analytics).
    """
    async with get_session() as session:
        # Single transaction: delete all then insert new
        await session.execute(delete(SearchHistoryDB))

        # Dedupe while preserving order (first occurrence wins)
        seen = set()
        unique_queries = []
        for q in queries:
            if q and q not in seen:
                seen.add(q)
                unique_queries.append(q)

        # Insert with distinct UTC timestamps to preserve order
        base_time = datetime.utcnow()
        for i, query in enumerate(unique_queries[:10]):
            timestamp = base_time - timedelta(seconds=i)
            session.add(SearchHistoryDB(
                query=query,
                last_searched_at=timestamp.isoformat(),
                search_count=1
            ))

        await session.commit()
        logger.debug(f"Synced {len(unique_queries[:10])} search history entries")
