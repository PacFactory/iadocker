import asyncio
import uuid
from datetime import datetime
from typing import Optional
from collections import defaultdict
import os

from app.models import Job, JobStatus, JobType
from app.services.ia_service import IAService
from app.config import settings


class JobManager:
    """Manages download jobs with background processing."""
    
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._download_subscribers: list[asyncio.Queue] = []
        self._running_downloads: set[str] = set()
        self._cancelled: set[str] = set()
        self._ia_service = IAService()
        self._lock = asyncio.Lock()
        self._max_concurrent_downloads = self._load_max_concurrent()
    
    def _load_max_concurrent(self) -> int:
        """Load max concurrent downloads from settings file."""
        import json
        from pathlib import Path
        settings_file = Path("/config/settings.json")
        if settings_file.exists():
            try:
                with open(settings_file, "r") as f:
                    data = json.load(f)
                    return data.get("max_concurrent_downloads", settings.max_concurrent_downloads)
            except:
                pass
        return settings.max_concurrent_downloads
    
    def set_max_concurrent_downloads(self, value: int):
        """Update max concurrent downloads at runtime."""
        self._max_concurrent_downloads = max(1, min(10, value))  # Clamp 1-10
    
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
        
        # Notify about new job immediately
        await self._notify_download_progress(job)
        
        # Start processing in background
        asyncio.create_task(self._process_download(job, files, glob, format))
        
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
        while len(self._running_downloads) >= self._max_concurrent_downloads:
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
        
        # Start progress monitor task
        progress_task = asyncio.create_task(
            self._monitor_progress(job, files)
        )
        
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
            # Stop progress monitor
            progress_task.cancel()
            try:
                await progress_task
            except asyncio.CancelledError:
                pass
            
            async with self._lock:
                self._running_downloads.discard(job_id)
        
        await self._notify_download_progress(job)
    
    async def _monitor_progress(self, job: Job, files: Optional[list[str]]):
        """Monitor download progress by checking file sizes."""
        import time
        
        try:
            download_dir = settings.download_path / job.identifier
            expected_size = 0
            
            # Try to get expected size from item metadata
            try:
                item = self._ia_service.get_item(job.identifier)
                if item and item.files:
                    if files:
                        # Sum sizes of requested files
                        for f in item.files:
                            if f.name in files and f.size:
                                expected_size += f.size
                    else:
                        # Sum all file sizes
                        for f in item.files:
                            if f.size:
                                expected_size += f.size
            except:
                pass
            
            job.total_bytes = expected_size if expected_size > 0 else None
            
            last_progress = 0
            last_size = 0
            last_time = time.time()
            
            while job.status == JobStatus.RUNNING:
                await asyncio.sleep(1)  # Check every 1 second for smoother updates
                
                if job.status != JobStatus.RUNNING:
                    break
                
                # Calculate current downloaded size
                current_size = 0
                if download_dir.exists():
                    for root, dirs, filenames in os.walk(download_dir):
                        for f in filenames:
                            try:
                                current_size += os.path.getsize(os.path.join(root, f))
                            except:
                                pass
                
                current_time = time.time()
                time_delta = current_time - last_time
                
                # Calculate speed (bytes per second)
                if time_delta > 0:
                    bytes_delta = current_size - last_size
                    speed = bytes_delta / time_delta
                    job.speed = max(0, speed)  # Ensure non-negative
                
                job.downloaded_bytes = current_size
                
                # Calculate progress percentage
                if expected_size > 0:
                    progress = min(99, (current_size / expected_size) * 100)
                else:
                    # If we don't know expected size, show indeterminate progress
                    progress = min(95, last_progress + 2)
                
                # Only notify if progress changed
                if abs(progress - last_progress) >= 1 or abs(current_size - last_size) > 1024 * 100:
                    job.progress = round(progress, 1)
                    await self._notify_download_progress(job)
                    last_progress = progress
                
                last_size = current_size
                last_time = current_time
        
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Progress monitor error: {e}")
    
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
    
    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job."""
        job = self._jobs.get(job_id)
        if not job or job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            return False
        
        async with self._lock:
            self._cancelled.add(job_id)
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now()
        
        await self._notify_download_progress(job)
        return True
    
    def clear_completed_jobs(self) -> int:
        """Clear all completed, failed, and cancelled jobs. Returns count cleared."""
        to_remove = [
            job_id for job_id, job in self._jobs.items()
            if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]
        ]
        for job_id in to_remove:
            del self._jobs[job_id]
        return len(to_remove)
    
    def subscribe_downloads(self) -> asyncio.Queue:
        """Subscribe to download progress updates."""
        queue = asyncio.Queue()
        self._download_subscribers.append(queue)
        return queue
    
    def unsubscribe_downloads(self, queue: asyncio.Queue):
        """Unsubscribe from download progress updates."""
        if queue in self._download_subscribers:
            self._download_subscribers.remove(queue)
    
    async def _notify_download_progress(self, job: Job):
        """Notify subscribers of download progress."""
        event = job.model_dump(mode="json")
        for queue in self._download_subscribers:
            try:
                await queue.put(event)
            except:
                pass


# Global job manager instance
job_manager = JobManager()
