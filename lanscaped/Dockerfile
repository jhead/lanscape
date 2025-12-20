# Build stage
FROM golang:1.25 AS builder

# Install build dependencies for CGO (sqlite3)
RUN apt-get update && apt-get install -y \
    gcc \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
# CGO_ENABLED=1 is required for sqlite3
# Docker Buildx will build natively for each platform, so we don't need to set GOOS/GOARCH
# This avoids CGO cross-compilation issues
RUN CGO_ENABLED=1 go build \
    -ldflags="-w -s" \
    -o lanscaped \
    ./cmd/lanscaped.go

# Production stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libsqlite3-0 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1000 lanscape && \
    useradd -r -u 1000 -g lanscape lanscape

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/lanscaped /app/lanscaped

# Create data directory
RUN mkdir -p /app/data && \
    chown -R lanscape:lanscape /app

# Switch to non-root user
USER lanscape

# Expose port (default 8080, configurable via PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

# Run the application
CMD ["/app/lanscaped"]
