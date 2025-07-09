// app/routes/pixel.js
import { json } from "@remix-run/node";

// ← pull in your in-memory settings (swap this out for your DB or KV store)
import { getSettings } from "~/settings.server";

export const loader = async () => {
  const { pixelId } = await getSettings();

  const snippet = `
    !(function(f,b,e,v,n,t,s){
      if(f.fbq) return; 
      n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)
      }; 
      if(!f._fbq) f._fbq=n; 
      n.push=n; n.loaded=!0; n.version='2.0'; 
      n.queue=[]; t=b.createElement(e); t.async=!0; 
      t.src=v; s=b.getElementsByTagName(e)[0]; 
      s.parentNode.insertBefore(t,s)
    })(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
  `;

  return new Response(snippet, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
};