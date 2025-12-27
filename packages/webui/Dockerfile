# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy packages directory (needed for workspace dependencies like @lanscape/chat)
COPY packages ./packages

# Install pnpm and dependencies
# Corepack will automatically use the version specified in package.json packageManager field
RUN corepack enable
RUN pnpm install --frozen-lockfile

# Build workspace dependencies first
# The chat package must be built before webui since webui depends on it
WORKDIR /app
RUN pnpm --filter '@lanscape/chat' build

# Build the webui package
RUN pnpm --filter webui build

# Production stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/packages/webui/dist /usr/share/nginx/html

# Copy nginx configuration for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Gzip compression \
    gzip on; \
    gzip_vary on; \
    gzip_min_length 1024; \
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json; \
    \
    # Security headers \
    add_header X-Frame-Options "SAMEORIGIN" always; \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
    \
    # SPA routing - serve index.html for all routes \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    # Cache static assets \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
