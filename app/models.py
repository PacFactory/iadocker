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
    created_at: datetime = Field(default_factory=datetime.utcnow)  # UTC, not local time
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
        size = self.size  # Use local variable to avoid mutation
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} PB"


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
    
    # Skip/resume options
    ignore_existing: Optional[bool] = None  # Skip files already downloaded
    checksum: Optional[bool] = None  # Skip files based on checksum verification
    
    # Retry and timeout
    retries: Optional[int] = None  # Number of retries (default: 5)
    timeout: Optional[int] = None  # Download timeout in seconds
    
    # Directory structure
    no_directories: Optional[bool] = None  # Download into working dir without item folder
    
    # Timestamp behavior
    no_change_timestamp: Optional[bool] = None  # Don't change timestamp to match source
    
    # Source filtering
    source: Optional[list[str]] = None  # Filter by source (original, derivative, metadata)
    exclude_source: Optional[list[str]] = None  # Exclude by source
    
    # On-the-fly derivatives
    on_the_fly: Optional[bool] = None  # Include EPUB, MOBI, DAISY derivatives
    
    # Additional filtering
    exclude: Optional[str] = None  # Exclude files matching glob pattern


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


class Bookmark(BaseModel):
    """A bookmarked archive.org item."""
    id: Optional[int] = None
    identifier: str
    title: Optional[str] = None
    description: Optional[str] = None
    mediatype: Optional[str] = None
    thumbnail_url: Optional[str] = None
    notes: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None


class BookmarkCreate(BaseModel):
    """Request to create a bookmark."""
    identifier: str
    notes: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class BookmarkUpdate(BaseModel):
    """Request to update a bookmark."""
    notes: Optional[str] = None
    tags: Optional[list[str]] = None  # None = no change, [] = clear tags
