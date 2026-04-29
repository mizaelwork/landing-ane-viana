/* ============================================================
   Ane Viana — Dashboard Unificado
   Vanilla JS, sem build. Le tudo direto do Supabase via REST.
   ============================================================ */

(function () {
  'use strict';

  const cfg = window.AneConfig || {};
  const SUPA = cfg.SUPABASE_URL;
  const KEY  = cfg.SUPABASE_ANON_KEY;
  const REFRESH_MS = (cfg.AUTO_REFRESH_SECONDS || 30) * 1000;
  const LIMIT = cfg.LEADS_LIMIT || 200;

  const hasKey = KEY && !KEY.startsWith('COLE_');
  if (!hasKey) {
    document.getElementById('configBanner').style.display = '';
  }

  // ---------- Supabase REST helpers ----------

  function headers(extra) {
    const h = {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };
    if (extra) Object.assign(h, extra);
    return h;
  }

  function sbGet(path, extraHeaders) {
    return fetch(SUPA + '/rest/v1/' + path, {
      method: 'GET',
      headers: headers(extraHeaders),
      credentials: 'omit'
    }).then(async function (r) {
      if (!r.ok) {
        const txt = await r.text().catch(function(){ return ''; });
        throw new Error('Supabase ' + r.status + ': ' + txt);
      }
      const total = r.headers.get('content-range');
      const json = await r.json();
      return { data: json, range: total };
    });
  }

  // Conta exata via HEAD + Prefer: count=exact
  function sbCount(table, filterQs) {
    const path = table + '?select=*' + (filterQs ? '&' + filterQs : '');
    return fetch(SUPA + '/rest/v1/' + path, {
      method: 'HEAD',
      headers: headers({ 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' }),
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error('count ' + r.status);
      const cr = r.headers.get('content-range') || '';
      const m  = cr.match(/\/(\d+|\*)$/);
      return m && m[1] !== '*' ? parseInt(m[1], 10) : 0;
    });
  }

  // ---------- Date helpers (BRT = America/Sao_Paulo) ----------

  function brtDateString(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }

  function brtTodayStartIso() {
    return brtDateString(new Date()) + 'T00:00:00-03:00';
  }

  function rangeStartIso(days) {
    if (!days) return null;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (days - 1));
    return brtDateString(d) + 'T00:00:00-03:00';
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(d);
    } catch (_) { return iso; }
  }
  function fmtTimeAgo(iso) {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60); if (m < 60) return m + ' min';
    const h = Math.floor(m / 60); if (h < 24) return h + ' h';
    const d = Math.floor(h / 24); if (d < 30) return d + ' d';
    return fmtDateTime(iso);
  }

  function fmtNum(n) { return (n == null ? '0' : n.toLocaleString('pt-BR')); }
  function pct(a, b) { if (!b) return '0%'; return ((a/b)*100).toFixed(1).replace('.', ',') + '%'; }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function shortReferrer(ref) {
    if (!ref) return '<span class="muted">direto</span>';
    try { return escapeHtml(new URL(ref).hostname); }
    catch (_) { return escapeHtml(ref.slice(0, 40)); }
  }

  // ---------- Auto refresh & tabs ----------

  const $ = function (id) { return document.getElementById(id); };

  let activeTab = 'pixel';
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      btn.classList.add('active'); btn.setAttribute('aria-selected','true');
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'panel-' + activeTab);
      });
    });
  });

  $('refreshBtn').addEventListener('click', function () { reloadAll(true); });

  let timer = null;
  function ensureTimer() {
    if (timer) { clearInterval(timer); timer = null; }
    if ($('autoRefresh').checked && hasKey) {
      timer = setInterval(function () { reloadAll(false); }, REFRESH_MS);
    }
  }
  $('autoRefresh').addEventListener('change', ensureTimer);

  $('pixelRange').addEventListener('change', loadPixel);

  // ---------- KPI rendering ----------

  function kpiCard(label, value, tone, meta) {
    return '<div class="kpi" data-tone="' + (tone || 'gold') + '">' +
      '<div class="kpi-label">' + escapeHtml(label) + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      (meta ? '<div class="kpi-meta">' + meta + '</div>' : '') +
      '</div>';
  }

  function kpiSkeleton(n) {
    let html = '';
    for (let i = 0; i < n; i++) {
      html += '<div class="kpi"><div class="kpi-label skel" style="width:60%;height:10px"></div>' +
              '<div class="kpi-value skel" style="width:50%;height:30px;margin-top:10px"></div></div>';
    }
    return html;
  }

  // ============================================================
  // PIXEL
  // ============================================================

  const BUTTON_DEFS = [
    { event: 'click_telegram_vip',  label: 'Telegram VIP' },
    { event: 'click_grupo_gratis',  label: 'Grupo Grátis' },
    { event: 'click_closefans',     label: 'Closefans'    },
    { event: 'click_privacy',       label: 'Privacy'      },
    { event: 'click_instagram',     label: 'Instagram'    }
  ];

  function renderButtonClicks(rows) {
    const counts = {};
    BUTTON_DEFS.forEach(function (b) { counts[b.event] = 0; });
    rows.forEach(function (r) {
      if (r.event in counts) counts[r.event]++;
    });
    const max = Math.max(1, Math.max.apply(null, Object.values(counts)));
    $('btnClicksList').innerHTML = BUTTON_DEFS.map(function (b) {
      const n = counts[b.event];
      const w = Math.round((n / max) * 100);
      return '<div class="bcl-row">' +
        '<span class="bcl-label">' + escapeHtml(b.label) + '</span>' +
        '<div class="bcl-bar-wrap"><div class="bcl-bar" style="width:' + w + '%"></div></div>' +
        '<span class="bcl-num">' + fmtNum(n) + '</span>' +
      '</div>';
    }).join('');
  }

  let pixelChart = null;

  async function loadPixel() {
    if (!hasKey) {
      $('pixelKpis').innerHTML = '<div class="banner error" style="grid-column:1/-1">Configure a anon key em <code>config.js</code> pra carregar dados.</div>';
      return;
    }

    $('pixelKpis').innerHTML = kpiSkeleton(6);
    $('pixelEventsTable').innerHTML = '<tr><td colspan="4" class="loading">Carregando…</td></tr>';
    $('pixelRecentTable').innerHTML = '<tr><td colspan="4" class="loading">Carregando…</td></tr>';

    const days = parseInt($('pixelRange').value, 10);
    const since = rangeStartIso(days);
    const sinceFilter = since ? '&created_at=gte.' + encodeURIComponent(since) : '';

    try {
      // Busca tudo do range pra calcular tudo em JS (fica simples e rapido)
      const all = await sbGet('pixel_events?select=event,path,referrer,created_at&order=created_at.desc&limit=10000' + sinceFilter);
      const rows = all.data;

      renderPixelKpis(rows, days);
      renderPixelChart(rows, days);
      renderButtonClicks(rows);
      renderPixelEventsBreakdown(rows);
      renderPixelRecent(rows.slice(0, 50));

    } catch (err) {
      console.error('[pixel]', err);
      $('pixelKpis').innerHTML = '<div class="banner error" style="grid-column:1/-1">Erro ao carregar pixel: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderPixelKpis(rows, days) {
    let pageviewsAll = 0, pageviewMain = 0, pageviewPre = 0, mainFromPre = 0;
    let clicksTotal = 0, ctaClicks = 0, clickTelVip = 0;
    rows.forEach(function (r) {
      const e = r.event || '';
      const ref = (r.referrer || '').toLowerCase();
      if (e.indexOf('pageview') === 0) {
        pageviewsAll++;
        if (e === 'pageview_main') {
          pageviewMain++;
          // chegou no main vindo do pre-landing?
          if (ref.indexOf('go.acessoaneviana') >= 0) mainFromPre++;
        } else {
          pageviewPre++;
        }
      }
      if (e === 'cta_click' || e.indexOf('click_') === 0 || e.indexOf('click') >= 0) {
        clicksTotal++;
        if (e === 'cta_click') ctaClicks++;
        if (e === 'click_telegram_vip') clickTelVip++;
      }
    });

    const periodLabel = days ? ('últimos ' + days + ' dia' + (days>1?'s':'')) : 'desde sempre';

    // Funil: pre -> click CTA -> chegou no main
    const ctrPre        = pct(ctaClicks, pageviewPre);
    const conversionPre = pct(mainFromPre, pageviewPre);

    const html =
      kpiCard('Visitas pré-site',       fmtNum(pageviewPre),  'blue',   periodLabel) +
      kpiCard('Cliques CTA pré',        fmtNum(ctaClicks),    'wine',   ctrPre + ' do pré') +
      kpiCard('Conversão pré → main',   conversionPre,        'green',  fmtNum(mainFromPre) + ' chegaram') +
      kpiCard('Visitas site principal', fmtNum(pageviewMain), 'gold',   periodLabel) +
      kpiCard('Cliques CTA (main)',     fmtNum(clicksTotal - ctaClicks), 'orange', 'todos os click_*') +
      kpiCard('Telegram VIP',           fmtNum(clickTelVip),  'purple', 'cliques no card');
    $('pixelKpis').innerHTML = html;
  }

  function renderPixelChart(rows, days) {
    if (typeof Chart === 'undefined') return;
    const span = days || 30;
    const buckets = {};
    const labels = [];
    const today = new Date();
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const key = brtDateString(d);
      buckets[key] = 0;
      labels.push(key.slice(5).replace('-', '/'));
    }
    rows.forEach(function (r) {
      const k = brtDateString(new Date(r.created_at));
      if (k in buckets) buckets[k]++;
    });
    const data = Object.values(buckets);
    $('pixelTrendInfo').textContent = data.reduce(function(a,b){return a+b;},0) + ' eventos · ' + span + ' dias';

    const ctx = $('pixelChart').getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(201,169,97,0.45)');
    grad.addColorStop(1, 'rgba(201,169,97,0.02)');

    if (pixelChart) pixelChart.destroy();
    pixelChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: '#e3c682',
          backgroundColor: grad,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#e3c682',
          pointHoverBorderColor: '#1a1208',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#161616',
            borderColor: 'rgba(255,255,255,0.16)',
            borderWidth: 1,
            titleColor: '#f5f0e8',
            bodyColor: '#c9a961',
            padding: 10,
            displayColors: false,
            callbacks: { label: function (c) { return c.parsed.y + ' eventos'; } }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#5a5650', font: { size: 10 }, maxRotation: 0 } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a5650', font: { size: 10 }, precision: 0 }, beginAtZero: true }
        }
      }
    });
  }

  function shortPath(path) {
    if (!path) return '<span class="muted">—</span>';
    const MAX = 44;
    const safe = escapeHtml(path);
    if (path.length <= MAX) return '<span class="muted">' + safe + '</span>';
    return '<span class="muted" title="' + safe + '" style="cursor:default">' +
           escapeHtml(path.slice(0, MAX)) + '&hellip;</span>';
  }

  function renderPixelEventsBreakdown(rows) {
    const map = {};
    rows.forEach(function (r) {
      const k = r.event || '(sem nome)';
      if (!map[k]) map[k] = { count: 0, paths: new Set(), last: null };
      map[k].count++;
      if (r.path) map[k].paths.add(r.path);
      if (!map[k].last || new Date(r.created_at) > new Date(map[k].last)) map[k].last = r.created_at;
    });
    const list = Object.entries(map).sort(function (a, b) { return b[1].count - a[1].count; });
    if (!list.length) {
      $('pixelEventsTable').innerHTML = '<tr><td colspan="4" class="empty">Nenhum evento no período.</td></tr>';
      return;
    }
    $('pixelEventsTable').innerHTML = list.map(function (e) {
      const name = e[0]; const v = e[1];
      const topPaths = Array.from(v.paths).slice(0, 2);
      const pathsHtml = topPaths.map(shortPath).join(' ') + (v.paths.size > 2 ? ' <span class="muted">+' + (v.paths.size - 2) + '</span>' : '');
      return '<tr>' +
        '<td><code>' + escapeHtml(name) + '</code></td>' +
        '<td class="num">' + fmtNum(v.count) + '</td>' +
        '<td class="col-path">' + (pathsHtml || '<span class="muted">—</span>') + '</td>' +
        '<td class="muted">' + fmtTimeAgo(v.last) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderPixelRecent(rows) {
    if (!rows.length) {
      $('pixelRecentTable').innerHTML = '<tr><td colspan="4" class="empty">Sem hits recentes.</td></tr>';
      return;
    }
    $('pixelRecentTable').innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td class="muted">' + fmtTimeAgo(r.created_at) + '</td>' +
        '<td><code>' + escapeHtml(r.event) + '</code></td>' +
        '<td class="col-path">' + shortPath(r.path) + '</td>' +
        '<td>' + shortReferrer(r.referrer) + '</td>' +
      '</tr>';
    }).join('');
  }

  // ============================================================
  // TELEGRAM
  // ============================================================

  let leadsCache = [];

  async function loadTelegram() {
    if (!hasKey) {
      $('telegramKpis').innerHTML = '<div class="banner error" style="grid-column:1/-1">Configure a anon key em <code>config.js</code> pra carregar dados.</div>';
      return;
    }

    $('telegramKpis').innerHTML = kpiSkeleton(6);
    $('leadsTable').innerHTML = '<tr><td colspan="9" class="loading">Carregando…</td></tr>';

    try {
      const todayIso = brtTodayStartIso();
      const [
        totalLeads,
        novosHoje,
        conversasAtivas,
        linksEnviados,
        comprasAprovadas,
        leadsResp
      ] = await Promise.all([
        sbCount('leads'),
        sbCount('leads', 'created_at=gte.' + encodeURIComponent(todayIso)),
        sbCount('conversations', 'is_open=is.true'),
        sbCount('checkout_sessions'),
        sbCount('checkout_sessions', 'status=eq.approved'),
        sbGet('leads?select=id,telegram_user_id,chat_id,username,first_name,last_name,status,stage,last_message_at,last_message_type,checkout_url_last_sent,checkout_sent_at,created_at,source&order=last_message_at.desc.nullslast&limit=' + LIMIT)
      ]);

      leadsCache = leadsResp.data || [];

      // KPIs
      const taxa = totalLeads ? ((comprasAprovadas / totalLeads) * 100).toFixed(1).replace('.', ',') + '%' : '0%';
      $('telegramKpis').innerHTML =
        kpiCard('Total de leads',      fmtNum(totalLeads),       'wine',   'desde o início') +
        kpiCard('Novos hoje',          fmtNum(novosHoje),        'gold',   'reset 00:00 BRT') +
        kpiCard('Conversas ativas',    fmtNum(conversasAtivas),  'blue',   'is_open = true') +
        kpiCard('Links enviados',      fmtNum(linksEnviados),    'purple', 'checkout_sessions') +
        kpiCard('Compras aprovadas',   fmtNum(comprasAprovadas), 'green',  'status = approved') +
        kpiCard('Taxa lead → compra',  taxa,                     'orange', '');

      renderLeadsTable();

    } catch (err) {
      console.error('[telegram]', err);
      $('telegramKpis').innerHTML = '<div class="banner error" style="grid-column:1/-1">Erro ao carregar leads: ' + escapeHtml(err.message) + '</div>';
      $('leadsTable').innerHTML = '<tr><td colspan="9" class="empty">—</td></tr>';
    }
  }

  function deriveStatus(lead) {
    const now = Date.now();
    const lastMs = lead.last_message_at ? new Date(lead.last_message_at).getTime() : null;
    const stale = lastMs && (now - lastMs > 24 * 3600 * 1000);
    const status = (lead.status || '').toLowerCase();
    const stage  = (lead.stage  || '').toLowerCase();

    // Cakto webhook grava status='converted' e stage='converted' quando aprovado
    if (status === 'converted' || stage === 'converted') {
      return { key: 'compra', label: 'Compra aprovada' };
    }
    // PIX gerado mas ainda não pago
    if (stage === 'payment_pending') {
      return { key: 'interessado', label: 'PIX gerado' };
    }
    if (lead.checkout_sent_at || lead.checkout_url_last_sent) {
      return { key: 'link', label: 'Link enviado' };
    }
    if (stale) return { key: 'frio', label: 'Frio' };
    if (stage.indexOf('engaged') >= 0 || status === 'engaged') {
      return { key: 'respondeu', label: 'Respondeu' };
    }
    return { key: 'novo', label: 'Novo lead' };
  }

  function fullName(lead) {
    return [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
  }

  function renderLeadsTable() {
    const q = ($('leadSearch').value || '').toLowerCase().trim();
    const fStatus = $('leadStatus').value;

    const filtered = leadsCache.filter(function (l) {
      if (fStatus) {
        const s = deriveStatus(l).key;
        if (s !== fStatus) return false;
      }
      if (q) {
        const blob = (
          (l.first_name || '') + ' ' +
          (l.last_name || '')  + ' ' +
          (l.username || '')   + ' ' +
          (l.chat_id || '')    + ' ' +
          (l.telegram_user_id || '')
        ).toLowerCase();
        if (blob.indexOf(q) < 0) return false;
      }
      return true;
    });

    if (!filtered.length) {
      $('leadsTable').innerHTML = '<tr><td colspan="9" class="empty">Nenhum lead encontrado.</td></tr>';
      return;
    }

    $('leadsTable').innerHTML = filtered.map(function (l) {
      const st = deriveStatus(l);
      const linkSent = l.checkout_sent_at || l.checkout_url_last_sent;
      const purchase = (l.status || '') === 'converted' || (l.stage || '') === 'converted';
      const username = l.username ? '@' + escapeHtml(l.username) : '<span class="muted">—</span>';
      const msgType  = l.last_message_type || '—';
      return '<tr data-lead-id="' + escapeHtml(l.id) + '">' +
        '<td class="muted">' + fmtTimeAgo(l.last_message_at) + '</td>' +
        '<td>' + escapeHtml(fullName(l)) + '</td>' +
        '<td>' + username + '</td>' +
        '<td class="num muted">' + escapeHtml(l.chat_id || '—') + '</td>' +
        '<td class="muted">' + escapeHtml(msgType) + '</td>' +
        '<td><span class="badge badge-' + st.key + '">' + st.label + '</span></td>' +
        '<td>' + (linkSent ? '<span class="dot-yes" title="Link enviado"></span>' : '<span class="dot-no"></span>') + '</td>' +
        '<td>' + (purchase ? '<span class="dot-yes" title="Compra aprovada"></span>' : '<span class="dot-no"></span>') + '</td>' +
        '<td><button class="icon-btn js-open" type="button" title="Abrir">›</button></td>' +
      '</tr>';
    }).join('');

    document.querySelectorAll('#leadsTable tr[data-lead-id]').forEach(function (tr) {
      tr.addEventListener('click', function () { openLead(tr.dataset.leadId); });
    });
  }

  $('leadSearch').addEventListener('input',  renderLeadsTable);
  $('leadStatus').addEventListener('change', renderLeadsTable);

  // ============================================================
  // Modal de detalhe
  // ============================================================

  const modal = $('leadModal');
  $('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }

  async function openLead(leadId) {
    const lead = leadsCache.find(function (l) { return String(l.id) === String(leadId); });
    if (!lead) return;

    $('modalId').textContent = 'Lead #' + lead.id;
    $('modalName').textContent = fullName(lead);
    $('modalUsername').textContent = lead.username ? '@' + lead.username : '';

    const tg = lead.username ? ('https://t.me/' + lead.username) : '';
    const tgEl = $('modalOpenTg');
    if (tg) { tgEl.href = tg; tgEl.style.display = ''; } else { tgEl.style.display = 'none'; }

    $('modalCopyChat').onclick = function () { copyToClipboard(lead.chat_id || ''); };

    const st = deriveStatus(lead);
    $('modalMeta').innerHTML =
      metaCard('Status',      '<span class="badge badge-' + st.key + '">' + st.label + '</span>') +
      metaCard('Chat ID',     escapeHtml(lead.chat_id || '—')) +
      metaCard('Telegram UID', escapeHtml(lead.telegram_user_id || '—')) +
      metaCard('Source',      escapeHtml(lead.source || '—')) +
      metaCard('Cadastrado',  fmtDateTime(lead.created_at)) +
      metaCard('Última msg',  fmtDateTime(lead.last_message_at)) +
      metaCard('Link enviado', lead.checkout_sent_at ? fmtDateTime(lead.checkout_sent_at) : '—') +
      metaCard('Checkout',    lead.checkout_url_last_sent
        ? '<a href="' + escapeHtml(lead.checkout_url_last_sent) + '" target="_blank" rel="noopener">abrir →</a>'
        : '—');

    $('modalThread').innerHTML = '<div class="loading">Carregando mensagens…</div>';
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false');

    try {
      const r = await sbGet('messages?select=direction,text_content,message_type,created_at&lead_id=eq.' + encodeURIComponent(lead.id) + '&order=created_at.desc&limit=80');
      const msgs = (r.data || []).reverse();
      if (!msgs.length) {
        $('modalThread').innerHTML = '<div class="empty">Sem mensagens registradas.</div>';
        return;
      }
      $('modalThread').innerHTML = msgs.map(function (m) {
        const cls = m.direction === 'outgoing' ? 'bubble bubble-out' : 'bubble bubble-in';
        const txt = m.text_content || ('[' + (m.message_type || 'mídia') + ']');
        return '<div class="' + cls + '">' + escapeHtml(txt) +
               '<span class="bubble-time">' + fmtDateTime(m.created_at) + '</span></div>';
      }).join('');
      const thread = $('modalThread');
      thread.scrollTop = thread.scrollHeight;
    } catch (err) {
      $('modalThread').innerHTML = '<div class="banner error">Erro ao carregar mensagens: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function metaCard(label, value) {
    return '<div class="meta-card"><div class="meta-label">' + escapeHtml(label) + '</div>' +
           '<div class="meta-value">' + value + '</div></div>';
  }

  // ============================================================
  // Util: clipboard + toast
  // ============================================================

  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Chat ID copiado'); });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Chat ID copiado'); } catch (_){}
      document.body.removeChild(ta);
    }
  }

  let toastT;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  // ============================================================
  // Boot
  // ============================================================

  function setLastUpdate() {
    $('lastUpdate').textContent = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date());
  }

  function reloadAll(manual) {
    if (manual) setLastUpdate();
    Promise.all([loadPixel(), loadTelegram()]).then(setLastUpdate).catch(function () {});
  }

  reloadAll(true);
  ensureTimer();
})();
