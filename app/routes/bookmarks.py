"""Bookmarks API endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.models import Bookmark, BookmarkCreate, BookmarkUpdate
from app.repositories import bookmark_repository
from app.services.ia_service import IAService

router = APIRouter()
logger = logging.getLogger(__name__)

# Shared IA service instance
_ia_service = IAService()


def _normalize_text(value, max_length: int = 500) -> Optional[str]:
    """Normalize IA metadata value to string (can be list, string, or None)."""
    if value is None:
        return None
    if isinstance(value, list):
        # Take first element if list (common for IA metadata)
        value = value[0] if value else None
        if value is None:
            return None
    return str(value)[:max_length]


@router.get("", response_model=list[Bookmark])
async def list_bookmarks():
    """List all bookmarks."""
    return await bookmark_repository.get_all()


@router.post("", response_model=Bookmark)
async def create_bookmark(data: BookmarkCreate):
    """Create a new bookmark.

    Fetches metadata from Internet Archive and caches it.
    Returns existing bookmark if already bookmarked (idempotent).
    """
    # Check if already bookmarked - return existing (idempotent)
    existing = await bookmark_repository.get_by_identifier(data.identifier)
    if existing:
        return existing

    # Fetch metadata from IA
    title = data.identifier
    description = None
    mediatype = None

    try:
        item = _ia_service.get_item(data.identifier)
        if item:
            title = _normalize_text(item.metadata.get("title"), max_length=500) or data.identifier
            description = _normalize_text(item.metadata.get("description"), max_length=500)
            mediatype = _normalize_text(item.metadata.get("mediatype"), max_length=50)
    except Exception as e:
        logger.warning(f"Failed to fetch metadata for {data.identifier}: {e}")

    bookmark = await bookmark_repository.create(
        identifier=data.identifier,
        title=title,
        description=description,
        mediatype=mediatype,
        thumbnail_url=f"https://archive.org/services/img/{data.identifier}",
        notes=data.notes,
        tags=data.tags if data.tags else None,
    )
    return bookmark


@router.get("/{identifier}", response_model=Bookmark)
async def get_bookmark(identifier: str):
    """Get a specific bookmark by identifier."""
    bookmark = await bookmark_repository.get_by_identifier(identifier)
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return bookmark


@router.put("/{identifier}", response_model=Bookmark)
async def update_bookmark(identifier: str, data: BookmarkUpdate):
    """Update a bookmark's notes and/or tags.

    Metadata (title, description, etc.) is immutable - only notes and tags can be updated.
    """
    bookmark = await bookmark_repository.update_bookmark(
        identifier=identifier,
        notes=data.notes,
        tags=data.tags,
    )
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return bookmark


@router.delete("/{identifier}")
async def delete_bookmark(identifier: str):
    """Delete a bookmark."""
    deleted = await bookmark_repository.delete_bookmark(identifier)
    if not deleted:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return {"success": True, "message": "Bookmark deleted"}
