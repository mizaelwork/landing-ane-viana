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
const https    = require('https');

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

// --- Meta Conversions API proxy ----------------------------------
// Recebe eventos do tracker.js, captura IP real e encaminha ao Meta CAPI.
// Token configurado via env var META_CAPI_TOKEN no EasyPanel.

const CAPI_PIXEL_ID = '4404191296561458';
const CAPI_TOKEN    = process.env.META_CAPI_TOKEN || '';

const EVENT_MAP = {
  pageview_prelanding: 'PageView',
  pageview_main:       'PageView',
  cta_click:           'Lead',
  click_telegram_vip:  'Lead',
  click_grupo_gratis:  'ViewContent',
  click_closefans:     'ViewContent',
  click_privacy:       'ViewContent',
  click_instagram:     'ViewContent'
};

app.use('/capi', express.json({ limit: '16kb' }));
app.use('/capi', express.urlencoded({ extended: false, limit: '16kb' }));

app.options('/capi', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/capi', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.status(200).json({ ok: true });

  if (!CAPI_TOKEN) return;

  try {
    const body = req.body || {};
    const raw  = body.d ? JSON.parse(body.d) : body;
    const eventName = EVENT_MAP[raw.event];
    if (!eventName) return;

    const clientIp =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress ||
      null;

    const userData = {};
    if (clientIp)       userData.client_ip_address  = clientIp;
    if (raw.user_agent) userData.client_user_agent   = raw.user_agent;
    if (raw.fbp)        userData.fbp                 = raw.fbp;
    if (raw.fbc)        userData.fbc                 = raw.fbc;

    const payload = JSON.stringify({
      data: [{
        event_name:       eventName,
        event_time:       Math.floor(Date.now() / 1000),
        action_source:    'website',
        event_source_url: raw.url || null,
        user_data:        userData,
        custom_data:      { ane_event: raw.event }
      }]
    });

    const options = {
      hostname: 'graph.facebook.com',
      path:     `/v18.0/${CAPI_PIXEL_ID}/events?access_token=${encodeURIComponent(CAPI_TOKEN)}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    const req2 = https.request(options, (r) => {
      r.resume();
      if (r.statusCode !== 200) {
        let body = '';
        r.on('data', c => { body += c; });
        r.on('end', () => console.error('[capi] Meta erro', r.statusCode, body));
      }
    });
    req2.on('error', (e) => console.error('[capi] request error', e.message));
    req2.write(payload);
    req2.end();

  } catch (e) {
    console.error('[capi] parse error', e.message);
  }
});

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
