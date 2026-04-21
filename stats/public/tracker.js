(function () {
  var ENDPOINT = 'https://stats.acessoaneviana.com.br/track';

  function send(event, extra) {
    try {
      var payload = JSON.stringify(Object.assign({
        event    : event,
        page     : location.pathname,
        referrer : document.referrer
      }, extra || {}));
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
      } else {
        var x = new XMLHttpRequest();
        x.open('POST', ENDPOINT, true);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send(payload);
      }
    } catch (_) {}
  }

  window.AneTrack = send;
})();
