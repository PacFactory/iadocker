from typing import Optional
from internetarchive import get_item, search_items, configure

from app.models import SearchResult, Item, ItemFile
from app.config import settings


class IAService:
    """Service wrapper for the internetarchive library."""
    
    def search(
        self,
        query: str,
        page: int = 1,
        rows: int = 20,
        sort: Optional[str] = None
    ) -> tuple[list[SearchResult], int]:
        """Search archive.org items."""
        params = {
            "page": page,
            "rows": rows,
        }
        if sort:
            params["sorts"] = sort
        
        # Request specific fields to ensure title is included
        fields = ["identifier", "title", "description", "mediatype", "collection", "date", "creator", "downloads"]
        search = search_items(query, params=params, fields=fields)
        
        results = []
        total = 0
        
        try:
            # Get total from search results
            total = search.num_found or 0
            
            for item in search:
                # Get title, fallback to identifier if not present
                title = item.get("title")
                if isinstance(title, list):
                    title = title[0] if title else None
                
                results.append(SearchResult(
                    identifier=item.get("identifier", ""),
                    title=title,
                    description=item.get("description"),
                    mediatype=item.get("mediatype"),
                    collection=item.get("collection") if isinstance(item.get("collection"), list) else [item.get("collection")] if item.get("collection") else None,
                    date=item.get("date"),
                    creator=item.get("creator"),
                    downloads=item.get("downloads"),
                ))
                
                # Stop after rows items
                if len(results) >= rows:
                    break
        except Exception as e:
            print(f"Search error: {e}")
        
        return results, total
    
    def get_item(self, identifier: str) -> Optional[Item]:
        """Get item metadata and files."""
        try:
            ia_item = get_item(identifier)
            
            # Get files
            files = []
            for f in ia_item.files:
                files.append(ItemFile(
                    name=f.get("name", ""),
                    size=int(f.get("size", 0)) if f.get("size") else None,
                    format=f.get("format"),
                    md5=f.get("md5"),
                    mtime=f.get("mtime"),
                    source=f.get("source"),
                ))
            
            return Item(
                identifier=identifier,
                metadata=dict(ia_item.metadata),
                files=files
            )
        except Exception as e:
            print(f"Get item error: {e}")
            return None
    
    def download_file(
        self,
        identifier: str,
        filename: str,
        destdir: Optional[str] = None,
        ignore_existing: bool = True,
        checksum: bool = False,
        retries: int = 5,
        timeout: Optional[int] = None,
        no_directories: bool = False,
        no_change_timestamp: bool = False,
        on_the_fly: bool = False,
        progress_callback: Optional[callable] = None
    ) -> bool:
        """Download a single file from an item."""
        try:
            ia_item = get_item(identifier)
            dest = destdir or str(settings.download_path)
            
            print(f"Downloading {identifier}/{filename} to {dest}")
            
            download_kwargs = {
                "files": [filename],
                "destdir": dest,
                "verbose": True,
                "no_directory": no_directories,
                "ignore_existing": ignore_existing,
                "checksum": checksum,
                "retries": retries,
                "ignore_history_dir": True,
                "on_the_fly": on_the_fly,
            }
            
            if timeout:
                download_kwargs["timeout"] = timeout
            
            ia_item.download(**download_kwargs)
            
            if no_directories:
                print(f"Download complete: {dest}/{filename}")
            else:
                print(f"Download complete: {dest}/{identifier}/{filename}")
            return True
        except Exception as e:
            print(f"Download error: {e}")
            return False
    
    def download_item(
        self,
        identifier: str,
        glob: Optional[str] = None,
        format: Optional[str] = None,
        destdir: Optional[str] = None,
        ignore_existing: bool = True,
        checksum: bool = False,
        retries: int = 5,
        timeout: Optional[int] = None,
        no_directories: bool = False,
        no_change_timestamp: bool = False,
        source: Optional[list[str]] = None,
        exclude_source: Optional[list[str]] = None,
        on_the_fly: bool = False,
        exclude: Optional[str] = None,
        progress_callback: Optional[callable] = None
    ) -> bool:
        """Download all or filtered files from an item."""
        try:
            ia_item = get_item(identifier)
            dest = destdir or str(settings.download_path)
            
            print(f"Downloading all files from {identifier} to {dest}")
            
            kwargs = {
                "destdir": dest,
                "verbose": True,
                "no_directory": no_directories,
                "ignore_existing": ignore_existing,
                "checksum": checksum,
                "retries": retries,
                "ignore_history_dir": True,
                "on_the_fly": on_the_fly,
            }
            
            if timeout:
                kwargs["timeout"] = timeout
            if glob:
                kwargs["glob_pattern"] = glob
                print(f"Using glob pattern: {glob}")
            if format:
                kwargs["formats"] = [format]
                print(f"Using format filter: {format}")
            if source:
                kwargs["source"] = source
                print(f"Filtering by source: {source}")
            if exclude_source:
                # Filter out excluded sources
                all_sources = ['original', 'derivative', 'metadata']
                kwargs["source"] = [s for s in all_sources if s not in exclude_source]
                print(f"Excluding sources: {exclude_source}")
            if exclude:
                kwargs["exclude_pattern"] = exclude
                print(f"Excluding pattern: {exclude}")
            
            ia_item.download(**kwargs)
            
            if no_directories:
                print(f"Download complete: {dest}/")
            else:
                print(f"Download complete: {dest}/{identifier}/")
            return True
        except Exception as e:
            print(f"Download error: {e}")
            return False

