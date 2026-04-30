// Pixel da Ane Viana — escreve direto no Supabase + encaminha pro n8n (Meta CAPI).
// Carregado nas LPs em produção. Mantém a assinatura window.AneTrack(event)
// usada nos onclick existentes — zero alteração no HTML dos sites.
(function () {
  var SUPABASE_URL  = 'https://bakypfaugnsxkvkjasta.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJha3lwZmF1Z25zeGt2a2phc3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODQ1NzMsImV4cCI6MjA5MjU2MDU3M30.OxQrOg-ApiXuOXJAP2VbPshRJDP5bBetNqsGRFxGvrs';
  var CAPI_WEBHOOK  = 'https://stats.acessoaneviana.com.br/capi';

  function getCookie(name) {
    var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m[2] : null;
  }

  function send(event) {
    if (!event) return;
    try {
      var payload = {
        event:      String(event),
        path:       location.pathname + location.search,
        url:        location.href,
        referrer:   document.referrer || null,
        user_agent: navigator.userAgent || null,
        fbp:        getCookie('_fbp') || null,
        fbc:        getCookie('_fbc') || null
      };

      // 1. Supabase (histórico do dashboard)
      fetch(SUPABASE_URL + '/rest/v1/pixel_events', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + SUPABASE_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          event:      payload.event,
          path:       payload.path,
          referrer:   payload.referrer,
          user_agent: payload.user_agent
        }),
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});

      // 2. stats/capi → Meta Conversions API (server-side, IP real capturado)
      fetch(CAPI_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});

    } catch (_) {}
  }

  window.AneTrack = send;
})();
