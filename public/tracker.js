(function () {
  var BASE = 'https://stats.acessoaneviana.com.br/t';

  function send(event, extra) {
    try {
      var params = 'e=' + encodeURIComponent(event)
        + '&p=' + encodeURIComponent(location.pathname)
        + '&r=' + encodeURIComponent(document.referrer)
        + '&_=' + Date.now();
      new Image().src = BASE + '?' + params;
    } catch (_) {}
  }

  window.AneTrack = send;
})();
