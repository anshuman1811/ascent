#!/bin/bash
set -e

echo "=== Fitness Tracker Setup ==="

# Install Node via nvm if not present
if ! command -v node &>/dev/null; then
  echo "Installing Node.js via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
fi

echo "Node: $(node --version), npm: $(npm --version)"

# Backend deps
echo "Installing server dependencies..."
cd "$(dirname "$0")/server"
npm install

# Frontend deps
echo "Installing client dependencies..."
cd ../client
npm install

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To run in DEVELOPMENT:"
echo "  Terminal 1: cd server && npm run dev"
echo "  Terminal 2: cd client && npm run dev"
echo "  Open: http://localhost:5173"
echo ""
echo "To run in PRODUCTION (pm2):"
echo "  cd client && npm run build"
echo "  cd .. && pm2 start ecosystem.config.js"
echo "  Open: http://localhost:3000"
echo ""
echo "Split-screen (iPad): http://localhost:5173/?users=1,2"
