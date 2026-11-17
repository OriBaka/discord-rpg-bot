// Local web-only preview, without a Discord token. Production uses npm start.
require('dotenv').config();
const db = require('../db/database');
const { startDashboard } = require('./server');
const server = startDashboard(db);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  if (!server) { db.close(); return; }
  server.close(() => { db.close(); process.exit(0); });
  server.closeIdleConnections();
});
