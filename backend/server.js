require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/canvas',        require('./routes/canvas'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/classes',       require('./routes/classes'));
app.use('/api/sessions',      require('./routes/sessions'));
app.use('/api/attendance',    require('./routes/attendance'));
app.use('/api/participation', require('./routes/participation'));
app.use('/api/assignments',   require('./routes/assignments'));
app.use('/api/grades',        require('./routes/grades'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;

// sql.js needs to load its WASM binary before we can take any requests
db.initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
