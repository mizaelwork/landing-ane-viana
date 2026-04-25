// Pixel da Ane Viana — escreve direto no Supabase.
// Carregado nas LPs em produção. Mantém a assinatura window.AneTrack(event)
// usada nos onclick existentes — zero alteração no HTML dos sites.
(function () {
  var SUPABASE_URL = 'https://bakypfaugnsxkvkjasta.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJha3lwZmF1Z25zeGt2a2phc3RhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODQ1NzMsImV4cCI6MjA5MjU2MDU3M30.OxQrOg-ApiXuOXJAP2VbPshRJDP5bBetNqsGRFxGvrs';

  function send(event) {
    if (!event) return;
    try {
      var body = JSON.stringify({
        event: String(event),
        path: location.pathname + location.search,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent || null
      });
      fetch(SUPABASE_URL + '/rest/v1/pixel_events', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + SUPABASE_ANON,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: body,
        keepalive: true,
        credentials: 'omit'
      }).catch(function () {});
    } catch (_) {}
  }

  window.AneTrack = send;
})();
