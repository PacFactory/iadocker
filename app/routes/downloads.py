from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from typing import Optional
import asyncio
import json

from app.models import DownloadRequest, Job, JobStatus
from app.services.job_manager import job_manager

router = APIRouter()


@router.post("", response_model=Job)
async def start_download(request: DownloadRequest):
    """Start a new download job."""
    job = await job_manager.create_download_job(
        identifier=request.identifier,
        files=request.files,
        glob=request.glob,
        format=request.format
    )
    return job


@router.get("", response_model=list[Job])
async def list_downloads(
    status: Optional[JobStatus] = None,
    limit: int = 50
):
    """List download jobs."""
    jobs = job_manager.get_download_jobs(status=status, limit=limit)
    return jobs


@router.get("/events")
async def download_events():
    """SSE stream for download progress updates."""
    async def event_generator():
        queue = job_manager.subscribe_downloads()
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
            job_manager.unsubscribe_downloads(queue)
    
    return EventSourceResponse(event_generator())


@router.get("/{job_id}", response_model=Job)
async def get_download(job_id: str):
    """Get a specific download job."""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}")
async def cancel_download(job_id: str):
    """Cancel a download job."""
    success = await job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or already completed")
    return {"success": True, "message": "Download cancelled"}
