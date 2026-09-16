/**
 * Optional measurement proxy — deploy to Cloudflare Workers (free tier is plenty).
 *
 * WHY THIS EXISTS
 * Some image hosts refuse cross-origin reads, so the browser can't measure them. The fallback
 * is Cloudinary's `fl_getinfo`, but Cloudinary's fetcher sends `Accept: * / *` and there is no
 * way to change that — verified against a URL Cloudinary had never seen, sending it full Chrome
 * headers, and confirmed against the docs. On a host that content-negotiates that is badly
 * wrong: asda.scene7.com returns 333,437 bytes to `* / *` where Chrome receives 196,669.
 *
 * This worker fetches the image with a fixed, current Chrome-on-Windows header set and reports
 * the byte length, so CORS-blocked hosts are measured the way a real visitor would receive them.
 *
 * DEPLOY
 *   npx wrangler deploy measure-worker.js --name image-measure --compatibility-date 2026-01-01
 * then put the resulting URL into MEASURE_PROXY in helper.html.
 *
 * USE
 *   GET https://<worker>/?url=<encoded image url>
 *   -> {"bytes":123456,"type":"image/avif","status":200,"accept":"..."}
 */

// Chrome 152 on Windows 11, as sent for an <img> request.
const CHROME = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/152.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "sec-ch-ua": '"Not?A_Brand";v="24", "Chromium";v="152", "Google Chrome";v="152"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const target = new URL(request.url).searchParams.get("url");
    if (!target || !/^https?:\/\//i.test(target)) {
      return json({ error: "pass ?url=<http(s) image url>" }, 400);
    }

    const headers = { ...CHROME };
    // The caller may supply the Referer the image would really have been requested under,
    // which matters for origins with Referer-keyed hotlink protection.
    const referer = new URL(request.url).searchParams.get("referer");
    if (referer && /^https?:\/\//i.test(referer)) headers["Referer"] = referer;

    try {
      // HEAD first; fall back to GET for origins that reject it or omit content-length.
      let res = await fetch(target, { method: "HEAD", headers, redirect: "follow" });
      let len = res.headers.get("content-length");
      let method = "HEAD";

      if (!res.ok || !len) {
        res = await fetch(target, { method: "GET", headers, redirect: "follow" });
        method = "GET";
        len = res.headers.get("content-length");
        if (!len && res.ok) {
          // Streamed response with no length: read it to find out.
          len = String((await res.arrayBuffer()).byteLength);
          method = "GET (counted)";
        }
      }

      return json({
        bytes: len ? Number(len) : null,
        type: res.headers.get("content-type"),
        status: res.status,
        method,
        vary: res.headers.get("vary"),
        accept: CHROME.Accept
      });
    } catch (e) {
      return json({ error: String(e && e.message || e).slice(0, 200) }, 502);
    }
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}
