# Image savings bookmarklet

A one-click browser bookmarklet for demoing Cloudinary image savings on **any** site.

It groups the page's images by host, works out which domains are actually serving content
imagery, measures those against Cloudinary in fetch mode with `f_auto,q_auto:eco`, and overlays
the byte savings in green. Domains can be toggled in and out live, and anything blocked is
reported with the reason.

**Install page:** https://pglithro-cloudinary.github.io/george-cloudinary-bookmarklet/
**Test fixture:** https://pglithro-cloudinary.github.io/george-cloudinary-bookmarklet/test-fixture.html

## How domains are chosen

Every image is grouped by host and counted by how many render **larger than 100×100** — the line
between content imagery and icons, swatches and tracking pixels. Any domain with **two or more**
such images is ticked and measured by default; every other domain is listed unticked so it can be
pulled in. Ticking measures on demand; unticking removes it from the total and hides its badges.

Scene7 / Dynamic Media hosts get a `SCENE7` tag, confirmed by asking the host's Image Serving API
for its `#S7Z` signature (`?req=exists`). That is cosmetic labelling only and gates nothing.

## Blocking diagnostics

The **Diagnostics** button reports:

- **CSP violations**, captured live from the `securitypolicyviolation` event with directive and
  blocked URL — the most useful signal when a run comes back empty.
- **Helper reachability** — whether the measuring iframe loaded, and if not, whether `frame-src`
  was the cause.
- **Per-domain failures**, grouped by cause: no `access-control-allow-origin` (host refuses
  cross-origin reads — unfixable client-side), no `content-length` (chunked response), HTTP 403
  (hotlink protection), or a Cloudinary 401/403 meaning the cloud isn't allowed to fetch that
  domain.

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

## Accuracy note

Modern image CDNs already negotiate AVIF. Both sides are requested with the same browser `Accept`
header, and full-size badges print `avif → avif` (or `jpeg → avif`) so the comparison is visible.
Measuring the origin as JPEG against Cloudinary as AVIF overstates the win by roughly 7 points on
Scene7.

## Verified

| Site | Result |
|---|---|
| Test fixture (4 domains, 4 size tiers) | Correct grouping, ticking, tags, on-demand measure, toggling |
| `direct.asda.com` (George, strict CSP) | 16-of-29 rule correct, CSP violations captured, helper loads |
| `www.acer.com` | 46/46 measured, 52.8% |
| `www.ikea.com`, `en.wikipedia.org` | Confirmed `connect-src` blocks third-party fetch (helper needed) |

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
