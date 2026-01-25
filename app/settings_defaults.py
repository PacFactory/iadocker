"""Default settings - neutral module to avoid circular imports."""

DEFAULT_SETTINGS = {
    "max_concurrent_downloads": 3,
    # Download behavior defaults
    "ignore_existing": True,  # Skip files already downloaded
    "checksum": False,  # Verify file integrity via checksum
    "retries": 5,  # Number of retries for failed downloads
    "timeout": None,  # Download timeout in seconds (None = no timeout)
    "no_change_timestamp": False,  # Don't modify timestamps to match source
    "on_the_fly": False,  # Include EPUB, MOBI, DAISY derivatives
    # User convenience persistence
    "last_destdir": "",  # Last used download destination
}

# Download-related setting keys (subset for get_download_defaults)
DOWNLOAD_SETTING_KEYS = [
    "ignore_existing",
    "checksum",
    "retries",
    "timeout",
    "no_change_timestamp",
    "on_the_fly",
]
