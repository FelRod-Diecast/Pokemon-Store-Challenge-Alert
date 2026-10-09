(() => {
  "use strict";

  const CHECK_INTERVAL_MS = 4000;
  const MIN_ALERT_GAP_MS = 45000;
  const challengePatterns = [
    /verify (that )?you are human/i,
    /verify you('re| are) not a robot/i,
    /confirm you are not a robot/i,
    /prove you are human/i,
    /human verification/i,
    /security verification/i,
    /complete the security check/i,
    /complete the puzzle/i,
    /solve the puzzle/i,
    /unusual traffic/i,
    /checking your browser/i,
    /are you a robot/i,
    /captcha/i,
    /recaptcha/i,
    /hcaptcha/i,
    /px-captcha/i,
    /press and hold to confirm/i
  ];

  let lastAlertAt = 0;
  let lastChallengeState = false;
  let scheduled = false;

  function pageText() {
    const body = document.body;
    if (!body) return "";
    return (body.innerText || body.textContent || "").slice(0, 180000);
  }

  function challengeFound() {
    const text = pageText();
    if (!text) return false;

    const widget = document.querySelector(
      'iframe[src*="captcha" i], iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], ' +
      '[id*="captcha" i], [class*="captcha" i], [data-testid*="captcha" i]'
    );
    const visibleWidget = Boolean(widget && widget.getClientRects().length > 0);
    const matchingText = challengePatterns.some((pattern) => pattern.test(text));
    if (!matchingText) return false;

    const compactText = text.toLowerCase();
    const explicitPrompt = [
      "verify you are human", "verify that you are human",
      "verify you're not a robot", "verify you are not a robot",
      "complete the security check", "complete the puzzle",
      "checking your browser", "unusual traffic", "press and hold to confirm",
      "prove you are human", "confirm you are not a robot"
    ].some((phrase) => compactText.includes(phrase));

    // A generic mention of CAPTCHA in legal/help text is not enough by itself.
    const challengeContext = /captcha|recaptcha|hcaptcha|verify|robot|human|security check|puzzle|unusual traffic/i.test(text);
    return explicitPrompt || (visibleWidget && challengeContext);
  }

  function check() {
    scheduled = false;
    const found = challengeFound();
    if (found && (!lastChallengeState || Date.now() - lastAlertAt > MIN_ALERT_GAP_MS)) {
      lastAlertAt = Date.now();
      chrome.runtime.sendMessage({
        type: "CHALLENGE_DETECTED",
        title: document.title || "Retailer verification",
        url: location.href,
        store: storeName(location.hostname),
        detectedAt: Date.now()
      }).catch(() => {});
    }
    lastChallengeState = found;
  }

  function storeName(host) {
    if (host.includes("target.com")) return "Target";
    if (host.includes("costco.com")) return "Costco";
    if (host.includes("samsclub.com")) return "Sam's Club";
    return host;
  }

  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(check, 350);
  }

  const observer = new MutationObserver(scheduleCheck);
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true
    });
  }
  setInterval(check, CHECK_INTERVAL_MS);
  scheduleCheck();
})();