const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

require('./db/index'); // init DB + seed

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/users',     require('./routes/users'));
app.use('/api/foods',     require('./routes/foods'));
app.use('/api/meals',     require('./routes/meals'));
app.use('/api/exercises', require('./routes/exercises'));
app.use('/api/routines',  require('./routes/routines'));
app.use('/api/workouts',  require('./routes/workouts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/images',    require('./routes/images'));

// Serve uploaded images
const uploadsDir = path.join(__dirname, '../data/uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Serve the built React client (production mode)
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Print all local network addresses on startup
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  return ips;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nFitTrack running on port ${PORT}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of getLocalIPs()) {
    console.log(`  Network: http://${ip}:${PORT}  ← use this on iPad/phone`);
  }
  if (fs.existsSync(clientDist)) {
    console.log(`  Mode:    production (serving built client)`);
  } else {
    console.log(`  Mode:    API only (run 'npm run dev' in client/ for frontend)`);
  }
  console.log();
});
