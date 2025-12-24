FROM nginx:alpine

# Install dependencies for acme.sh and networking tools
RUN apk add --no-cache \
    curl \
    netcat-openbsd \
    bash \
    gettext \
    openssl

# Create directories
RUN mkdir -p /etc/nginx/ssl /var/www/certbot /etc/nginx/templates

# Install acme.sh
RUN curl https://get.acme.sh | sh && \
    /root/.acme.sh/acme.sh --set-default-ca --server letsencrypt

# Copy entrypoint script
COPY signaling-nginx-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy nginx config template
COPY signaling-nginx.conf /etc/nginx/templates/signaling-nginx.conf.template

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

