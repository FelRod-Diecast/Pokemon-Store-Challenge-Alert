const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const content = fs.readFileSync(path.join(root, "content.js"), "utf8");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("manifest is MV3 and declares only intended retailer host permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, [
    "https://www.target.com/*", "https://target.com/*",
    "https://www.costco.com/*", "https://costco.com/*",
    "https://www.samsclub.com/*", "https://samsclub.com/*"
  ]);
  assert.ok(manifest.permissions.includes("notifications"));
  assert.ok(manifest.permissions.includes("storage"));
});

test("content script recognizes common human-verification indicators", () => {
  for (const term of ["captcha", "recaptcha", "hcaptcha", "unusual traffic", "complete the puzzle", "verify"]) {
    assert.match(content.toLowerCase(), new RegExp(term.toLowerCase()));
  }
  assert.match(content, /CHALLENGE_DETECTED/);
});

test("background creates a desktop notification and focuses the affected tab", () => {
  assert.match(background, /chrome\.notifications\.create/);
  assert.match(background, /chrome\.tabs\.update\(tabId, \{ active: true \}\)/);
  assert.match(background, /CHALLENGE_DETECTED/);
});

test("popup exposes test notification and manual acknowledgement", () => {
  assert.match(popup, /TEST_NOTIFICATION/);
  assert.match(popup, /ACK_CHALLENGE/);
  assert.match(popup, /MARKED RESUMED/);
});

test("interactive popup exposes search, retailer filter, sorting, and clickable status counters", () => {
  const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
  for (const id of ["searchBox", "storeFilter", "sortBy", "showResolved", "clearLog", "countAll", "countAction", "countResolved"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(popup, /data-filter/);
  assert.match(popup, /filteredItems/);
  assert.match(popup, /case "oldest"/);
  assert.match(popup, /case "store"/);
  assert.match(popup, /case "status"/);
  assert.match(popup, /case "title"/);
  assert.match(popup, /async function loadPreferences\(\)/);
  assert.match(popup, /popupShowResolved/);
  assert.match(popup, /function savePreferences\(\)/);
});

test("clear-history action is handled by the background and clears persisted history", () => {
  assert.match(background, /message\?\.type === "CLEAR_LOG"/);
  assert.match(background, /async function clearChallengeLog\(\)/);
  assert.match(background, /chrome\.storage\.local\.set\(\{ challengeLog: \[\], pausedTabs: \[\] \}\)/);
});
