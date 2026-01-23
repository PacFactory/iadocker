# =============================================================================
# IA Docker GUI - Multi-stage Dockerfile
# =============================================================================
# Builds a web GUI for the Internet Archive CLI tool
# - Stage 1: Python backend with FastAPI and internetarchive library
# - Stage 2: Node.js frontend build with Preact/Vite
# - Stage 3: Final slim image combining both
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Backend dependencies
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY app/ ./app/

# -----------------------------------------------------------------------------
# Stage 2: Frontend build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS frontend

WORKDIR /frontend

# Install dependencies first (better caching)
COPY frontend/package*.json ./
RUN npm ci

# Build frontend
COPY frontend/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Final production image
# -----------------------------------------------------------------------------
FROM python:3.11-slim

LABEL maintainer="IA Docker GUI"
LABEL description="Web GUI for Internet Archive CLI"

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from backend stage
COPY --from=backend /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend /usr/local/bin /usr/local/bin

# Copy application code (app/ goes to /app/app/)
COPY --from=backend /app/app /app/app

# Copy version file (single source of truth)
COPY .version /app/.version

# Copy built frontend to static directory (at /app/static, not /app/app/static)
COPY --from=frontend /frontend/dist /app/static

# Create directories for persistent data
RUN mkdir -p /config /data && \
    chmod 755 /config /data

# Environment variables
ENV IA_CONFIG_FILE=/config/ia.ini
ENV DOWNLOAD_DIR=/data
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
