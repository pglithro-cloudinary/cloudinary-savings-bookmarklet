# Scene7 → Cloudinary savings bookmarklet

A one-click browser bookmarklet for demoing image performance gains on **any** site running
Adobe Scene7 / Dynamic Media.

It finds Scene7 imagery by URL structure rather than a hardcoded domain, proves each candidate
host really is a Scene7 image server, re-fetches every image through Cloudinary in fetch mode
with `f_auto,q_auto:eco`, compares `content-length`, and overlays the byte savings in bright
green on each image plus a summary panel with the page total.

**Install page:** https://pglithro-cloudinary.github.io/george-cloudinary-bookmarklet/

## Detection, then proof

Most Scene7 customers serve from a vanity CNAME (`images.acer.com`), so the hostname gives
nothing away. Candidate scoring looks for:

- a `*.scene7.com` host (+4)
- an `/is/image/` or `/is/content/` path (+3)
- Scene7-specific query params — `resmode`, `op_usm`, `scl`, `defaultImage`… (+2 each, capped at 4)
- generic imaging params — `wid`, `hei`, `qlt`, `fmt`… (+1 each, capped at 3)
- `$preset$` macro syntax (+2)

A score of 3+ makes it a candidate. Candidates are then **verified against the live server**
before any number is shown:

1. `GET <base>?req=exists` — Scene7's Image Serving API answers every `req=` command with an
   `#S7Z OK` block in `text/plain`, sent with `access-control-allow-origin: *`. No static CDN
   produces this, and it works even for an asset that doesn't exist.
2. Fallback for deployments that block `req=`: compare `?wid=20` against `?wid=600`. A static
   CDN returns identical bytes; a Scene7 server doesn't.

Only verified hosts get measured. If nothing verifies, you get an alert naming each host and
why it failed, rather than a confident number about a CDN that isn't Scene7.

Verified working on `asda.scene7.com` (George) and `images.acer.com` (vanity CNAME, no
`scene7.com` anywhere in the URL). The `#S7Z` signature was additionally confirmed against
`assets.ace.aaa.com`, `m.ahstatic.com`, `dynamicmedia.accenture.com` and
`images.albertsons-media.com`.

## Why there's a helper page

Retail sites increasingly ship a strict Content-Security-Policy. George's `connect-src`
allowlist excludes both `res.cloudinary.com` *and* `asda.scene7.com`, so a `fetch()` from the
page is refused for both sides of the comparison; `img-src` excludes Cloudinary too, so the
page can't even display a Cloudinary image (a true visual swap needs a browser extension).

What CSP does allow there is `frame-src *`. A cross-origin iframe is a separate document
governed by its own CSP, so `helper.html` on this origin does the verifying and measuring and
posts results back via `postMessage`. The page itself only draws DOM overlays, which CSP
doesn't restrict.

The helper only measures hosts it verified as Scene7 in that same session, and only through the
configured Cloudinary cloud, so framing it doesn't make it a general-purpose measurement proxy.

## Accuracy note

Scene7 already negotiates AVIF. Measuring it with fetch's default `Accept: */*` returns
WebP/JPEG and overstates the win by roughly 7 points. Both sides are requested with the same
browser `Accept` header, and the full-size badges print `avif → avif` so it's visible that the
comparison is like-for-like.

## Notes

- Sizes come from `content-length` on a `HEAD` request; anything served without it is skipped.
- Totals count each unique image URL once, even when it appears several times on the page.
- Images under 45px (colour swatches) get the green ring but no badge — they still count.
- Savings are format + quality only. Responsive sizing would increase them further.
- Cloudinary fetch mode must be allowed to pull from the customer's domain.
- Delivery uses the `patrickg` cloud; change `cloudinaryPrefix` in `index.html` to repoint it.

## Editing

The bookmarklet lives as a readable function (`cloudinarySavings`) inside `index.html`. The page
stringifies it at load time to build the `javascript:` URL, so editing the function updates the
bookmark code, the copy box, and the displayed source together. Changing `helper.html` takes
effect immediately — no re-install needed.
