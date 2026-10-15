const activeChallenges = new Map();
let iconDataUrlPromise;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CHALLENGE_DETECTED") {
    handleChallenge(message, sender).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "GET_STATUS") {
    chrome.storage.local.get({ challengeLog: [], pausedTabs: [] }).then((data) => {
      sendResponse({
        challengeLog: data.challengeLog,
        pausedTabs: data.pausedTabs,
        monitoring: true
      });
    }).catch(() => sendResponse({ challengeLog: [], pausedTabs: [], monitoring: true }));
    return true;
  }
  if (message?.type === "CLEAR_LOG") {
    clearChallengeLog().then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "ACK_CHALLENGE") {
    acknowledgeChallenge(message.tabId).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TEST_NOTIFICATION") {
    showNotification("challenge-test", {
      title: "Challenge Alert test",
      message: "Desktop notifications are working. This is only a test."
    }).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function getIconDataUrl() {
  if (!iconDataUrlPromise) {
    iconDataUrlPromise = (async () => {
      const canvas = new OffscreenCanvas(128, 128);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#174ea6";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(64, 64, 39, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(23, 59, 82, 10);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(64, 64, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(64, 64, 14, 0, Math.PI * 2);
      ctx.stroke();
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return "data:image/png;base64," + btoa(binary);
    })();
  }
  return iconDataUrlPromise;
}

async function showNotification(id, details) {
  const iconUrl = await getIconDataUrl();
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl,
    title: details.title,
    message: details.message,
    contextMessage: details.contextMessage || "",
    priority: 2,
    requireInteraction: true
  });
}

async function handleChallenge(message, sender) {
  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") return;

  const existing = activeChallenges.get(tabId);
  if (existing && Date.now() - existing < 120000) return;
  activeChallenges.set(tabId, Date.now());

  const data = await chrome.storage.local.get({ challengeLog: [], pausedTabs: [] });
  const item = {
    store: message.store || "Retailer",
    title: message.title || "Verification required",
    url: message.url || sender.tab?.url || "",
    tabId,
    detectedAt: message.detectedAt || Date.now(),
    status: "ACTION NEEDED"
  };
  const log = [item, ...data.challengeLog.filter((entry) => entry.tabId !== tabId)].slice(0, 20);
  const paused = [tabId, ...data.pausedTabs.filter((id) => id !== tabId)];
  await chrome.storage.local.set({ challengeLog: log, pausedTabs: paused });

  await showNotification("challenge-" + tabId, {
    title: "Verification needed — " + item.store,
    message: "Open the retailer tab and complete the check yourself. Click this alert to switch to it.",
    contextMessage: item.title.slice(0, 120)
  });
}

async function clearChallengeLog() {
  const data = await chrome.storage.local.get({ challengeLog: [], pausedTabs: [] });
  for (const entry of data.challengeLog) activeChallenges.delete(entry.tabId);
  await chrome.storage.local.set({ challengeLog: [], pausedTabs: [] });
}

async function acknowledgeChallenge(tabId) {
  const data = await chrome.storage.local.get({ challengeLog: [], pausedTabs: [] });
  const log = data.challengeLog.map((entry) =>
    entry.tabId === tabId ? { ...entry, status: "MARKED RESUMED" } : entry
  );
  await chrome.storage.local.set({
    challengeLog: log,
    pausedTabs: data.pausedTabs.filter((id) => id !== tabId)
  });
  activeChallenges.delete(tabId);
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === "challenge-test") {
    await chrome.notifications.clear(notificationId);
    return;
  }
  const tabId = Number(notificationId.replace("challenge-", ""));
  if (!Number.isInteger(tabId)) return;
  try {
    await chrome.tabs.update(tabId, { active: true });
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // The tab may have been closed; the popup log remains available.
  }
  await chrome.notifications.clear(notificationId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  activeChallenges.delete(tabId);
  const data = await chrome.storage.local.get({ challengeLog: [], pausedTabs: [] });
  await chrome.storage.local.set({
    challengeLog: data.challengeLog.filter((entry) => entry.tabId !== tabId),
    pausedTabs: data.pausedTabs.filter((id) => id !== tabId)
  });
});