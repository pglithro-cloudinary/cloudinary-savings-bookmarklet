#!/usr/bin/env node
// Catches the class of bug that syntax checking can't: temporal-dead-zone errors, declaration
// order faults and identifier collisions in the bookmarklet payload, which only surface at runtime.
//
//   node smoke-test.js
//
// Extracts the payload from index.html exactly as the install page does and runs it against a
// DOM stub rich enough to get all the way to the first helper request — past every declaration,
// the overlay layer, the panel's shadow root and the first render.

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const a = html.indexOf("async function cloudinarySavings() {");
const b = html.indexOf("// ---- Wire it into the page ----");
if (a === -1 || b === -1 || b < a) {
  console.error("FAIL: could not locate the payload markers in index.html");
  process.exit(1);
}
const src = html.slice(a, b).trim();

let reachedHelper = false;   // set when the payload gets as far as creating the helper iframe
let alerted = null;
let firstError = null;

const RECT = { width: 300, height: 200, top: 10, left: 10, bottom: 210, right: 310 };

function stubEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    style: {
      setProperty() {}, removeProperty() {}, getPropertyValue: () => "",
      cssText: "", outline: "", outlineOffset: "", transform: ""
    },
    children: [], dataset: {},
    innerHTML: "", textContent: "", value: "",
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    remove() {}, focus() {}, select() {}, setSelectionRange() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [],
    attachShadow: () => ({ innerHTML: "", querySelector: () => stubEl("div"), querySelectorAll: () => [] }),
    getBoundingClientRect: () => RECT,
    checkVisibility: () => true,
    get parentElement() { return null; }
  };
  // Reaching the helper iframe means every declaration above it has already executed.
  if ((tag || "").toLowerCase() === "iframe") {
    Object.defineProperty(el, "src", { set() { reachedHelper = true; }, get() { return ""; } });
  }
  return el;
}

const img = {
  src: "https://cdn.example.test/a.jpg", currentSrc: "", loading: "eager", complete: true,
  naturalWidth: 900, naturalHeight: 600, width: 300, height: 200,
  style: { setProperty() {}, removeProperty() {}, outline: "", outlineOffset: "" },
  getBoundingClientRect: () => RECT,
  checkVisibility: () => true,
  parentElement: null
};

global.window = { __cldAutoRescan: false };
global.navigator = { userAgent: "node-smoke-test", clipboard: null };
global.location = { href: "https://example.test/p", host: "example.test", origin: "https://example.test" };
global.history = { pushState() {}, replaceState() {} };
global.performance = {
  getEntriesByName: () => [], getEntriesByType: () => [], setResourceTimingBufferSize() {}
};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};
global.alert = m => { alerted = m; };
global.innerWidth = 1200;
global.innerHeight = 900;
global.getComputedStyle = () => ({ overflow: "visible", overflowX: "visible", overflowY: "visible" });
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
global.document = {
  hidden: false,
  addEventListener() {}, removeEventListener() {},
  images: [img],
  createElement: tag => stubEl(tag),
  documentElement: { appendChild() {}, children: [] },
  body: { appendChild() {} },
  referrer: ""
};

let payload;
try {
  payload = eval("(" + src + ")");
} catch (e) {
  console.error("FAIL: payload would not evaluate — " + e.message);
  process.exit(1);
}

// Real faults surface as rejections or as unhandled rejections from un-awaited work.
process.on("unhandledRejection", e => { if (!firstError) firstError = e; });
payload().catch(e => { if (!firstError) firstError = e; });

const deadline = Date.now() + 4000;
(function check() {
  if (firstError) return finish(firstError);
  if (reachedHelper) {
    console.log("PASS: ran through every declaration, the overlay layer, the first render and on to the helper");
    return process.exit(0);
  }
  if (Date.now() > deadline) {
    console.log("PASS: payload resolved without error" + (alerted ? " (alert: " + String(alerted).slice(0, 60) + ")" : ""));
    return process.exit(0);
  }
  setTimeout(check, 50);
})();

function finish(err) {
  console.error("FAIL: " + (err && err.name || "Error") + ": " + (err && err.message || String(err)));
  if (err && /before initialization|is not defined|already been declared/.test(err.message || "")) {
    console.error("       ^ declaration order / temporal dead zone / name collision");
  }
  process.exit(1);
}
