"""Repository for job CRUD operations."""

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update, delete

from app.database import get_session
from app.db_models import JobDB
from app.models import Job, JobStatus, JobType

logger = logging.getLogger(__name__)

# Terminal statuses for filtering completed jobs
TERMINAL_STATUSES = ["completed", "failed", "cancelled"]


def _db_to_job(row: JobDB) -> Job:
    """Convert DB row to Pydantic model."""
    return Job(
        id=row.id,
        type=JobType(row.type),
        status=JobStatus(row.status),
        identifier=row.identifier,
        filename=row.filename,
        destdir=row.destdir,
        progress=row.progress or 0.0,
        total_bytes=row.total_bytes,
        downloaded_bytes=row.downloaded_bytes,
        speed=row.speed,
        error=row.error,
        created_at=datetime.fromisoformat(row.created_at) if row.created_at else datetime.utcnow(),
        started_at=datetime.fromisoformat(row.started_at) if row.started_at else None,
        completed_at=datetime.fromisoformat(row.completed_at) if row.completed_at else None,
        # EXCLUDE: options_json (internal only)
    )


async def create_job(job: Job, options_json: Optional[str] = None) -> None:
    """Create a new job in the database."""
    async with get_session() as session:
        db_job = JobDB(
            id=job.id,
            type=job.type.value,
            status=job.status.value,
            identifier=job.identifier,
            filename=job.filename,
            destdir=job.destdir,
            progress=job.progress,
            total_bytes=job.total_bytes,
            downloaded_bytes=job.downloaded_bytes,
            speed=job.speed,
            error=job.error,
            options_json=options_json,
            created_at=job.created_at.isoformat() if job.created_at else datetime.utcnow().isoformat(),
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
        )
        session.add(db_job)
        await session.commit()
        logger.debug(f"Created job {job.id} in database")


async def update_job_status(
    job_id: str,
    status: JobStatus,
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
) -> None:
    """Update job status and related fields in database.

    Single update call for status transitions. All timestamps should be in UTC.
    """
    async with get_session() as session:
        update_data = {"status": status.value}
        if error is not None:
            update_data["error"] = error
        if started_at is not None:
            update_data["started_at"] = started_at.isoformat()
        if completed_at is not None:
            update_data["completed_at"] = completed_at.isoformat()

        await session.execute(
            update(JobDB).where(JobDB.id == job_id).values(**update_data)
        )
        await session.commit()
        logger.debug(f"Updated job {job_id} status to {status.value}")


async def get_job(job_id: str) -> Optional[Job]:
    """Get a job by ID from the database."""
    async with get_session() as session:
        result = await session.execute(
            select(JobDB).where(JobDB.id == job_id)
        )
        row = result.scalar_one_or_none()
        if row:
            return _db_to_job(row)
        return None


async def get_completed_jobs(limit: int = 50) -> list[Job]:
    """Get completed/failed/cancelled jobs from database, ordered by created_at DESC."""
    async with get_session() as session:
        result = await session.execute(
            select(JobDB)
            .where(JobDB.status.in_(TERMINAL_STATUSES))
            .order_by(JobDB.created_at.desc())
            .limit(limit)
        )
        return [_db_to_job(row) for row in result.scalars()]


async def mark_interrupted_jobs_failed() -> int:
    """Mark any 'running' or 'pending' jobs as 'failed' (interrupted by restart).

    Returns the count of jobs marked as failed.
    """
    async with get_session() as session:
        now = datetime.utcnow().isoformat()
        result = await session.execute(
            update(JobDB)
            .where(JobDB.status.in_(["running", "pending"]))
            .values(
                status="failed",
                error="Interrupted by restart",
                completed_at=now,
            )
        )
        await session.commit()
        count = result.rowcount
        if count > 0:
            logger.info(f"Marked {count} interrupted jobs as failed")
        return count


async def delete_completed_jobs() -> int:
    """Delete all completed/failed/cancelled jobs from database.

    Returns the count of deleted jobs.
    """
    async with get_session() as session:
        result = await session.execute(
            delete(JobDB).where(JobDB.status.in_(TERMINAL_STATUSES))
        )
        await session.commit()
        count = result.rowcount
        logger.info(f"Deleted {count} completed jobs from database")
        return count
