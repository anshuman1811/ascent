#!/bin/bash
# FitTrack — build and start persistently with pm2
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20 2>/dev/null || nvm use --lts

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Building client ==="
cd "$ROOT/client"
npm run build

echo "=== Starting server with pm2 ==="
cd "$ROOT"

# Install pm2 globally if needed
command -v pm2 &>/dev/null || npm install -g pm2

pm2 start ecosystem.config.js --update-env
pm2 save

echo ""
echo "=== FitTrack is running ==="
pm2 list
echo ""
echo "To set up auto-start on login, run:"
echo "  pm2 startup"
echo "  (copy and run the command it prints)"
echo ""
echo "Access on this machine:  http://localhost:3001"

# Print network IPs
node -e "
const os = require('os');
const ifaces = os.networkInterfaces();
for (const iface of Object.values(ifaces)) {
  for (const addr of iface) {
    if (addr.family === 'IPv4' && !addr.internal) {
      console.log('Access on network:       http://' + addr.address + ':3001');
      console.log('Split-screen (iPad):     http://' + addr.address + ':3001/?users=1,2');
    }
  }
}
"
