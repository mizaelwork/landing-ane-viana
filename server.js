const express    = require('express');
const Database   = require('better-sqlite3');
const basicAuth  = require('express-basic-auth');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const PASS = process.env.DASHBOARD_PASSWORD || '123456';

/* ── DB ─────────────────────────────────────────────── */
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'stats.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event      TEXT    NOT NULL,
    page       TEXT,
    referrer   TEXT,
    ip         TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

/* ── MIDDLEWARE ─────────────────────────────────────── */
app.use(express.json());
app.use(express.text({ type: '*/*' }));

/* tracker.js — público, sem auth, CORS liberado */
app.get('/tracker.js', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(__dirname, 'public', 'tracker.js'));
});

/* CORS total para o endpoint de tracking */
app.use('/track', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

/* ── TRACKING ───────────────────────────────────────── */
app.post('/track', (req, res) => {
  try {
    const body  = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { event, page, referrer } = body || {};
    const ip    = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    if (event) {
      db.prepare('INSERT INTO events (event, page, referrer, ip) VALUES (?, ?, ?, ?)')
        .run(event, page || null, referrer || null, ip || null);
    }
  } catch (_) {}
  res.sendStatus(200);
});

/* ── AUTH ───────────────────────────────────────────── */
const auth = basicAuth({ users: { ane: PASS }, challenge: true, realm: 'Stats' });

/* ── API ────────────────────────────────────────────── */
app.get('/api/stats', auth, (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 90);
  const since = `datetime('now', '-${days} days')`;

  const count = (ev) =>
    db.prepare(`SELECT COUNT(*) as n FROM events WHERE event = ? AND created_at >= ${since}`).get(ev).n;

  const series = (ev) =>
    db.prepare(`
      SELECT date(created_at, 'localtime') as day, COUNT(*) as n
      FROM events WHERE event = ? AND created_at >= ${since}
      GROUP BY day ORDER BY day
    `).all(ev);

  const allEvents = db.prepare(`
    SELECT event, COUNT(*) as n FROM events
    WHERE created_at >= ${since}
    GROUP BY event ORDER BY n DESC
  `).all();

  const recent = db.prepare(`
    SELECT event, page, created_at FROM events
    ORDER BY id DESC LIMIT 50
  `).all();

  res.json({
    period: days,
    allEvents,
    recent,
    funnel: {
      prelanding_views : count('pageview_prelanding'),
      cta_clicks       : count('cta_click'),
      main_views       : count('pageview_main'),
      telegram_clicks  : count('click_telegram_vip'),
      grupo_clicks     : count('click_grupo_gratis'),
      closefans_clicks : count('click_closefans'),
      privacy_clicks   : count('click_privacy'),
      instagram_clicks : count('click_instagram'),
    },
    series: {
      prelanding : series('pageview_prelanding'),
      cta        : series('cta_click'),
      main       : series('pageview_main'),
    }
  });
});

/* ── DASHBOARD ──────────────────────────────────────── */
app.get('/', auth, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => console.log(`Stats running on :${PORT}`));
