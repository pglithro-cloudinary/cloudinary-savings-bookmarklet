# Image savings bookmarklet

A one-click browser bookmarklet for demoing Cloudinary image savings on **any** site.

It groups the page's images by host, works out which domains are actually serving content
imagery, measures those against Cloudinary in fetch mode with `f_auto,q_auto:eco`, and overlays
the byte savings in green. Domains can be toggled in and out live, and anything blocked is
reported with the reason.

**Install page:** https://pglithro-cloudinary.github.io/cloudinary-savings-bookmarklet/
**Test fixture:** https://pglithro-cloudinary.github.io/cloudinary-savings-bookmarklet/test-fixture.html

## How domains are chosen

Every image is grouped by host and counted by how many render **larger than 100×100** — the line
between content imagery and icons, swatches and tracking pixels. Any domain with **two or more**
such images is ticked and measured by default; a domain with one is listed but unticked. Ticking
measures on demand; unticking removes it from the total and hides its badges.

Domains with *nothing* over 100×100 — tracking pixels, consent-banner icons, colour swatches — are
moved into an **Advanced** section rather than cluttering the main list. They stay tickable, and
anything ticked moves back into the main list so it's clear what's feeding the total.

Scene7 / Dynamic Media hosts get a `SCENE7` tag, confirmed by asking the host's Image Serving API
for its `#S7Z` signature (`?req=exists`). That is cosmetic labelling only and gates nothing.

## How originals get measured

Three paths, best first. Diagnostics report which one each domain used.

1. **Resource Timing, in the page.** `encodedBodySize` is readable for same-origin images, and
   for cross-origin ones sending `Timing-Allow-Origin`. This is the real number of bytes the
   browser downloaded for its own `<img>` request — better than anything we can synthesise. It
   covers sites serving imagery from their own origin, which is also the common case for hosts
   that refuse CORS.
2. **Cross-origin fetch from the helper**, with the browser's own `Accept` header.
3. **Cloudinary, server-side.** `fl_getinfo` on the fetch URL returns `input.bytes` (what
   Cloudinary pulled) and `output.bytes` (what it would serve, honouring our `Accept`). CORS
   doesn't apply server-side, so this rescues hosts that block cross-origin reads entirely —
   `images.jackjones.com`, for example, goes from unmeasurable to 10/10.

### Why path 3 is excluded from the headline by default

Cloudinary's fetcher sends `Accept: */*`. Measured, `input.bytes` is *exactly* what the origin
returns to `*/*` — so on a host that content-negotiates it reports a representation the browser
would never receive:

| host | negotiates? | browser receives | `fl_getinfo` reports |
|---|---|---|---|
| `asda.scene7.com` | yes | 196,669 | 333,437 — **+69%** |
| `images.acer.com` | yes | 2,564 | 10,473 — **4×** |
| `images.jackjones.com` | no | 399,503 | 399,503 ✓ |
| `www.banyantree.com` | no | 849 | 849 ✓ |

An inflated original inflates the saving, which is exactly the failure mode that makes a demo
number indefensible. Across the hosts sampled, every one that blocked CORS also failed to
negotiate — so the fallback is accurate precisely where it's needed — but that correlation is a
pattern, not a guarantee, and it can't be tested at runtime from the browser.

So domains measured this way are tagged `SERVER-SIDE`, left **unticked**, and kept out of the
total until deliberately included; a caution appears in the panel itself, not just in diagnostics.
Scene7-confirmed hosts never take this path at all. The console prints the check that settles it:

```
curl -sI -H 'Accept: image/avif,image/webp,*/*' '<url>' | grep -i content-length
curl -sI -H 'Accept: */*'                       '<url>' | grep -i content-length
```

Equal lengths mean the figure is sound; different lengths mean that host negotiates and the
server-side saving is overstated.

## Known limitation: origins that block Cloudinary

Some sites' WAFs refuse Cloudinary's fetcher. `www.banyantree.com` answers it with 403, so the
original is measurable via Resource Timing but no optimised version can be produced at all.
Cloudinary reports this as HTTP 400 with the real cause in an `x-cld-error` header that browsers
can't read cross-origin, so the console prints a curl command that will show it:

```
curl -sI '<cloudinary fetch url>' | grep -i x-cld-error
```

Fixing it is an origin-side change — allowlist Cloudinary's fetcher, or use upload rather than
fetch delivery.

## Navigation

Single-page-app route changes leave the document intact, which used to strand badges on images
that had gone and totals describing the previous page. URL changes are now detected (via
`pushState`/`replaceState`/`popstate`/`hashchange` plus a poll); overlays clear immediately and
the panel offers a re-scan, with an opt-in "re-scan automatically" toggle. A close button unwinds
everything — overlays removed, outlines restored, listeners detached, `history` methods restored.
Re-running the bookmarklet tears down any previous instance first, so panels can't stack.

## Blocking diagnostics

The **Diagnostics** button reports:

- **CSP violations**, captured live from the `securitypolicyviolation` event with directive and
  blocked URL — the most useful signal when a run comes back empty.
- **Helper reachability** — whether the measuring iframe loaded, and if not, whether `frame-src`
  was the cause.
- **Per-domain failures**, grouped by cause: no `content-length` (chunked response), HTTP 403
  (hotlink protection), a Cloudinary 401/403 meaning the cloud isn't allowed to fetch that domain,
  or a Cloudinary 400 meaning the origin refused Cloudinary's fetcher.
- **Which measurement path** produced each domain's originals, with the server-side caveat.

Measurement degrades gracefully: `HEAD` first, falling back to `GET` with the body cancelled once
headers arrive, for hosts that reject HEAD or omit `content-length`. When a fetch fails outright a
`no-cors` probe separates "won't let us read it" from "couldn't reach it".

## Why there's a helper page

Strict CSP is now the norm — George, IKEA and Wikipedia all block `connect-src` to third-party
origins, so a `fetch()` from the page is refused for both sides of the comparison. What they do
allow is framing. A cross-origin iframe is a separate document with its own CSP, so `helper.html`
does the measuring and posts results back via `postMessage`; the page only draws DOM overlays,
which CSP doesn't restrict.

The helper can only read a size when the target server sends `access-control-allow-origin` — the
browser enforces that, not the helper — so framing it grants no access the framing page lacked.

## Rendering

Badges live in one fixed overlay layer rather than wrapping each image, so the page's own layout
is never touched; they reposition on scroll and resize. The panel lives in a shadow root so page
CSS can't reach it. Badge sizes step down with the image (full → percentage-only → ring-only
below 45px).

## Request fairness

The origin and the Cloudinary URL are measured by the same function, from the same origin, with
the same options — they differ only in the URL. Verified against an echo endpoint: every header
that reaches the server is byte-identical across the two requests.

`Accept` is the only header set explicitly, and it matters — it decides which format a CDN hands
back. It is not guessed from the UA string: a service worker (`sw.js`) observes the header this
browser actually sends on an `<img>` request and both sides use that exact string. If service
workers are unavailable it falls back to a UA-derived guess, and diagnostics say which was used.

The HTTP method used on each side is recorded, and any image measured by different methods (one
side falling back from `HEAD` to `GET`) is flagged in diagnostics.

Two honest caveats, both symmetric so they don't skew the comparison:

- Requests carry `Sec-Fetch-Dest: empty` / `Sec-Fetch-Mode: cors` because they're `fetch` calls,
  where a real `<img>` load would send `image` / `no-cors`.
- `Referer` is the helper's origin, not the page being measured. A host with Referer-keyed hotlink
  protection will refuse both sides equally, surfacing as HTTP 403 in diagnostics.

Modern CDNs already negotiate AVIF, and full-size badges print `avif → avif` (or `jpeg → avif`) so
the like-for-like comparison is visible. Measuring the origin as JPEG against Cloudinary as AVIF
would overstate the win by roughly 7 points on Scene7 — 322 KB with a default `*/*` Accept versus
197 KB with a real browser one.

## Verified

| Site | Result |
|---|---|
| Test fixture (4 domains, 4 size tiers) | Correct grouping, ticking, tags, on-demand measure, toggling |
| `direct.asda.com` (George, strict CSP) | 16-of-29 rule correct, CSP violations captured, helper loads |
| `www.acer.com` | 46/46 measured, 52.8% |
| `www.ikea.com`, `en.wikipedia.org` | Confirmed `connect-src` blocks third-party fetch (helper needed) |
| `images.jackjones.com` (no CORS) | 64 measured via `fl_getinfo`; excluded by default, 58.9% on opt-in |
| `www.banyantree.com` (no CORS) | Originals readable via Resource Timing; Cloudinary blocked by origin WAF |

## Notes

- Sizes come from `content-length`; anything served without it is skipped.
- Totals count each unique image URL once.
- Only `<img>` elements are inspected — CSS backgrounds and `<canvas>` aren't.
- Savings are format + quality only. Responsive sizing would increase them further.
- Delivery uses the `patrickg` cloud; change `CLOUD` in `index.html` to repoint it.

## Editing

The bookmarklet is a readable function (`cloudinarySavings`) inside `index.html`, stringified at
load time to build the `javascript:` URL. Editing it updates the bookmark code, the copy box and
the displayed source together. `helper.html` changes take effect without re-installing; payload
changes need the bookmark re-dragging.
