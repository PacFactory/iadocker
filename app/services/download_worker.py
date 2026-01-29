from app.services.ia_service import IAService


def run_download_worker(payload: dict, result_queue) -> None:
    """Run a download in a separate process so it can be terminated safely."""
    try:
        identifier = payload["identifier"]
        files = payload.get("files")
        glob = payload.get("glob")
        format = payload.get("format")
        destdir = payload.get("destdir")
        download_options = payload.get("download_options", {})

        ignore_existing = download_options.get("ignore_existing", True)
        checksum = download_options.get("checksum", False)
        retries = download_options.get("retries", 5)
        timeout = download_options.get("timeout")
        no_directories = download_options.get("no_directories", False)
        no_change_timestamp = download_options.get("no_change_timestamp", False)
        source = download_options.get("source")
        exclude_source = download_options.get("exclude_source")
        on_the_fly = download_options.get("on_the_fly", False)
        exclude = download_options.get("exclude")

        ia_service = IAService()

        if files:
            for filename in files:
                success = ia_service.download_file(
                    identifier,
                    filename,
                    destdir=destdir,
                    ignore_existing=ignore_existing,
                    checksum=checksum,
                    retries=retries,
                    timeout=timeout,
                    no_directories=no_directories,
                    no_change_timestamp=no_change_timestamp,
                    on_the_fly=on_the_fly,
                )
                if not success:
                    result_queue.put({
                        "success": False,
                        "error": f"Failed to download {filename}",
                    })
                    return
            result_queue.put({"success": True})
            return

        success = ia_service.download_item(
            identifier,
            glob=glob,
            format=format,
            destdir=destdir,
            ignore_existing=ignore_existing,
            checksum=checksum,
            retries=retries,
            timeout=timeout,
            no_directories=no_directories,
            no_change_timestamp=no_change_timestamp,
            source=source,
            exclude_source=exclude_source,
            on_the_fly=on_the_fly,
            exclude=exclude,
        )
        if not success:
            result_queue.put({"success": False, "error": "Download failed"})
            return

        result_queue.put({"success": True})
    except Exception as exc:
        try:
            result_queue.put({
                "success": False,
                "error": str(exc) or "Download failed",
            })
        except Exception:
            pass
