# Makao VM Deploy

Target VM: `8.231.197.182` (`villainswebdev`, Debian 12).

## Public URL Requirements

For public testing we should use a domain and HTTPS.

Required DNS:

```text
A    your-domain.example    8.231.197.182
```

Required Google Cloud firewall ingress:

```text
tcp:80
tcp:443
```

Let's Encrypt can issue the certificate after the DNS record points to the VM and port 80 is reachable from the internet.

## Runtime Shape

```text
Nginx :80/:443
  /              -> /var/www/makao static frontend
  /socket.io/    -> 127.0.0.1:3001 backend WebSocket/HTTP polling

systemd makao-backend.service
  /opt/makao/backend/server.js
```

The frontend should be built without `VITE_SERVER_URL` for this deployment. In that mode it uses `window.location.origin`, so the browser connects to the backend through the same public domain.

## VM Bootstrap

The prepared installer can do the HTTP deployment after the release is copied:

```bash
sudo bash /home/mgmichal3/makao-release/deploy/install_on_vm.sh your-domain.example
```

Manual equivalent, run as a sudo-capable user:

```bash
sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx rsync
sudo useradd --system --home /opt/makao --shell /usr/sbin/nologin makao || true
sudo mkdir -p /opt/makao/backend /var/www/makao
sudo chown -R makao:makao /opt/makao
```

If Debian's packaged Node is too old for the app, install Node.js LTS from NodeSource or another trusted source before enabling the service.

## Install Release

Build the release locally:

```bash
env -u VITE_SERVER_URL npm --prefix frontend run build
./deploy/build_release.sh
```

After copying the release files to the VM:

```bash
cd /opt/makao/backend
sudo -u makao npm ci --omit=dev

sudo cp /tmp/makao-backend.service /etc/systemd/system/makao-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now makao-backend

sudo cp /tmp/nginx-makao.conf /etc/nginx/sites-available/makao
sudo ln -sf /etc/nginx/sites-available/makao /etc/nginx/sites-enabled/makao
sudo nginx -t
sudo systemctl reload nginx
```

## HTTPS

After replacing `makao.example.com` in the Nginx config with the real domain and confirming DNS:

```bash
sudo certbot --nginx -d your-domain.example
```

Certbot will edit the Nginx config to add TLS and redirect HTTP to HTTPS.
