from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sse_starlette.sse import EventSourceResponse
from typing import Optional
import asyncio
import json

from app.models import UploadRequest, Job, JobStatus
from app.services.job_manager import job_manager

router = APIRouter()


@router.post("", response_model=Job)
async def start_upload(
    identifier: str = Form(...),
    files: list[UploadFile] = File(...),
    mediatype: Optional[str] = Form(None),
    collection: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
):
    """Start a new upload job."""
    metadata = {}
    if mediatype:
        metadata["mediatype"] = mediatype
    if collection:
        metadata["collection"] = collection
    if title:
        metadata["title"] = title
    if description:
        metadata["description"] = description
    
    job = await job_manager.create_upload_job(
        identifier=identifier,
        files=files,
        metadata=metadata
    )
    return job


@router.get("", response_model=list[Job])
async def list_uploads(
    status: Optional[JobStatus] = None,
    limit: int = 50
):
    """List upload jobs."""
    jobs = job_manager.get_upload_jobs(status=status, limit=limit)
    return jobs


@router.get("/events")
async def upload_events():
    """SSE stream for upload progress updates."""
    async def event_generator():
        queue = job_manager.subscribe_uploads()
        try:
            while True:
                event = await queue.get()
                yield {
                    "event": "progress",
                    "data": json.dumps(event)
                }
        except asyncio.CancelledError:
            pass
        finally:
            job_manager.unsubscribe_uploads(queue)
    
    return EventSourceResponse(event_generator())


@router.get("/{job_id}", response_model=Job)
async def get_upload(job_id: str):
    """Get a specific upload job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}")
async def cancel_upload(job_id: str):
    """Cancel an upload job."""
    success = await job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or already completed")
    return {"success": True, "message": "Upload cancelled"}
