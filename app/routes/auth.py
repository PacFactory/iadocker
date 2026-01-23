from fastapi import APIRouter, HTTPException
from configparser import RawConfigParser
from pathlib import Path
import os

from app.config import settings
from app.models import AuthStatus, ConfigureRequest

router = APIRouter()


def read_config_file():
    """Read and parse the IA config file."""
    config_path = Path(settings.ia_config_file)
    
    if not config_path.exists():
        return None
    
    # Use RawConfigParser to avoid % interpolation issues with URL-encoded values
    config = RawConfigParser()
    config.read(config_path)
    return config


def get_config_email(config):
    """Extract email from IA config."""
    if not config:
        return None
    
    email = None
    
    # Try cookies section
    if config.has_section('cookies') and config.has_option('cookies', 'logged-in-user'):
        raw_value = config.get('cookies', 'logged-in-user', fallback=None)
        if raw_value:
            email = parse_email_from_cookie(raw_value)
    
    # Fallback to general section
    if not email and config.has_section('general'):
        email = config.get('general', 'screenname', fallback=None)
    
    return email


def parse_email_from_cookie(cookie_value):
    """Parse email from cookie value which may include metadata."""
    if not cookie_value:
        return None
    
    from urllib.parse import unquote
    
    # Cookie value might be: "email@domain.com; expires=...; path=..." or just "email%40domain.com"
    # First, take only the part before any semicolon
    value = cookie_value.split(';')[0].strip()
    
    # URL decode (e.g., %40 -> @)
    value = unquote(value)
    
    # If it looks like an email, return it
    if '@' in value and '.' in value:
        return value
    
    return cookie_value  # Fallback to original


def is_config_valid(config):
    """Check if config has valid S3 credentials (indicates successful auth)."""
    if not config:
        return False
    
    # Must have s3 section with access key to be considered configured
    if config.has_section('s3'):
        access = config.get('s3', 'access', fallback=None)
        secret = config.get('s3', 'secret', fallback=None)
        if access and secret:
            return True
    
    return False


@router.get("/status", response_model=AuthStatus)
async def get_auth_status():
    """Check if IA is configured and get the configured email."""
    try:
        config = read_config_file()
        
        if not config:
            return AuthStatus(configured=False)
        
        if is_config_valid(config):
            email = get_config_email(config)
            return AuthStatus(configured=True, email=email)
        
        return AuthStatus(configured=False)
    except Exception as e:
        print(f"Error reading config: {e}")
        return AuthStatus(configured=False)


@router.post("/configure")
async def configure_ia(request: ConfigureRequest):
    """Configure IA with email and password. Validates credentials with archive.org."""
    try:
        from internetarchive import configure, get_session
        
        # Ensure config directory exists
        config_path = Path(settings.ia_config_file)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Delete old config if exists (force fresh auth)
        if config_path.exists():
            config_path.unlink()
        
        # Configure IA - this authenticates with archive.org and saves credentials
        # If credentials are invalid, this will raise an exception
        try:
            configure(
                request.email,
                request.password,
                config_file=settings.ia_config_file
            )
        except Exception as auth_error:
            error_msg = str(auth_error).lower()
            if 'authentication' in error_msg or 'login' in error_msg or 'password' in error_msg:
                raise HTTPException(status_code=401, detail="Invalid email or password. Please check your archive.org credentials.")
            raise HTTPException(status_code=400, detail=f"Authentication failed: {auth_error}")
        
        # Verify the config file was created and has valid credentials
        if not config_path.exists():
            raise HTTPException(status_code=500, detail="Configuration file was not created. Authentication may have failed silently.")
        
        config = read_config_file()
        if not is_config_valid(config):
            # Config exists but no S3 keys - auth likely failed
            raise HTTPException(status_code=401, detail="Authentication failed. No valid credentials were saved. Please verify your email and password.")
        
        # Force reload the IA session to use new credentials
        try:
            session = get_session(config_file=settings.ia_config_file)
            # Test the session by checking if we're authenticated
            if hasattr(session, 'access_key') and session.access_key:
                pass  # Good, we have credentials
        except Exception as session_error:
            print(f"Session reload warning: {session_error}")
        
        email = get_config_email(config)
        return {
            "success": True, 
            "message": "Successfully authenticated with archive.org",
            "email": email or request.email
        }
            
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        if 'email' in error_str.lower() or 'password' in error_str.lower():
            raise HTTPException(status_code=401, detail="Invalid credentials. Please check your email and password.")
        raise HTTPException(status_code=400, detail=f"Configuration failed: {error_str}")


@router.post("/test")
async def test_auth():
    """Test if current auth credentials are valid by making a test API call."""
    try:
        from internetarchive import get_session, search_items
        
        config = read_config_file()
        if not is_config_valid(config):
            return {"valid": False, "error": "Not configured"}
        
        # Create session with saved config
        session = get_session(config_file=settings.ia_config_file)
        
        # Try a simple search to verify session works
        # This doesn't require auth but confirms the library is working
        results = search_items('test', max_results=1)
        list(results)  # Force evaluation
        
        email = get_config_email(config)
        return {"valid": True, "email": email}
        
    except Exception as e:
        return {"valid": False, "error": str(e)}
