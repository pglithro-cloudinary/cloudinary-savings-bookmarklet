#!/usr/bin/env node
// Catches the class of bug that syntax checking can't: temporal-dead-zone errors and
// declaration-order faults in the bookmarklet payload, which only surface at runtime.
//
//   node smoke-test.js
//
// Extracts the payload from index.html exactly as the install page does, runs it against a
// minimal DOM stub, and asserts it gets through every declaration to real work.

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

const REACHED = "__REACHED_DOM__";
let alerted = null;

const stubEl = () => ({
  style: { setProperty() {}, removeProperty() {}, cssText: "" },
  setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {},
  attachShadow: () => ({ innerHTML: "", querySelector: () => null, querySelectorAll: () => [] }),
  querySelector: () => null, querySelectorAll: () => [],
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 })
});

global.window = { __cldAutoRescan: false };
global.navigator = { userAgent: "node-smoke-test" };
global.location = { href: "https://example.test/page", host: "example.test", origin: "https://example.test" };
global.history = { pushState() {}, replaceState() {} };
global.performance = { getEntriesByName: () => [], getEntriesByType: () => [] };
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.setInterval = () => 0;
global.alert = m => { alerted = m; };
global.requestAnimationFrame = () => 0;
global.innerHeight = 800;
global.document = {
  addEventListener() {}, removeEventListener() {},
  images: [{ src: "https://cdn.example.test/a.jpg", currentSrc: "", naturalWidth: 900, naturalHeight: 600,
             width: 300, height: 200, style: {}, getBoundingClientRect: () => ({ width: 300, height: 200 }) }],
  createElement() { throw new Error(REACHED); },
  documentElement: { appendChild() {}, children: [] },
  body: { appendChild() {} }
};

let payload;
try {
  payload = eval("(" + src + ")");
} catch (e) {
  console.error("FAIL: payload would not evaluate — " + e.message);
  process.exit(1);
}

payload()
  .then(() => finish(null))
  .catch(finish);

function finish(err) {
  if (err && err.message === REACHED) {
    console.log("PASS: payload ran through every declaration to its first DOM call");
    process.exit(0);
  }
  if (!err && alerted) {
    console.log("PASS: payload ran to completion (alert: " + String(alerted).slice(0, 60) + ")");
    process.exit(0);
  }
  if (err) {
    console.error("FAIL: " + err.name + ": " + err.message);
    if (/before initialization|is not defined/.test(err.message)) {
      console.error("       ^ declaration order / temporal dead zone");
    }
    process.exit(1);
  }
  console.log("PASS: payload resolved without error");
}
