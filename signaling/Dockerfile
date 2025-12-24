FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy dependency files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o signaling ./cmd/signaling

# Runtime image
FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget

COPY --from=builder /app/signaling /signaling

EXPOSE 8081

CMD ["/signaling"]
