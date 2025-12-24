#!/bin/bash
set -e

# Wait for signaling service to be ready
echo "Waiting for signaling service..."
for i in {1..30}; do
    nc -z localhost 8081 2>/dev/null && break
    sleep 2
done

ACME_HOME="/root/.acme.sh"
ACME_CMD="$ACME_HOME/acme.sh"
export PATH="$ACME_HOME:$PATH"

# Export Cloudflare credentials
export CF_Token="${CF_Token}"
export CF_Zone_ID="${CF_Zone_ID}"

# Domain from environment
DOMAIN="${SIGNALING_DOMAIN}"

if [ -n "$DOMAIN" ]; then
    WILDCARD_DOMAIN="*.${DOMAIN}"
else
    echo "ERROR: SIGNALING_DOMAIN environment variable is not set"
    exit 1
fi

# Check if certificates already exist
CERT_DIR="/etc/nginx/ssl"
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/fullchain.cer" ] || [ ! -f "$CERT_DIR/signaling.key" ]; then
    echo "Certificates not found, requesting from Let's Encrypt..."
    
    if [ -z "$CF_Token" ] || [ -z "$CF_Zone_ID" ]; then
        echo "ERROR: CF_Token and CF_Zone_ID must be set for certificate provisioning"
        exit 1
    fi

    # Issue certificate for both signaling... and *.signaling...
    "$ACME_CMD" --force --log-level 1 --issue \
        --dns dns_cf \
        -d "$DOMAIN" \
        -d "$WILDCARD_DOMAIN" \
        --server https://acme-v02.api.letsencrypt.org/directory

    # Install certificates to nginx directory
    "$ACME_CMD" --install-cert \
        -d "$DOMAIN" \
        --key-file "$CERT_DIR/signaling.key" \
        --fullchain-file "$CERT_DIR/fullchain.cer" \
        --reloadcmd "echo 'Certificates installed'"

    echo "Certificates installed successfully"
else
    echo "Certificates already exist, skipping provisioning"
    
    # Try to renew if needed (acme.sh will check and only renew if necessary)
    "$ACME_CMD" --renew -d "$DOMAIN" --force || true
    "$ACME_CMD" --renew -d "$WILDCARD_DOMAIN" --force || true
fi

# Create certbot webroot for ACME challenges
mkdir -p /var/www/certbot

# Copy nginx config (no substitution needed as we use server_name _ for SNI)
cp /etc/nginx/templates/signaling-nginx.conf.template /etc/nginx/nginx.conf

# Start nginx
echo "Starting nginx with domain: $DOMAIN"
exec nginx -g "daemon off;"

