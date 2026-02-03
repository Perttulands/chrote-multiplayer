# Deployment Guide

Deploy CHROTE Multiplayer to production environments.

## Table of Contents

- [Docker Deployment](#docker-deployment)
- [VPS Deployment](#vps-deployment)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Monitoring](#monitoring)
- [Backup and Recovery](#backup-and-recovery)

---

## Docker Deployment

### Prerequisites

- Docker Engine 20.10+
- Docker Compose v2+
- tmux installed on host (or use the container's tmux)

### Quick Start

```bash
# Clone repository
git clone https://github.com/yourusername/chrote-multiplayer.git
cd chrote-multiplayer

# Configure environment
cp .env.example .env
# Edit .env with your OAuth credentials and secrets

# Start production container
docker compose up app -d
```

### Production docker-compose.yml

```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "127.0.0.1:3000:3000"  # Only bind to localhost (use reverse proxy)
    volumes:
      - ./data:/app/data
      - /tmp/chrote-tmux:/tmp/chrote-tmux
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/chrote.db
      - GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - SESSION_SECRET=${SESSION_SECRET}
      - TMUX_SOCKET_DIR=/tmp/chrote-tmux
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Building for Production

```bash
# Build production image
docker build -t chrote-multiplayer:latest .

# Run with specific tag
docker run -d \
  --name chrote-multiplayer \
  -p 127.0.0.1:3000:3000 \
  -v $(pwd)/data:/app/data \
  -v /tmp/chrote-tmux:/tmp/chrote-tmux \
  --env-file .env \
  chrote-multiplayer:latest
```

---

## VPS Deployment

### Prerequisites

- Ubuntu 22.04+ or Debian 12+
- Bun installed
- tmux installed
- Nginx or Caddy for reverse proxy

### Installation

```bash
# Install dependencies
sudo apt update
sudo apt install -y tmux nginx

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone and setup application
git clone https://github.com/yourusername/chrote-multiplayer.git /opt/chrote-multiplayer
cd /opt/chrote-multiplayer

# Install dependencies
bun install

# Build application
bun run build
bun run build:ui

# Create data directory
mkdir -p /var/lib/chrote
chown www-data:www-data /var/lib/chrote
```

### Systemd Service

Create `/etc/systemd/system/chrote-multiplayer.service`:

```ini
[Unit]
Description=CHROTE Multiplayer
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/chrote-multiplayer
ExecStart=/home/user/.bun/bin/bun run dist/server/index.js
Restart=on-failure
RestartSec=5

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_PATH=/var/lib/chrote/chrote.db
EnvironmentFile=/etc/chrote-multiplayer/env

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/chrote /tmp/chrote-tmux

[Install]
WantedBy=multi-user.target
```

Create environment file `/etc/chrote-multiplayer/env`:

```bash
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=your-secure-random-string
TMUX_SOCKET_DIR=/tmp/chrote-tmux
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable chrote-multiplayer
sudo systemctl start chrote-multiplayer
sudo systemctl status chrote-multiplayer
```

---

## Reverse Proxy Setup

### Nginx

Create `/etc/nginx/sites-available/chrote-multiplayer`:

```nginx
upstream chrote_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name multiplayer.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name multiplayer.example.com;

    # SSL certificates (use certbot)
    ssl_certificate /etc/letsencrypt/live/multiplayer.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/multiplayer.example.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Proxy settings
    location / {
        proxy_pass http://chrote_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/chrote-multiplayer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy

Create `/etc/caddy/Caddyfile` (or add to existing):

```
multiplayer.example.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically handles SSL certificates via Let's Encrypt.

---

## SSL/TLS Configuration

### Let's Encrypt with Certbot

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d multiplayer.example.com

# Auto-renewal (usually enabled by default)
sudo systemctl enable certbot.timer
```

### OAuth Callback URLs

Update your OAuth applications with the production callback URLs:

- GitHub: `https://multiplayer.example.com/auth/github/callback`
- Google: `https://multiplayer.example.com/auth/google/callback`

---

## Monitoring

### Health Check Endpoint

The application exposes `/health` for monitoring:

```bash
curl https://multiplayer.example.com/health
# {"status":"ok","timestamp":"2026-02-03T12:00:00Z"}
```

### Logging

Logs are written to stdout/stderr. With systemd:

```bash
# View logs
journalctl -u chrote-multiplayer -f

# View last 100 lines
journalctl -u chrote-multiplayer -n 100
```

### Log Rotation

Create `/etc/logrotate.d/chrote-multiplayer`:

```
/var/log/chrote-multiplayer/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
}
```

---

## Backup and Recovery

### Database Backup

The SQLite database is stored at `DATABASE_PATH`. Back it up regularly:

```bash
# Manual backup
sqlite3 /var/lib/chrote/chrote.db ".backup '/var/backups/chrote/chrote-$(date +%Y%m%d).db'"

# Automated backup script
#!/bin/bash
BACKUP_DIR=/var/backups/chrote
mkdir -p $BACKUP_DIR
sqlite3 /var/lib/chrote/chrote.db ".backup '$BACKUP_DIR/chrote-$(date +%Y%m%d-%H%M%S).db'"
# Keep last 7 days
find $BACKUP_DIR -name "chrote-*.db" -mtime +7 -delete
```

Add to crontab:

```bash
# Daily backup at 2 AM
0 2 * * * /opt/chrote-multiplayer/scripts/backup.sh
```

### Recovery

```bash
# Stop service
sudo systemctl stop chrote-multiplayer

# Restore from backup
cp /var/backups/chrote/chrote-20260203.db /var/lib/chrote/chrote.db
chown www-data:www-data /var/lib/chrote/chrote.db

# Start service
sudo systemctl start chrote-multiplayer
```

---

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Find process using port 3000
lsof -i :3000
# Kill it or change PORT in .env
```

**Permission denied for tmux socket:**
```bash
# Ensure TMUX_SOCKET_DIR exists and is writable
mkdir -p /tmp/chrote-tmux
chmod 1777 /tmp/chrote-tmux
```

**Database locked:**
```bash
# Only one process should access the database
# Check for stale processes
ps aux | grep chrote
```

**WebSocket connection failed:**
- Ensure reverse proxy is configured for WebSocket upgrade
- Check `proxy_read_timeout` is high enough (86400 for 24h)
