require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const requireAuth = require('./middleware/auth');
const { scheduleBackups } = require('./services/backup');

const app = express();
app.use(cors());
app.use(express.json());

// Public: auth endpoint (no token required)
app.use('/api/auth', require('./routes/auth'));

// All routes below require a valid JWT
app.use('/api', requireAuth);

app.use('/api/canvas',        require('./routes/canvas'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/classes',       require('./routes/classes'));
app.use('/api/sessions',      require('./routes/sessions'));
app.use('/api/attendance',    require('./routes/attendance'));
app.use('/api/participation', require('./routes/participation'));
app.use('/api/assignments',   require('./routes/assignments'));
app.use('/api/grades',        require('./routes/grades'));
app.use('/api/llm',           require('./routes/llm'));
app.use('/api/email',         require('./routes/email'));
app.use('/api/admin',         require('./routes/admin'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Serve the built React frontend (production only)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

const PORT = process.env.PORT || 3001;

// sql.js needs to load its WASM binary before we can take any requests
db.initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
    scheduleBackups();
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
