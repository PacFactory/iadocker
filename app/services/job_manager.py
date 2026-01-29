import asyncio
import json
import logging
import multiprocessing
import uuid
from datetime import datetime
from typing import Optional
import os
import shutil
from pathlib import Path

from app.models import Job, JobStatus, JobType
from app.services.ia_service import IAService
from app.services.download_worker import run_download_worker
from app.config import settings
from app.settings_defaults import DEFAULT_SETTINGS

logger = logging.getLogger(__name__)

# Terminal statuses - jobs in these states are removed from memory
TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}


class JobManager:
    """Manages download jobs with background processing and DB persistence."""

    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._download_subscribers: list[asyncio.Queue] = []
        self._running_downloads: set[str] = set()
        self._cancelled: set[str] = set()
        self._download_processes: dict[str, multiprocessing.Process] = {}
        self._mp_context = multiprocessing.get_context("spawn")
        self._ia_service = IAService()
        self._lock = asyncio.Lock()
        # Initialize to default - will be overridden by initialize_from_db()
        self._max_concurrent_downloads = DEFAULT_SETTINGS["max_concurrent_downloads"]
        self._db_initialized = False

    async def initialize_from_db(self):
        """Called once from startup event after init_db().

        - Marks any 'running' jobs as 'failed' (interrupted by restart)
        - Reloads max_concurrent_downloads from DB
        """
        if self._db_initialized:
            return

        from app.repositories import job_repository, settings_repository

        # Mark any 'running' jobs as 'failed' (interrupted by restart)
        await job_repository.mark_interrupted_jobs_failed()

        # Reload max_concurrent_downloads from DB
        self._max_concurrent_downloads = await settings_repository.get_setting(
            "max_concurrent_downloads",
            default=DEFAULT_SETTINGS["max_concurrent_downloads"]
        )

        self._db_initialized = True
        logger.info(f"JobManager initialized: max_concurrent_downloads={self._max_concurrent_downloads}")

    def set_max_concurrent_downloads(self, value: int):
        """Update max concurrent downloads at runtime."""
        self._max_concurrent_downloads = max(1, min(10, value))  # Clamp 1-10

    def _validate_destdir(self, destdir: Optional[str]) -> Optional[str]:
        """Validate and sanitize destdir to prevent path traversal."""
        if not destdir:
            return None

        # Remove leading/trailing slashes and normalize
        clean_path = destdir.strip().strip('/')

        # Reject any path traversal attempts
        if '..' in clean_path or clean_path.startswith('/'):
            return None

        # Build full path and verify it's within /data
        from pathlib import Path
        base_path = Path(settings.download_dir).resolve()
        full_path = (base_path / clean_path).resolve()

        # Ensure the resolved path is still under /data
        try:
            full_path.relative_to(base_path)
            return str(full_path)
        except ValueError:
            return None

    async def _on_job_state_transition(self, job: Job, new_status: JobStatus):
        """Called when job status changes. Persists to DB, removes from memory if terminal.

        WARNING: Do NOT call this while holding self._lock - deadlock risk!
        """
        from app.repositories import job_repository

        # Idempotency guard: no-op if already at this status or already terminal
        if job.status == new_status:
            return
        if job.status in TERMINAL_STATUSES:
            return

        job.status = new_status

        # Build single update with all relevant fields for this transition
        if new_status == JobStatus.RUNNING:
            job.started_at = datetime.utcnow()
            await job_repository.update_job_status(
                job.id, new_status, started_at=job.started_at
            )
        elif new_status in TERMINAL_STATUSES:
            job.completed_at = datetime.utcnow()
            await job_repository.update_job_status(
                job.id, new_status, error=job.error, completed_at=job.completed_at
            )
            # Remove from memory (acquires lock)
            # NOTE: Don't clear _cancelled here - let _process_download do it in finally
            # to avoid race where cancelled flag is cleared before download loop exits
            async with self._lock:
                self._jobs.pop(job.id, None)
        else:
            await job_repository.update_job_status(job.id, new_status)

        await self._notify_download_progress(job)

    async def create_download_job(
        self,
        identifier: str,
        files: Optional[list[str]] = None,
        glob: Optional[str] = None,
        format: Optional[str] = None,
        destdir: Optional[str] = None,
        # Download options
        ignore_existing: Optional[bool] = None,
        checksum: Optional[bool] = None,
        retries: Optional[int] = None,
        timeout: Optional[int] = None,
        no_directories: Optional[bool] = None,
        no_change_timestamp: Optional[bool] = None,
        source: Optional[list[str]] = None,
        exclude_source: Optional[list[str]] = None,
        on_the_fly: Optional[bool] = None,
        exclude: Optional[str] = None,
    ) -> Job:
        """Create a new download job."""
        from fastapi import HTTPException
        from app.repositories import job_repository, settings_repository

        job_id = str(uuid.uuid4())[:8]

        # Validate and resolve destdir
        validated_destdir = self._validate_destdir(destdir)

        # Load only download-related defaults from DB (excludes search_history)
        defaults = await settings_repository.get_download_defaults()

        # Merge options with defaults (per-download overrides settings)
        download_options = {
            "ignore_existing": ignore_existing if ignore_existing is not None else defaults.get("ignore_existing", True),
            "checksum": checksum if checksum is not None else defaults.get("checksum", False),
            "retries": retries if retries is not None else defaults.get("retries", 5),
            "timeout": timeout if timeout is not None else defaults.get("timeout"),
            "no_directories": no_directories if no_directories is not None else True,
            "no_change_timestamp": no_change_timestamp if no_change_timestamp is not None else defaults.get("no_change_timestamp", False),
            "source": source,
            "exclude_source": exclude_source,
            "on_the_fly": on_the_fly if on_the_fly is not None else defaults.get("on_the_fly", False),
            "exclude": exclude,
        }

        job = Job(
            id=job_id,
            type=JobType.DOWNLOAD,
            status=JobStatus.PENDING,
            identifier=identifier,
            filename=files[0] if files and len(files) == 1 else None,
            destdir=validated_destdir,
            created_at=datetime.utcnow(),
        )

        # Insert to DB first - abort if this fails
        try:
            await job_repository.create_job(job, options_json=json.dumps(download_options))
        except Exception as e:
            logger.error(f"Failed to create job in DB: {e}")
            raise HTTPException(status_code=500, detail="Failed to create download job")

        # Only add to memory and start download after successful DB insert
        async with self._lock:
            self._jobs[job_id] = job

        # Notify about new job immediately
        await self._notify_download_progress(job)

        # Start processing in background
        asyncio.create_task(self._process_download(job, files, glob, format, download_options))

        return job

    async def _process_download(
        self,
        job: Job,
        files: Optional[list[str]],
        glob: Optional[str],
        format: Optional[str],
        download_options: dict,
    ):
        """Process a download job."""
        # Use custom destdir if set, otherwise default
        destdir = job.destdir
        job_id = job.id
        no_directories = download_options.get("no_directories", False)

        base_dir = Path(destdir) if destdir else settings.download_path
        try:
            base_dir = base_dir.resolve()
        except Exception:
            base_dir = Path(destdir) if destdir else settings.download_path

        staging_dir: Optional[Path] = None
        staging_placeholders: set[str] = set()
        process_started = False
        cleanup_done = False

        def is_cancelled():
            """Check if job was cancelled - uses status as authoritative source."""
            return job_id in self._cancelled or job.status in TERMINAL_STATUSES

        async def cleanup_cancelled():
            nonlocal cleanup_done
            if cleanup_done:
                return
            if process_started or staging_dir is not None:
                await self._cleanup_cancelled_download(
                    job,
                    files,
                    download_options,
                    staging_dir=staging_dir,
                )
            async with self._lock:
                self._cancelled.discard(job_id)
            cleanup_done = True

        # Wait if at max concurrent downloads - check cancellation while waiting
        while len(self._running_downloads) >= self._max_concurrent_downloads:
            await asyncio.sleep(0.5)
            if is_cancelled():
                # Job already transitioned to terminal state by cancel_job()
                await cleanup_cancelled()
                return

        # Check cancel + add to running set (lock scope minimal)
        async with self._lock:
            if is_cancelled():
                should_cancel = True
            else:
                should_cancel = False
                self._running_downloads.add(job_id)

        # Handle cancel OUTSIDE lock
        if should_cancel:
            # Job already transitioned to terminal state by cancel_job()
            await cleanup_cancelled()
            return

        # Re-check cancellation BEFORE RUNNING to avoid race:
        # cancel_job() could have set _cancelled between lock release and this point
        if is_cancelled():
            async with self._lock:
                self._running_downloads.discard(job_id)
                self._cancelled.discard(job_id)
            return

        # Transition to RUNNING immediately after adding to running set (outside lock)
        await self._on_job_state_transition(job, JobStatus.RUNNING)

        progress_task: Optional[asyncio.Task] = None
        process: Optional[multiprocessing.Process] = None
        result_queue: Optional[multiprocessing.Queue] = None
        had_exception = False

        try:
            worker_destdir = destdir
            progress_root: Optional[Path] = None

            try:
                staging_dir = self._create_staging_dir(base_dir, job_id)
            except Exception as e:
                raise RuntimeError(f"Failed to prepare staging directory: {e}") from e

            if download_options.get("ignore_existing", True):
                staging_placeholders = self._populate_staging_placeholders(
                    staging_dir,
                    base_dir,
                    files,
                    job.identifier,
                    no_directories,
                )

            worker_destdir = str(staging_dir)
            progress_root = staging_dir

            # Start progress monitor task
            progress_task = asyncio.create_task(
                self._monitor_progress(job, files, download_options, download_root=progress_root)
            )
            payload = {
                "identifier": job.identifier,
                "files": files,
                "glob": glob,
                "format": format,
                "destdir": worker_destdir,
                "download_options": download_options,
            }

            if is_cancelled():
                await cleanup_cancelled()
                return

            result_queue = self._mp_context.Queue()
            process = self._mp_context.Process(
                target=run_download_worker,
                args=(payload, result_queue),
                daemon=True,
            )

            async with self._lock:
                self._download_processes[job_id] = process

            if is_cancelled():
                async with self._lock:
                    self._download_processes.pop(job_id, None)
                await cleanup_cancelled()
                return

            process.start()
            process_started = True

            while process.is_alive():
                if is_cancelled():
                    await self._terminate_process(process)
                    await cleanup_cancelled()
                    return
                await asyncio.sleep(0.5)

            try:
                process.join(timeout=0)
            except Exception:
                pass

            if is_cancelled():
                await cleanup_cancelled()
                return

            result = None
            if result_queue is not None:
                try:
                    result = result_queue.get_nowait()
                except Exception:
                    result = None

            success = process.exitcode == 0
            error_message = None
            if result is not None:
                success = result.get("success", success)
                error_message = result.get("error")

            if success:
                if is_cancelled():
                    await cleanup_cancelled()
                    return

                if staging_dir:
                    loop = asyncio.get_event_loop()
                    try:
                        await loop.run_in_executor(
                            None,
                            self._finalize_staging_download_sync,
                            staging_dir,
                            base_dir,
                            download_options.get("ignore_existing", True),
                            staging_placeholders,
                        )
                    except Exception as e:
                        job.error = f"Failed to finalize download: {e}"
                        await self._on_job_state_transition(job, JobStatus.FAILED)
                        return

                job.progress = 100.0
                await self._on_job_state_transition(job, JobStatus.COMPLETED)
            else:
                job.error = error_message or "Download failed"
                await self._on_job_state_transition(job, JobStatus.FAILED)

        except Exception as e:
            had_exception = True
            if not is_cancelled():
                job.error = str(e)
                await self._on_job_state_transition(job, JobStatus.FAILED)
            else:
                await cleanup_cancelled()

        finally:
            # Stop progress monitor
            if progress_task:
                progress_task.cancel()
                try:
                    await progress_task
                except asyncio.CancelledError:
                    pass

            if process and (is_cancelled() or had_exception):
                await self._terminate_process(process)

            if result_queue is not None:
                try:
                    result_queue.close()
                    result_queue.join_thread()
                except Exception:
                    pass

            if is_cancelled() and not cleanup_done:
                await cleanup_cancelled()

            if staging_dir and job.status == JobStatus.FAILED and not cleanup_done:
                loop = asyncio.get_event_loop()
                try:
                    await loop.run_in_executor(None, self._cleanup_staging_dir, staging_dir)
                except Exception:
                    pass

            if process is not None:
                try:
                    process.close()
                except Exception:
                    pass

            # Cleanup: remove from running set and cancelled set
            async with self._lock:
                self._running_downloads.discard(job_id)
                self._cancelled.discard(job_id)  # Cleanup to prevent set growth
                self._download_processes.pop(job_id, None)

    async def _monitor_progress(
        self,
        job: Job,
        files: Optional[list[str]],
        download_options: dict,
        download_root: Optional[Path] = None,
    ):
        """Monitor download progress by checking file sizes."""
        import time

        try:
            no_directories = download_options.get("no_directories", False)

            # Determine download directory based on no_directories option
            if download_root:
                base_dir = download_root
            elif job.destdir:
                base_dir = Path(job.destdir)
            else:
                base_dir = settings.download_path

            # With no_directories=True, files go directly to base_dir
            # Otherwise, they go to base_dir/identifier/
            if no_directories:
                download_dir = base_dir
            else:
                download_dir = base_dir / job.identifier
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
                    if files:
                        # Only count the specific files being downloaded
                        for filename in files:
                            file_path = download_dir / filename
                            if file_path.exists():
                                try:
                                    current_size += file_path.stat().st_size
                                except:
                                    pass
                    else:
                        # Downloading all files - count everything in identifier directory
                        # Note: with no_directories, this counts all files which may be inaccurate
                        # but for full-item downloads this is the best we can do
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
            logger.warning(f"Progress monitor error: {e}")

    def _create_staging_dir(self, base_dir: Path, job_id: str) -> Path:
        """Create a per-job staging directory under base_dir/.tmp."""
        staging_dir = (base_dir / ".tmp" / f"job-{job_id}").resolve()
        staging_dir.relative_to(base_dir.resolve())
        staging_dir.mkdir(parents=True, exist_ok=True)
        return staging_dir

    def _populate_staging_placeholders(
        self,
        staging_dir: Path,
        base_dir: Path,
        files: Optional[list[str]],
        identifier: str,
        no_directories: bool,
    ) -> set[str]:
        """Create placeholder files in staging dir for existing files."""
        placeholders: set[str] = set()
        file_list = files
        if file_list is None:
            try:
                item = self._ia_service.get_item(identifier)
                if item and item.files:
                    file_list = [f.name for f in item.files if f.name]
            except Exception:
                return placeholders

        if not file_list:
            return placeholders

        target_root = base_dir if no_directories else base_dir / identifier
        staging_root = staging_dir if no_directories else staging_dir / identifier

        for filename in file_list:
            target = self._safe_resolve_path(target_root, filename)
            if not target or not target.exists():
                continue
            if not (target.is_file() or target.is_symlink()):
                continue
            placeholder_path = self._safe_resolve_path(staging_root, filename)
            if not placeholder_path:
                continue
            try:
                placeholder_path.parent.mkdir(parents=True, exist_ok=True)
                if placeholder_path.exists() or placeholder_path.is_symlink():
                    try:
                        rel = placeholder_path.relative_to(staging_dir)
                        placeholders.add(rel.as_posix())
                    except Exception:
                        pass
                    continue
                placeholder_path.touch(exist_ok=True)
                try:
                    rel = placeholder_path.relative_to(staging_dir)
                    placeholders.add(rel.as_posix())
                except Exception:
                    pass
            except Exception:
                continue
        return placeholders

    def _finalize_staging_download_sync(
        self,
        staging_dir: Path,
        base_dir: Path,
        ignore_existing: bool,
        skip_paths: Optional[set[str]] = None,
    ):
        """Move staged files into base_dir, skipping placeholders."""
        skip_paths = skip_paths or set()
        if not staging_dir.exists():
            return

        for root, _, filenames in os.walk(staging_dir):
            for name in filenames:
                src = Path(root) / name
                if src.is_symlink():
                    continue
                try:
                    rel = src.relative_to(staging_dir)
                except Exception:
                    continue
                rel_key = rel.as_posix()
                if rel_key in skip_paths:
                    continue
                dest = self._safe_resolve_path(base_dir, str(rel))
                if not dest:
                    continue
                try:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if dest.exists() and ignore_existing:
                        continue
                    os.replace(src, dest)
                except Exception:
                    continue

        shutil.rmtree(staging_dir, ignore_errors=True)
        tmp_root = staging_dir.parent
        try:
            if tmp_root.is_dir() and not any(tmp_root.iterdir()):
                tmp_root.rmdir()
        except Exception:
            pass

    def _cleanup_staging_dir(self, staging_dir: Path):
        """Remove staging directory and its empty parent if possible."""
        shutil.rmtree(staging_dir, ignore_errors=True)
        tmp_root = staging_dir.parent
        try:
            if tmp_root.is_dir() and not any(tmp_root.iterdir()):
                tmp_root.rmdir()
        except Exception:
            pass

    def _safe_resolve_path(self, root: Path, relative: str) -> Optional[Path]:
        """Resolve relative path safely within root, rejecting path traversal."""
        try:
            candidate = (root / relative).resolve()
            candidate.relative_to(root.resolve())
            return candidate
        except Exception:
            return None

    async def _cleanup_cancelled_download(
        self,
        job: Job,
        files: Optional[list[str]],
        download_options: dict,
        staging_dir: Optional[Path] = None,
    ):
        """Run cleanup in a thread to avoid blocking the event loop."""
        loop = asyncio.get_event_loop()
        if staging_dir:
            await loop.run_in_executor(None, self._cleanup_staging_dir, staging_dir)
            return

    async def _wait_for_process_exit(self, process: multiprocessing.Process, timeout: float):
        """Wait for a process to exit with a timeout without blocking the event loop."""
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            try:
                if not process.is_alive():
                    break
            except (ValueError, AssertionError):
                break
            await asyncio.sleep(0.1)
        try:
            process.join(timeout=0)
        except Exception:
            pass

    async def _terminate_process(self, process: Optional[multiprocessing.Process]):
        """Terminate a process and wait briefly for it to exit."""
        if not process:
            return
        try:
            alive = process.is_alive()
        except (ValueError, AssertionError):
            return
        if alive:
            process.terminate()
            await self._wait_for_process_exit(process, timeout=2.0)
        try:
            alive = process.is_alive()
        except (ValueError, AssertionError):
            return
        if alive:
            process.kill()
            await self._wait_for_process_exit(process, timeout=2.0)

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get a job by ID (memory only for active jobs)."""
        return self._jobs.get(job_id)

    def get_download_jobs(self, status: Optional[JobStatus] = None) -> list[Job]:
        """Get active download jobs from memory (sync, no DB access).

        Returns ALL active jobs (no limit) since active jobs should be few.
        Historical jobs are fetched from DB with limit in downloads route.
        """
        jobs = [j for j in self._jobs.values() if j.type == JobType.DOWNLOAD]
        if status:
            jobs = [j for j in jobs if j.status == status]
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a job."""
        # Return False for unknown jobs or terminal jobs (preserve prior behavior)
        job = self._jobs.get(job_id)
        if not job or job.status in TERMINAL_STATUSES:
            return False

        process: Optional[multiprocessing.Process] = None
        async with self._lock:
            self._cancelled.add(job_id)  # Set flag first
            process = self._download_processes.get(job_id)

        if process:
            asyncio.create_task(self._terminate_process(process))

        # Call transition OUTSIDE lock
        await self._on_job_state_transition(job, JobStatus.CANCELLED)
        return True

    def clear_completed_jobs(self) -> int:
        """Clear completed jobs from memory (DB clearing is separate)."""
        # Note: completed jobs are already removed from memory,
        # but this handles any edge cases
        to_remove = [
            job_id for job_id, job in self._jobs.items()
            if job.status in TERMINAL_STATUSES
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
