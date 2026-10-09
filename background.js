const activeChallenges = new Map();

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
  if (message?.type === "ACK_CHALLENGE") {
    acknowledgeChallenge(message.tabId).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TEST_NOTIFICATION") {
    chrome.notifications.create("challenge-test", {
      type: "basic",
      iconUrl: "icon.svg",
      title: "Challenge Alert test",
      message: "Desktop notifications are working. This is only a test.",
      priority: 2
    }).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

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

  await chrome.notifications.create("challenge-" + tabId, {
    type: "basic",
    iconUrl: "icon.svg",
    title: "Verification needed — " + item.store,
    message: "Open the retailer tab and complete the check yourself. Click this alert to switch to it.",
    contextMessage: item.title.slice(0, 120),
    priority: 2,
    requireInteraction: true
  });
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