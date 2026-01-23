from fastapi import APIRouter, Query
from typing import Optional

from app.models import SearchResponse, SearchResult
from app.services.ia_service import IAService

router = APIRouter()
ia_service = IAService()


@router.get("", response_model=SearchResponse)
async def search_items(
    q: str = Query(..., description="Search query"),
    page: int = Query(1, ge=1, description="Page number"),
    rows: int = Query(20, ge=1, le=100, description="Results per page"),
    mediatype: Optional[str] = Query(None, description="Filter by media type"),
    collection: Optional[str] = Query(None, description="Filter by collection"),
    sort: Optional[str] = Query(None, description="Sort field"),
):
    """Search archive.org items."""
    # Build query with filters
    query = q
    if mediatype:
        query += f" AND mediatype:{mediatype}"
    if collection:
        query += f" AND collection:{collection}"
    
    results, total = ia_service.search(
        query=query,
        page=page,
        rows=rows,
        sort=sort
    )
    
    return SearchResponse(
        query=q,
        total=total,
        page=page,
        rows=rows,
        results=results
    )
