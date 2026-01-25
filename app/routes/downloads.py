from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse
from typing import Optional
import asyncio
import json

from app.models import DownloadRequest, Job, JobStatus
from app.services.job_manager import job_manager
from app.repositories import job_repository

router = APIRouter()


@router.post("", response_model=Job)
async def start_download(request: DownloadRequest):
    """Start a new download job."""
    job = await job_manager.create_download_job(
        identifier=request.identifier,
        files=request.files,
        glob=request.glob,
        format=request.format,
        destdir=request.destdir,
        # New download options
        ignore_existing=request.ignore_existing,
        checksum=request.checksum,
        retries=request.retries,
        timeout=request.timeout,
        no_directories=request.no_directories,
        no_change_timestamp=request.no_change_timestamp,
        source=request.source,
        exclude_source=request.exclude_source,
        on_the_fly=request.on_the_fly,
        exclude=request.exclude,
    )
    return job


@router.get("", response_model=list[Job])
async def list_downloads(
    status: Optional[JobStatus] = None,
    limit: int = 50
):
    """List download jobs.

    Returns all active jobs from memory plus up to `limit` historical jobs from DB.
    Active jobs are always included (even if they exceed the limit).
    """
    # Get ALL active jobs from memory (usually few, always returned)
    active = job_manager.get_download_jobs()  # sync, memory only

    # Get history from DB with limit (separate from active count)
    history = await job_repository.get_completed_jobs(limit=limit)

    # Apply status filter if requested
    if status:
        active = [j for j in active if j.status == status]
        history = [j for j in history if j.status == status]

    # Return all active + limited history
    # Active jobs always shown; history capped by limit
    all_jobs = active + history
    all_jobs.sort(key=lambda j: j.created_at, reverse=True)
    return all_jobs


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
    # Check memory first (active job)
    job = job_manager.get_job(job_id)
    if job:
        return job

    # Fall back to DB (historical job)
    job = await job_repository.get_job(job_id)
    if job:
        return job

    raise HTTPException(status_code=404, detail="Job not found")


@router.delete("/{job_id}")
async def cancel_download(job_id: str):
    """Cancel a download job."""
    success = await job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found or already completed")
    return {"success": True, "message": "Download cancelled"}


@router.delete("")
async def clear_downloads():
    """Clear all completed/failed/cancelled downloads from history."""
    # Clear from memory (handles any edge cases)
    job_manager.clear_completed_jobs()

    # Clear from DB
    count = await job_repository.delete_completed_jobs()
    return {"success": True, "cleared": count}
