// popup.js — LoomieCRM (clean & robust)
// Elements
const apiKeyEl = document.getElementById("apiKey");
const toggleKeyBtn = document.getElementById("toggleKey");
const copyKeyBtn = document.getElementById("copyKey");
const saveBtn = document.getElementById("saveBtn");
const testBtn = document.getElementById("testBtn");
const showLogsBtn = document.getElementById("showLogsBtn");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const exportLogsBtn = document.getElementById("exportLogsBtn");
const statusText = document.getElementById("statusText");
const statusBadge = document.getElementById("statusBadge");
const logsArea = document.getElementById("logsArea");
const logsContainer = document.getElementById("logsContainer");
const logsFilter = document.getElementById("logsFilter");
const filterBtns = document.querySelectorAll(".filter-btn");
const themeSelect = document.getElementById("themeSelect");
const scanToggle = document.getElementById("scanToggle");

let currentLogs = [];
let activeFilter = "all";

function injectContentScriptInActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id) {
      setStatus("Nao foi possivel identificar a aba ativa.");
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        files: ["content.js"],
      },
      () => {
        if (chrome.runtime.lastError) {
          setStatus("Esta pagina nao permite execucao da extensao.");
          return;
        }
        setStatus("Extensao ativada nesta aba.");
      }
    );
  });
}

function setBusy(button, busy, labelWhenBusy) {
  if (!button) return;
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent;
  }
  button.disabled = !!busy;
  button.textContent = busy ? labelWhenBusy : button.dataset.originalLabel;
}

// ---------- Helpers ----------
function setStatus(text) {
  statusText.textContent = text;
}

function setBadge(type, text) {
  statusBadge.className = "badge " + (type || "status-unknown");
  statusBadge.textContent = text;
  // pulse animation reflow
  statusBadge.classList.remove("pulse");
  void statusBadge.offsetWidth;
  statusBadge.classList.add("pulse");
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

function saveLog(message, ok = true) {
  try {
    const entry = { message: String(message), timestamp: Date.now(), ok: !!ok };
    chrome.storage.local.get(["loomie_logs"], (data) => {
      const arr = data.loomie_logs || [];
      arr.unshift(entry);
      if (arr.length > 500) arr.length = 500;
      chrome.storage.local.set({ loomie_logs: arr });
    });
  } catch (e) {
    /* ignore */
  }
}

// ---------- Init: load stored api key + theme ----------
injectContentScriptInActiveTab();

chrome.storage.sync.get(
  ["loomie_api_key", "loomie_theme", "loomie_detection_enabled"],
  (data) => {
  if (data.loomie_api_key) apiKeyEl.value = data.loomie_api_key;
  scanToggle.checked = data.loomie_detection_enabled !== false;

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = data.loomie_theme || "auto";
  themeSelect.value = theme;
    if (theme === "auto") applyTheme(systemDark ? "dark" : "light");
    else applyTheme(theme);
  }
);

// ---------- Theme ----------
function applyTheme(mode) {
  document.documentElement.classList.remove("dark", "light");
  if (mode === "dark") document.documentElement.classList.add("dark");
  if (mode === "light") document.documentElement.classList.add("light");
}
themeSelect.addEventListener("change", () => {
  const v = themeSelect.value;
  chrome.storage.sync.set({ loomie_theme: v });
  if (v === "auto") {
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(sys ? "dark" : "light");
  } else applyTheme(v);
});

// ---------- Save API key ----------
saveBtn.addEventListener("click", () => {
  const key = (apiKeyEl.value || "").trim();
  if (!key) return setStatus("Digite uma API Key válida.");
  setBusy(saveBtn, true, "Salvando...");
  chrome.storage.sync.set({ loomie_api_key: key }, () => {
    setBusy(saveBtn, false);
    setStatus("API Key salva");
    saveLog("API Key salva", true);
  });
});

// ---------- Copy / Toggle visible ----------
copyKeyBtn.addEventListener("click", async () => {
  try {
    if (!apiKeyEl.value) return setStatus("Nao ha API Key para copiar.");
    await navigator.clipboard.writeText(apiKeyEl.value || "");
    setStatus("API Key copiada");
  } catch (e) {
    setStatus("Falha ao copiar");
  }
});
toggleKeyBtn.addEventListener("click", () => {
  apiKeyEl.type = apiKeyEl.type === "password" ? "text" : "password";
});

// ---------- Test connection (delegates to background) ----------
testBtn.addEventListener("click", () => {
  setStatus("Testando conexão...");
  setBadge("status-unknown", "Testando...");
  setBusy(testBtn, true, "Testando...");
  chrome.runtime.sendMessage({ action: "testKey" }, (resp) => {
    setBusy(testBtn, false);
    if (chrome.runtime.lastError) {
      setStatus("Erro: " + chrome.runtime.lastError.message);
      setBadge("status-fail", "Erro");
      saveLog(
        "Teste conexão: runtime error: " + chrome.runtime.lastError.message,
        false
      );
      return;
    }
    if (!resp) {
      setStatus("Sem resposta do worker.");
      setBadge("status-fail", "Falha");
      saveLog("Teste conexão: sem resposta", false);
      return;
    }
    if (resp.ok) {
      setStatus("Conexão OK");
      setBadge("status-ok", "Conectado");
      saveLog("Teste conexão: OK", true);
    } else {
      setStatus("Falha: " + (resp.message || "Erro"));
      setBadge("status-fail", "Erro");
      saveLog("Teste conexão: " + (resp.message || "Erro"), false);
    }
  });
});

// ---------- Logs: show / clear / render / filter ----------
showLogsBtn.addEventListener("click", () => {
  chrome.storage.local.get(["loomie_logs"], (data) => {
    currentLogs = data.loomie_logs || [];
    logsArea.hidden = !logsArea.hidden;
    renderLogs();
    if (!currentLogs.length) setStatus("Nenhum log disponível.");
  });
});

clearLogsBtn.addEventListener("click", () => {
  chrome.storage.local.remove("loomie_logs", () => {
    currentLogs = [];
    renderLogs();
    setStatus("Logs limpos");
  });
});

exportLogsBtn.addEventListener("click", () => {
  chrome.storage.local.get(["loomie_logs"], (data) => {
    const logs = data.loomie_logs || [];
    if (!logs.length) return setStatus("Nenhum log para exportar.");

    const payload = {
      exportedAt: new Date().toISOString(),
      total: logs.length,
      logs,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loomie-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Logs exportados com sucesso.");
  });
});

scanToggle.addEventListener("change", () => {
  const enabled = !!scanToggle.checked;
  chrome.storage.sync.set({ loomie_detection_enabled: enabled }, () => {
    setStatus(enabled ? "Deteccao ativada." : "Deteccao pausada.");
    saveLog(enabled ? "Deteccao ativada" : "Deteccao pausada", true);
  });
});

logsFilter.addEventListener("input", () => renderLogs());
filterBtns.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    activeFilter = e.currentTarget.dataset.filter || "all";
    renderLogs();
  });
});

function renderLogs() {
  const term = (logsFilter.value || "").toLowerCase();
  const filtered = currentLogs.filter((l) => {
    if (activeFilter === "ok" && !l.ok) return false;
    if (activeFilter === "fail" && l.ok) return false;
    if (term && !l.message.toLowerCase().includes(term)) return false;
    return true;
  });

  logsContainer.innerHTML = "";
  if (!filtered.length) {
    logsContainer.innerHTML =
      '<div class="logs-empty">Nenhum log encontrado</div>';
    return;
  }

  for (const entry of filtered) {
    const el = document.createElement("div");
    el.className = "log-entry " + (entry.ok ? "log-ok" : "log-fail");
    el.innerHTML = `<div class="msg">${escapeHtml(
      entry.message
    )}</div><time>${new Date(entry.timestamp).toLocaleString()}</time>`;
    logsContainer.appendChild(el);
  }
}

apiKeyEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveBtn.click();
  }
});

document.addEventListener("keydown", (e) => {
  const isCmdOrCtrl = e.metaKey || e.ctrlKey;
  if (isCmdOrCtrl && e.key.toLowerCase() === "enter") {
    e.preventDefault();
    testBtn.click();
  }
});

// ensure initial badge legible
setTimeout(() => setBadge("status-unknown", "Indefinido"), 50);
