console.log("LoomieCRM service worker iniciado");

// ====================================================================
// FUNÇÕES AUXILIARES
// ====================================================================

function addLog(msg) {
  console.log("[LoomieCRM]", msg);
}

function detectType(value) {
  const emailRe = /@/;
  return emailRe.test(value) ? "email" : "phone";
}

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  return await Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao chamar API")), timeout)
    ),
  ]);
}

// ====================================================================
// LISTENER PRINCIPAL
// ====================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ================================================================
  // 1 — ENVIAR DADO PARA A API (action: sendData)
  // ================================================================
  if (msg.action === "sendData") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      const key = data.loomie_api_key;
      const payload = msg.payload;

      if (!key) {
        addLog("API key não configurada");
        return sendResponse({ ok: false, message: "API key não configurada" });
      }

      addLog("Enviando payload api js: " + JSON.stringify(payload));

      try {
        const res = await fetchWithTimeout(
          "https://backend.loomiecrm.com/contatos/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + key,
            },
            body: JSON.stringify(payload),
          },
          12000
        );

        // --- ERRO 401 (chave inválida)
        if (res.status === 401) {
          addLog("Falha 401 — API key inválida");
          return sendResponse({ ok: false, message: "401 Unauthorized" });
        }

        // --- OUTROS ERROS HTTP
        if (!res.ok) {
          const txt = await res.text();
          addLog(`Falha HTTP ${res.status} — ${txt}`);
          return sendResponse({
            ok: false,
            message: `HTTP ${res.status}`,
          });
        }

        // --- SUCESSO
        const j = await res.json().catch(() => null);
        addLog("Enviado com sucesso: " + (j ? JSON.stringify(j) : "sem corpo"));

        return sendResponse({ ok: true, message: "Enviado" });
      } catch (err) {
        addLog("Erro de rede: " + err.message);
        return sendResponse({ ok: false, message: err.message });
      }
    });

    return true; // mantém sendResponse async
  }

  // ================================================================
  // 2 — TESTAR API KEY (action: testKey)
  // ================================================================
  if (msg.action === "testKey") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      const key = data.loomie_api_key;

      if (!key) {
        return sendResponse({ ok: false, message: "API key não configurada" });
      }

      try {
        const res = await fetchWithTimeout(
          "https://backend.loomiecrm.com/ping/",
          {
            method: "GET",
            headers: { Authorization: "Bearer " + key },
          },
          8000
        );

        if (res.status === 401) {
          addLog("Teste chave: 401");
          return sendResponse({ ok: false, message: "401 Unauthorized" });
        }

        if (!res.ok) {
          addLog("Teste chave: HTTP " + res.status);
          return sendResponse({ ok: false, message: "HTTP " + res.status });
        }

        addLog("Teste chave: OK");
        return sendResponse({ ok: true, message: "OK" });
      } catch (err) {
        addLog("Teste chave erro de rede: " + err.message);
        return sendResponse({ ok: false, message: err.message });
      }
    });

    return true;
  }
});
