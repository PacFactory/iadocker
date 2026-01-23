from fastapi import APIRouter, HTTPException
from typing import Optional

from app.models import Item, ItemFile
from app.services.ia_service import IAService

router = APIRouter()
ia_service = IAService()


@router.get("/{identifier}", response_model=Item)
async def get_item(identifier: str):
    """Get item metadata and file list."""
    try:
        item = ia_service.get_item(identifier)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        return item
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{identifier}/files", response_model=list[ItemFile])
async def get_item_files(
    identifier: str,
    format: Optional[str] = None,
    source: Optional[str] = None,
):
    """Get list of files in an item."""
    try:
        item = ia_service.get_item(identifier)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        files = item.files
        
        # Filter by format if specified
        if format:
            files = [f for f in files if f.format == format]
        
        # Filter by source if specified
        if source:
            files = [f for f in files if f.source == source]
        
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
