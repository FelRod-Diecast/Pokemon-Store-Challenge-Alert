const itemsEl = document.getElementById("items");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatTime(value) {
  try { return new Date(value).toLocaleString(); }
  catch { return "Unknown time"; }
}

async function loadStatus() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  const items = response?.challengeLog || [];
  if (!items.length) {
    itemsEl.className = "empty";
    itemsEl.textContent = "No challenges detected yet. Keep a supported retailer tab open.";
    return;
  }
  itemsEl.className = "";
  itemsEl.innerHTML = items.map((item) => `
    <div class="entry">
      <strong>${escapeHtml(item.store)} — ${escapeHtml(item.status)}</strong>
      <div>${escapeHtml(item.title)}</div>
      <small>${escapeHtml(formatTime(item.detectedAt))}</small><br>
      <a href="#" data-open="${escapeHtml(item.tabId)}">Open retailer tab</a>
      ${item.status !== "MARKED RESUMED" ? ` · <a href="#" data-ack="${escapeHtml(item.tabId)}">I handled it</a>` : ""}
    </div>
  `).join("");

  itemsEl.querySelectorAll("[data-open]").forEach((link) => link.addEventListener("click", async (event) => {
    event.preventDefault();
    const tabId = Number(link.dataset.open);
    try {
      await chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    } catch { }
  }));
  itemsEl.querySelectorAll("[data-ack]").forEach((link) => link.addEventListener("click", async (event) => {
    event.preventDefault();
    await chrome.runtime.sendMessage({ type: "ACK_CHALLENGE", tabId: Number(link.dataset.ack) });
    await loadStatus();
  }));
}

document.getElementById("refresh").addEventListener("click", loadStatus);
document.getElementById("test").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "TEST_NOTIFICATION" });
});
loadStatus();