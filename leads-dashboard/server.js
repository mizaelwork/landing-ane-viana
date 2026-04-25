// Mini servidor Express que substitui o stats antigo.
// - tracker.js / config.js sao publicos (sites em producao carregam sem auth)
// - dashboard (resto) protegido por Basic Auth
// - /t aceita hits legados sem fazer nada (compat: caches antigos)
// Env vars (qualquer um dos pares funciona — facilita compat com a config atual do EasyPanel):
//   BASIC_AUTH_USER / BASIC_AUTH_PASS
//   AUTH_USER       / AUTH_PASS
//   USERNAME        / PASSWORD
//   STATS_USER      / STATS_PASS

const express  = require('express');
const basicAuth = require('express-basic-auth');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// 1x1 GIF transparente (compat com tracker antigo que ainda esteja em cache)
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// --- Rotas publicas (antes do middleware de auth) -----------------

// tracker.js precisa ser carregavel sem auth (sites de producao usam <script src=...>)
app.get('/tracker.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, 'tracker.js'));
});

// config.js: contem so a anon key publica do Supabase, ok ser publico
app.get('/config.js', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(__dirname, 'config.js'));
});

// /t: endpoint legado do pixel antigo. Aceita e devolve gif silencioso.
app.get('/t', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'image/gif').status(200).send(PIXEL_GIF);
});

// healthcheck
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// --- Basic Auth para o dashboard ----------------------------------

const user =
  process.env.BASIC_AUTH_USER ||
  process.env.AUTH_USER ||
  process.env.USERNAME ||
  process.env.STATS_USER ||
  process.env.DASHBOARD_USER ||
  'admin';                       // fallback se so a senha estiver setada
const pass =
  process.env.BASIC_AUTH_PASS ||
  process.env.AUTH_PASS ||
  process.env.PASSWORD ||
  process.env.STATS_PASS ||
  process.env.DASHBOARD_PASSWORD; // compat com setup atual do EasyPanel

if (user && pass) {
  console.log('[stats] Basic Auth ativo para usuario:', user);
  app.use(basicAuth({
    users: { [user]: pass },
    challenge: true,
    realm: 'Ane Viana - Painel'
  }));
} else {
  console.warn('[stats] Sem credenciais de Basic Auth setadas. Dashboard ABERTO. Defina BASIC_AUTH_USER e BASIC_AUTH_PASS.');
}

// --- Estatico (dashboard) -----------------------------------------

app.use(express.static(__dirname, {
  extensions: ['html'],
  etag: true,
  lastModified: true,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
  }
}));

// --- Boot ----------------------------------------------------------

app.listen(PORT, () => {
  console.log('[stats] Dashboard rodando na porta', PORT);
});
