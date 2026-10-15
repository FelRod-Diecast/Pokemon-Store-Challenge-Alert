(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const itemsEl = $("items");
  const searchBox = $("searchBox");
  const storeFilter = $("storeFilter");
  const sortBy = $("sortBy");
  const showResolved = $("showResolved");
  const notice = $("notice");
  let allItems = [];
  let activeFilter = "ALL";
  let noticeTimer;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
  }

  function notify(message) {
    notice.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.textContent = ""; }, 2800);
  }

  async function sendMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      notify("Extension connection failed. Reload the extension and try again.");
      return null;
    }
  }

  async function loadPreferences() {
    const prefs = await chrome.storage.local.get({
      popupFilter: "ALL", popupSearch: "", popupStore: "ALL",
      popupSort: "newest", popupShowResolved: true
    });
    activeFilter = ["ALL", "ACTION NEEDED", "MARKED RESUMED"].includes(prefs.popupFilter) ? prefs.popupFilter : "ALL";
    searchBox.value = String(prefs.popupSearch || "");
    storeFilter.value = ["ALL", "Target", "Costco", "Sam's Club"].includes(prefs.popupStore) ? prefs.popupStore : "ALL";
    sortBy.value = ["newest", "oldest", "store", "status", "title"].includes(prefs.popupSort) ? prefs.popupSort : "newest";
    showResolved.checked = prefs.popupShowResolved !== false;
  }

  function savePreferences() {
    return chrome.storage.local.set({
      popupFilter: activeFilter, popupSearch: searchBox.value,
      popupStore: storeFilter.value, popupSort: sortBy.value,
      popupShowResolved: showResolved.checked
    }).catch(() => {});
  }

  function renderCounts() {
    $("countAll").textContent = allItems.length;
    $("countAction").textContent = allItems.filter((item) => item.status !== "MARKED RESUMED").length;
    $("countResolved").textContent = allItems.filter((item) => item.status === "MARKED RESUMED").length;
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter));
    });
  }

  function filteredItems() {
    const query = searchBox.value.trim().toLocaleLowerCase();
    let result = allItems.filter((item) => {
      const status = item.status || "ACTION NEEDED";
      if (activeFilter !== "ALL" && status !== activeFilter) return false;
      if (!showResolved.checked && status === "MARKED RESUMED") return false;
      if (storeFilter.value !== "ALL" && item.store !== storeFilter.value) return false;
      const searchable = [item.store, item.title, item.url, status].join(" ").toLocaleLowerCase();
      return !query || searchable.includes(query);
    });

    result.sort((a, b) => {
      const aTime = Number(new Date(a.detectedAt)) || 0;
      const bTime = Number(new Date(b.detectedAt)) || 0;
      switch (sortBy.value) {
        case "oldest": return aTime - bTime;
        case "store": return String(a.store || "").localeCompare(String(b.store || ""));
        case "status": return String(a.status || "").localeCompare(String(b.status || "")) || bTime - aTime;
        case "title": return String(a.title || "").localeCompare(String(b.title || ""));
        default: return bTime - aTime;
      }
    });
    return result;
  }

  function render() {
    renderCounts();
    const items = filteredItems();
    $("resultCount").textContent = `${items.length} of ${allItems.length} events`;
    $("resultsTitle").textContent = activeFilter === "ALL" ? "Challenge history" : activeFilter === "ACTION NEEDED" ? "Needs attention" : "Marked handled";

    if (!items.length) {
      itemsEl.innerHTML = '<div class="empty">No events match these filters. Try another search or retailer.</div>';
      return;
    }

    itemsEl.innerHTML = items.map((item) => {
      const resolved = item.status === "MARKED RESUMED";
      const tabId = Number(item.tabId);
      return `<article class="entry">
        <div class="entry-top">
          <strong>${escapeHtml(item.store || "Retailer")}</strong>
          <span class="pill ${resolved ? "resolved" : ""}">${resolved ? "MARKED HANDLED" : "ACTION NEEDED"}</span>
        </div>
        <div class="entry-title">${escapeHtml(item.title || "Verification required")}</div>
        <div class="entry-meta">${escapeHtml(formatTime(item.detectedAt))}</div>
        ${item.url ? `<div class="entry-meta">${escapeHtml(item.url)}</div>` : ""}
        <div class="entry-actions">
          <a href="#" data-open-tab="${Number.isInteger(tabId) ? tabId : ""}">Open retailer tab</a>
          ${resolved ? "" : `<a href="#" data-ack-tab="${Number.isInteger(tabId) ? tabId : ""}">I handled it</a>`}
        </div>
      </article>`;
    }).join("");

    itemsEl.querySelectorAll("[data-open-tab]").forEach((link) => link.addEventListener("click", async (event) => {
      event.preventDefault();
      const tabId = Number(link.dataset.openTab);
      if (!Number.isInteger(tabId)) return notify("This event has no valid browser tab.");
      try {
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      } catch {
        notify("That retailer tab is no longer open.");
      }
    }));

    itemsEl.querySelectorAll("[data-ack-tab]").forEach((link) => link.addEventListener("click", async (event) => {
      event.preventDefault();
      const tabId = Number(link.dataset.ackTab);
      const response = await sendMessage({ type: "ACK_CHALLENGE", tabId });
      if (response?.ok) {
        await loadStatus();
        notify("Event marked handled.");
      } else {
        notify("Could not update this event.");
      }
    }));
  }

  async function loadStatus() {
    const response = await sendMessage({ type: "GET_STATUS" });
    if (!response) return;
    allItems = Array.isArray(response.challengeLog) ? response.challengeLog : [];
    $("monitorTitle").textContent = "Challenge monitoring";
    $("monitorDetail").textContent = "Watching supported retailer pages in open tabs.";
    $("monitorBadge").textContent = "READY";
    render();
  }

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      render();
      savePreferences();
    });
  });
  searchBox.addEventListener("input", () => { render(); savePreferences(); });
  [storeFilter, sortBy, showResolved].forEach((control) => {
    control.addEventListener("change", () => { render(); savePreferences(); });
  });
  $("refresh").addEventListener("click", loadStatus);
  $("test").addEventListener("click", async () => {
    const response = await sendMessage({ type: "TEST_NOTIFICATION" });
    if (response?.ok) notify("Test notification sent.");
    else notify("Test notification could not be sent. Check browser notification permissions.");
  });
  $("clearLog").addEventListener("click", async () => {
    if (!allItems.length) return notify("Challenge history is already empty.");
    if (!confirm("Clear all saved challenge history? This cannot be undone.")) return;
    const response = await sendMessage({ type: "CLEAR_LOG" });
    if (response?.ok) {
      await loadStatus();
      notify("Challenge history cleared.");
    } else {
      notify("Could not clear challenge history.");
    }
  });

  loadPreferences().then(loadStatus).catch(loadStatus);
})();