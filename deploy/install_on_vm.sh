#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
RELEASE_DIR="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PUBLIC_IP="${3:-}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, for example: sudo bash $0 your-domain.example" >&2
  exit 1
fi

if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash $0 your-domain.example [/path/to/makao-release] [public-ip]" >&2
  exit 1
fi

if [ ! -d "$RELEASE_DIR/backend" ] || [ ! -d "$RELEASE_DIR/frontend" ]; then
  echo "Release directory not found or incomplete: $RELEASE_DIR" >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get install -y nodejs npm nginx certbot python3-certbot-nginx rsync
  NGINX_CONF="/etc/nginx/sites-available/makao"
  NGINX_LINK="/etc/nginx/sites-enabled/makao"
  USER_SHELL="/usr/sbin/nologin"
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y epel-release || true
  dnf install -y nodejs npm nginx certbot python3-certbot-nginx rsync policycoreutils-python-utils firewalld
  NGINX_CONF="/etc/nginx/conf.d/makao.conf"
  NGINX_LINK=""
  USER_SHELL="/sbin/nologin"
else
  echo "Unsupported OS: apt-get or dnf is required." >&2
  exit 1
fi

if [ ! -x "$USER_SHELL" ]; then
  USER_SHELL="/sbin/nologin"
fi

id makao >/dev/null 2>&1 || useradd --system --home /opt/makao --shell "$USER_SHELL" makao

install -d -o makao -g makao /opt/makao/backend
install -d -m 700 -o makao -g makao /opt/makao/data
install -d -o root -g root /var/www/makao

rsync -a --delete "$RELEASE_DIR/backend/" /opt/makao/backend/
rsync -a --delete "$RELEASE_DIR/frontend/" /var/www/makao/
chown -R makao:makao /opt/makao
chown -R root:root /var/www/makao

runuser -u makao -- npm --prefix /opt/makao/backend ci --omit=dev

cp "$RELEASE_DIR/deploy/makao-backend.service" /etc/systemd/system/makao-backend.service
systemctl daemon-reload
systemctl enable makao-backend
systemctl restart makao-backend

systemctl enable --now nginx

if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi

sed \
  -e "s/makao.example.com/$DOMAIN/g" \
  -e "s/203.0.113.10/${PUBLIC_IP:-127.0.0.1}/g" \
  "$RELEASE_DIR/deploy/nginx-makao.conf" > "$NGINX_CONF"

if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]; then
  cat >> "$NGINX_CONF" <<NGINX

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;

    root /var/www/makao;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
fi

if [ -n "$NGINX_LINK" ]; then
  ln -sf "$NGINX_CONF" "$NGINX_LINK"
  rm -f /etc/nginx/sites-enabled/default
fi

if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1 || true
  restorecon -RF /var/www/makao || true
fi

if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http || true
  firewall-cmd --permanent --add-service=https || true
  firewall-cmd --reload || true
fi

nginx -t
systemctl reload nginx

systemctl --no-pager --full status makao-backend || true
echo
echo "HTTP deploy ready: http://$DOMAIN"
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  echo "HTTPS deploy ready: https://$DOMAIN"
else
  echo "After DNS points to this VM and port 80 is reachable, run:"
  echo "  sudo certbot --nginx -d $DOMAIN"
fi
