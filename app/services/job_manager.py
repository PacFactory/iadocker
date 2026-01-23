import asyncio
import uuid
from datetime import datetime
from typing import Optional
from collections import defaultdict
from fastapi import UploadFile
import tempfile
import os

from app.models import Job, JobStatus, JobType
from app.services.ia_service import IAService
from app.config import settings


class JobManager:
    """Manages download and upload jobs with background processing."""
    
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._download_subscribers: list[asyncio.Queue] = []
        self._upload_subscribers: list[asyncio.Queue] = []
        self._running_downloads: set[str] = set()
        self._running_uploads: set[str] = set()
        self._cancelled: set[str] = set()
        self._ia_service = IAService()
        self._lock = asyncio.Lock()
    
    async def create_download_job(
        self,
        identifier: str,
        files: Optional[list[str]] = None,
        glob: Optional[str] = None,
        format: Optional[str] = None,
    ) -> Job:
        """Create a new download job."""
        job_id = str(uuid.uuid4())[:8]
        
        job = Job(
            id=job_id,
            type=JobType.DOWNLOAD,
            status=JobStatus.PENDING,
            identifier=identifier,
            filename=files[0] if files and len(files) == 1 else None,
        )
        
        async with self._lock:
            self._jobs[job_id] = job
        
        # Start processing in background
        asyncio.create_task(self._process_download(job, files, glob, format))
        
        return job
    
    async def create_upload_job(
        self,
        identifier: str,
        files: list[UploadFile],
        metadata: dict[str, str],
    ) -> Job:
        """Create a new upload job."""
        job_id = str(uuid.uuid4())[:8]
        
        job = Job(
            id=job_id,
            type=JobType.UPLOAD,
            status=JobStatus.PENDING,
            identifier=identifier,
            filename=files[0].filename if files else None,
        )
        
        async with self._lock:
            self._jobs[job_id] = job
        
        # Start processing in background
        asyncio.create_task(self._process_upload(job, files, metadata))
        
        return job
    
    async def _process_download(
        self,
        job: Job,
        files: Optional[list[str]],
        glob: Optional[str],
        format: Optional[str],
    ):
        """Process a download job."""
        job_id = job.id
        
        # Wait if at max concurrent downloads
        while len(self._running_downloads) >= settings.max_concurrent_downloads:
            await asyncio.sleep(0.5)
            if job_id in self._cancelled:
                return
        
        async with self._lock:
            if job_id in self._cancelled:
                return
            self._running_downloads.add(job_id)
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now()
        
        await self._notify_download_progress(job)
        
        try:
            # Run download in thread pool (blocking I/O)
            loop = asyncio.get_event_loop()
            
            if files:
                for filename in files:
                    if job_id in self._cancelled:
                        break
                    success = await loop.run_in_executor(
                        None,
                        lambda: self._ia_service.download_file(
                            job.identifier,
                            filename,
                        )
                    )
                    if not success:
                        raise Exception(f"Failed to download {filename}")
            else:
                success = await loop.run_in_executor(
                    None,
                    lambda: self._ia_service.download_item(
                        job.identifier,
                        glob=glob,
                        format=format,
                    )
                )
                if not success:
                    raise Exception("Download failed")
            
            if job_id not in self._cancelled:
                job.status = JobStatus.COMPLETED
                job.progress = 100.0
                job.completed_at = datetime.now()
        
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.now()
        
        finally:
            async with self._lock:
                self._running_downloads.discard(job_id)
        
        await self._notify_download_progress(job)
    
    async def _process_upload(
        self,
        job: Job,
        files: list[UploadFile],
        metadata: dict[str, str],
    ):
        """Process an upload job."""
        job_id = job.id
        
        # Wait if at max concurrent uploads
        while len(self._running_uploads) >= settings.max_concurrent_uploads:
            await asyncio.sleep(0.5)
            if job_id in self._cancelled:
                return
        
        async with self._lock:
            if job_id in self._cancelled:
                return
            self._running_uploads.add(job_id)
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now()
        
        await self._notify_upload_progress(job)
        
        try:
            from internetarchive import upload
            
            # Save uploaded files to temp directory
            temp_files = []
            for upload_file in files:
                temp_path = os.path.join(tempfile.gettempdir(), upload_file.filename)
                with open(temp_path, "wb") as f:
                    content = await upload_file.read()
                    f.write(content)
                temp_files.append(temp_path)
            
            # Run upload in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: upload(
                    job.identifier,
                    files=temp_files,
                    metadata=metadata,
                    config_file=settings.ia_config_file,
                )
            )
            
            # Cleanup temp files
            for temp_path in temp_files:
                try:
                    os.remove(temp_path)
                except:
                    pass
            
            if job_id not in self._cancelled:
                job.status = JobStatus.COMPLETED
                job.progress = 100.0
                job.completed_at = datetime.now()
        
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error = str(e)
            job.completed_at = datetime.now()
        
        finally:
            async with self._lock:
                self._running_uploads.discard(job_id)
        
        await self._notify_upload_progress(job)
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Get a job by ID."""
        return self._jobs.get(job_id)
    
    def get_download_jobs(
        self,
        status: Optional[JobStatus] = None,
        limit: int = 50
    ) -> list[Job]:
        """Get download jobs, optionally filtered by status."""
        jobs = [j for j in self._jobs.values() if j.type == JobType.DOWNLOAD]
        if status:
            jobs = [j for j in jobs if j.status == status]
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)[:limit]
    
    def get_upload_jobs(
        self,
        status: Optional[JobStatus] = None,
        limit: int = 50
    ) -> list[Job]:
        """Get upload jobs, optionally filtered by status."""
        jobs = [j for j in self._jobs.values() if j.type == JobType.UPLOAD]
        if status:
            jobs = [j for j in jobs if j.status == status]
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)[:limit]
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job."""
        job = self._jobs.get(job_id)
        if not job or job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            return False
        
        async with self._lock:
            self._cancelled.add(job_id)
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now()
        
        if job.type == JobType.DOWNLOAD:
            await self._notify_download_progress(job)
        else:
            await self._notify_upload_progress(job)
        
        return True
    
    def subscribe_downloads(self) -> asyncio.Queue:
        """Subscribe to download progress updates."""
        queue = asyncio.Queue()
        self._download_subscribers.append(queue)
        return queue
    
    def unsubscribe_downloads(self, queue: asyncio.Queue):
        """Unsubscribe from download progress updates."""
        if queue in self._download_subscribers:
            self._download_subscribers.remove(queue)
    
    def subscribe_uploads(self) -> asyncio.Queue:
        """Subscribe to upload progress updates."""
        queue = asyncio.Queue()
        self._upload_subscribers.append(queue)
        return queue
    
    def unsubscribe_uploads(self, queue: asyncio.Queue):
        """Unsubscribe from upload progress updates."""
        if queue in self._upload_subscribers:
            self._upload_subscribers.remove(queue)
    
    async def _notify_download_progress(self, job: Job):
        """Notify subscribers of download progress."""
        event = job.model_dump(mode="json")
        for queue in self._download_subscribers:
            await queue.put(event)
    
    async def _notify_upload_progress(self, job: Job):
        """Notify subscribers of upload progress."""
        event = job.model_dump(mode="json")
        for queue in self._upload_subscribers:
            await queue.put(event)


# Global job manager instance
job_manager = JobManager()
