"""Repository for bookmark CRUD operations."""

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update, delete
from sqlalchemy.exc import IntegrityError

from app.database import get_session
from app.db_models import BookmarkDB
from app.models import Bookmark

logger = logging.getLogger(__name__)


def _db_to_model(row: BookmarkDB) -> Bookmark:
    """Convert DB row to Pydantic model with JSON decoding."""
    return Bookmark(
        id=row.id,
        identifier=row.identifier,
        title=row.title,
        description=row.description,
        mediatype=row.mediatype,
        thumbnail_url=row.thumbnail_url,
        notes=row.notes,
        tags=json.loads(row.tags) if row.tags else [],  # Decode JSON
        created_at=datetime.fromisoformat(row.created_at) if row.created_at else None,
    )


async def create(
    identifier: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    mediatype: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    notes: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Bookmark:
    """Create a new bookmark. Returns existing if already bookmarked (idempotent)."""
    async with get_session() as session:
        try:
            bookmark = BookmarkDB(
                identifier=identifier,
                title=title,
                description=description,
                mediatype=mediatype,
                thumbnail_url=thumbnail_url,
                notes=notes,
                tags=json.dumps(tags) if tags else None,  # Encode on write
                created_at=datetime.utcnow().isoformat(),
            )
            session.add(bookmark)
            await session.commit()
            await session.refresh(bookmark)
            logger.info(f"Created bookmark for {identifier}")
            return _db_to_model(bookmark)
        except IntegrityError:
            # Race condition: bookmark was created between check and insert
            await session.rollback()
            existing = await get_by_identifier(identifier)
            if existing:
                return existing
            raise


async def get_all() -> list[Bookmark]:
    """Get all bookmarks, ordered by created_at DESC."""
    async with get_session() as session:
        result = await session.execute(
            select(BookmarkDB).order_by(BookmarkDB.created_at.desc())
        )
        return [_db_to_model(row) for row in result.scalars()]


async def get_by_identifier(identifier: str) -> Optional[Bookmark]:
    """Get a bookmark by identifier."""
    async with get_session() as session:
        row = await session.scalar(
            select(BookmarkDB).where(BookmarkDB.identifier == identifier)
        )
        return _db_to_model(row) if row else None


async def update_bookmark(
    identifier: str,
    notes: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> Optional[Bookmark]:
    """Update a bookmark's notes and/or tags. Returns updated bookmark or None if not found."""
    async with get_session() as session:
        # Build update dict - only include fields that were provided
        update_data = {}
        if notes is not None:
            update_data["notes"] = notes
        if tags is not None:
            update_data["tags"] = json.dumps(tags)

        if not update_data:
            # Nothing to update, just return current
            return await get_by_identifier(identifier)

        result = await session.execute(
            update(BookmarkDB)
            .where(BookmarkDB.identifier == identifier)
            .values(**update_data)
        )
        await session.commit()

        if result.rowcount == 0:
            return None

        return await get_by_identifier(identifier)


async def delete_bookmark(identifier: str) -> bool:
    """Delete a bookmark by identifier. Returns True if deleted, False if not found."""
    async with get_session() as session:
        result = await session.execute(
            delete(BookmarkDB).where(BookmarkDB.identifier == identifier)
        )
        await session.commit()
        deleted = result.rowcount > 0
        if deleted:
            logger.info(f"Deleted bookmark for {identifier}")
        return deleted
