from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime


class JobStatus(str, Enum):
    """Status of a download/upload job."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    """Type of job."""
    DOWNLOAD = "download"
    UPLOAD = "upload"


class Job(BaseModel):
    """A download or upload job."""
    id: str
    type: JobType
    status: JobStatus = JobStatus.PENDING
    identifier: str
    filename: Optional[str] = None
    progress: float = 0.0
    total_bytes: Optional[int] = None
    downloaded_bytes: Optional[int] = None
    speed: Optional[float] = None  # bytes per second
    error: Optional[str] = None
    destdir: Optional[str] = None  # Custom destination directory
    created_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class SearchResult(BaseModel):
    """A single search result from archive.org."""
    identifier: str
    title: Optional[str] = None
    description: Optional[str] = None
    mediatype: Optional[str] = None
    collection: Optional[list[str]] = None
    date: Optional[str] = None
    creator: Optional[str] = None
    downloads: Optional[int] = None
    
    @property
    def thumbnail_url(self) -> str:
        return f"https://archive.org/services/img/{self.identifier}"


class SearchResponse(BaseModel):
    """Response from a search query."""
    query: str
    total: int
    page: int
    rows: int
    results: list[SearchResult]


class ItemFile(BaseModel):
    """A file within an archive.org item."""
    name: str
    size: Optional[int] = None
    format: Optional[str] = None
    md5: Optional[str] = None
    mtime: Optional[str] = None
    source: Optional[str] = None
    
    @property
    def size_str(self) -> str:
        if not self.size:
            return "Unknown"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if self.size < 1024:
                return f"{self.size:.1f} {unit}"
            self.size /= 1024
        return f"{self.size:.1f} PB"


class Item(BaseModel):
    """An archive.org item with metadata."""
    identifier: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    files: list[ItemFile] = Field(default_factory=list)
    
    @property
    def title(self) -> str:
        return self.metadata.get("title", self.identifier)
    
    @property
    def description(self) -> Optional[str]:
        return self.metadata.get("description")
    
    @property
    def thumbnail_url(self) -> str:
        return f"https://archive.org/services/img/{self.identifier}"


class DownloadRequest(BaseModel):
    """Request to start a download."""
    identifier: str
    files: Optional[list[str]] = None  # None = download all
    glob: Optional[str] = None
    format: Optional[str] = None
    destdir: Optional[str] = None  # Custom destination path within /data volume


class UploadRequest(BaseModel):
    """Request to upload files."""
    identifier: str
    metadata: dict[str, str] = Field(default_factory=dict)


class AuthStatus(BaseModel):
    """Authentication status."""
    configured: bool
    email: Optional[str] = None


class ConfigureRequest(BaseModel):
    """Request to configure IA credentials."""
    email: str
    password: str
