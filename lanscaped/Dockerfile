# Build stage
FROM golang:1.25-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev sqlite-dev

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
# CGO_ENABLED=1 is required for sqlite3
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o lanscaped \
    ./cmd/lanscaped.go

# Production stage
FROM alpine:latest

# Install runtime dependencies for sqlite and healthcheck
RUN apk add --no-cache ca-certificates sqlite-libs wget

# Create non-root user
RUN addgroup -g 1000 lanscape && \
    adduser -D -u 1000 -G lanscape lanscape

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/lanscaped /app/lanscaped

# Create data directory for database
RUN mkdir -p /app/data && \
    chown -R lanscape:lanscape /app

# Switch to non-root user
USER lanscape

# Expose port (default 8080, configurable via PORT env var)
EXPOSE 8080

# Health check (uses default port 8080, adjust if PORT env var is set differently)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/healthz || exit 1

# Run the application
CMD ["/app/lanscaped"]
