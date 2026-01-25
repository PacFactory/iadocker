"""SQLAlchemy ORM models for SQLite database."""

from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, Float, Index
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


class JobDB(Base):
    """Download/upload job history (persisted across restarts)."""
    __tablename__ = "jobs"

    id = Column(String, primary_key=True)
    type = Column(String, nullable=False, default="download")
    status = Column(String, nullable=False, default="pending")
    identifier = Column(String, nullable=False)
    filename = Column(String, nullable=True)
    destdir = Column(String, nullable=True)
    progress = Column(Float, default=0.0)
    total_bytes = Column(Integer, nullable=True)
    downloaded_bytes = Column(Integer, nullable=True)
    speed = Column(Float, nullable=True)
    error = Column(Text, nullable=True)
    options_json = Column(Text, nullable=True)
    created_at = Column(String, nullable=True)  # ISO format timestamp
    started_at = Column(String, nullable=True)  # ISO format timestamp
    completed_at = Column(String, nullable=True)  # ISO format timestamp

    __table_args__ = (
        Index("idx_jobs_status_created", "status", "created_at"),
    )


class SearchHistoryDB(Base):
    """Search history (backing store for settings.search_history)."""
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    query = Column(String, nullable=False, unique=True)
    search_count = Column(Integer, default=1)
    last_searched_at = Column(String, nullable=True)  # ISO format timestamp

    __table_args__ = (
        Index("idx_search_history_last", "last_searched_at"),
    )


class BookmarkDB(Base):
    """Bookmarks for archive.org items."""
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    identifier = Column(String, nullable=False, unique=True)
    title = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    mediatype = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    tags = Column(Text, nullable=True)  # JSON array: '["jazz","music","vintage"]'
    created_at = Column(String, nullable=True)  # ISO format timestamp


class AppSettingsDB(Base):
    """App settings (key-value store, values JSON-encoded)."""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)  # JSON-encoded to preserve types
