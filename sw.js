// Service worker whose only job is to let the helper page observe the Accept header
// this browser really sends on an <img> request, rather than guessing it from the UA string.
//
// It intercepts exactly one path — accept-probe.gif — and lets every other request go
// straight to the network untouched. It caches nothing.

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

// A 1x1 transparent GIF, so the probe costs nothing and always decodes.
var PIXEL = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b
]);

self.addEventListener("fetch", function (event) {
  var url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (url.pathname.indexOf("/accept-probe.gif") === -1) return;  // leave everything else alone

  var accept = event.request.headers.get("accept") || "";
  var dest = event.request.destination;

  event.respondWith((async function () {
    var clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    clients.forEach(function (c) {
      c.postMessage({ type: "cld-accept-probe", accept: accept, dest: dest });
    });
    return new Response(PIXEL, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" }
    });
  })());
});
