console.log("[SW] LoomieCRM service worker iniciado");

// ====================================================================
// FUNÇÕES AUXILIARES
// ====================================================================

function addLog(msg) {
  console.log("[LoomieCRM API.JS]", msg);
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
  console.log("[SW] Mensagem recebida:", msg);
  // ================================================================
  // 1 — ENVIAR DADO PARA A API (action: sendData)
  // ================================================================
  if (msg.action === "sendData") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      console.log("API Key:", data.loomie_api_key);
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
          console.log("RES ", res);
          const txt = await res.text();
          addLog(`Falha HTTP ${res.status} — ${txt}`);
          return sendResponse({
            ok: false,
            message: `HTTP ${res.status}`,
          });
        }

        // --- SUCESSO
        console.log("RES ", res);

        const j = await res.json().catch(() => null);
        addLog("Enviado com sucesso: " + (j ? JSON.stringify(j) : "sem corpo"));

        return sendResponse({ ok: true, message: "Enviado", id: j?.id || null });
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

  // ================================================================
  // 3 — BUSCAR PIPELINES (action: getPipelines)
  // ================================================================
  if (msg.action === "getPipelines") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      console.log("[DEBUG] getPipelines - API Key:", data.loomie_api_key);

      const key = data.loomie_api_key;
      if (!key) {
        console.warn("[DEBUG] getPipelines - API key não configurada");
        return sendResponse([]);
      }

      try {
        const res = await fetchWithTimeout(
          "https://backend.loomiecrm.com/kanbans/",
          {
            method: "GET",
            headers: { Authorization: "Bearer " + key },
          }
        );

        console.log("[DEBUG] getPipelines - Status fetch:", res.status);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(
            `[DEBUG] getPipelines - Falha HTTP ${res.status}:`,
            text
          );
          return sendResponse([]);
        }

        let pipelines = await res.json().catch((err) => {
          console.error("[DEBUG] getPipelines - Erro ao parsear JSON:", err);
          return null;
        });

        console.log(
          "[DEBUG] getPipelines - JSON retornado:",
          pipelines.results
        );

        if (!Array.isArray(pipelines.results)) {
          console.warn(
            "[DEBUG] getPipelines - JSON não é array, retornando vazio"
          );
          pipelines = [];
        }

        sendResponse(pipelines.results);
      } catch (err) {
        console.error("[DEBUG] getPipelines - Erro de rede:", err);
        sendResponse([]);
      }
    });

    return true; // mantém sendResponse async
  }

  // ================================================================
  // 4 — BUSCAR ESTÁGIOS DE PIPELINE (action: getStages)
  // ================================================================
  if (msg.action === "getStages") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      console.log("[DEBUG] getStages - API Key:", data.loomie_api_key);

      const key = data.loomie_api_key;
      if (!key) {
        console.warn("[DEBUG] getStages - API key não configurada");
        return sendResponse([]);
      }

      if (!msg.pipelineId) {
        console.warn("[DEBUG] getStages - pipelineId não informado");
        return sendResponse([]);
      }

      try {
        const res = await fetchWithTimeout(
          `https://backend.loomiecrm.com/estagios/${msg.pipelineId}`,
          {
            method: "GET",
            headers: { Authorization: "Bearer " + key },
          }
        );

        console.log("[DEBUG] getStages - Status fetch:", res.status);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`[DEBUG] getStages - Falha HTTP ${res.status}:`, text);
          return sendResponse([]);
        }

        let stages = await res.json().catch((err) => {
          console.error("[DEBUG] getStages - Erro ao parsear JSON:", err);
          return null;
        });

        console.log("[DEBUG] getStages - JSON retornado:", stages.results);

        if (!Array.isArray(stages.results)) {
          console.warn(
            "[DEBUG] getStages - JSON não é array, retornando vazio"
          );
          stages = [];
        }

        sendResponse(stages.results);
      } catch (err) {
        console.error("[DEBUG] getStages - Erro de rede:", err);
        sendResponse([]);
      }
    });

    return true; // mantém sendResponse async
  }

  // ================================================================
  // 5 — ADICIONAR AO PIPELINE (action: assignPipeline)
  // ================================================================
  if (msg.action === "assignPipeline") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      const key = data.loomie_api_key;
      const { contactId, pipelineId, stageId } = msg;

      if (!key || !contactId || !pipelineId || !stageId) {
        console.warn("[DEBUG] assignPipeline - dados insuficientes");
        return sendResponse({ ok: false });
      }

      try {
        const res = await fetchWithTimeout(
          `https://backend.loomiecrm.com/kanbans/${pipelineId}/add_contact/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + key,
            },
            body: JSON.stringify({ contactId, stageId }),
          }
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.error(
            `[DEBUG] assignPipeline - falha HTTP ${res.status}:`,
            txt
          );
          return sendResponse({ ok: false, status: res.status, text: txt });
        }

        const j = await res.json().catch(() => null);
        console.log("[DEBUG] assignPipeline - sucesso:", j);
        return sendResponse({ ok: true, data: j });
      } catch (err) {
        console.error("[DEBUG] assignPipeline - erro de rede:", err);
        return sendResponse({ ok: false, error: err.message });
      }
    });

    return true; // mantém sendResponse async
  }

  // ================================================================
  // 6 — CRIAR NEGÓCIO (action: createDeal)
  // ================================================================
  if (msg.action === "createDeal") {
    chrome.storage.sync.get(["loomie_api_key"], async (data) => {
      const key = data.loomie_api_key;
      const { pipelineId, stageId, contactId, titulo, valor } = msg.payload;

      if (!key || !pipelineId || !stageId || !contactId || !titulo) {
        addLog("[DEBUG] createDeal - dados insuficientes");
        return sendResponse({ ok: false, message: "Dados insuficientes" });
      }

      addLog(
        `[DEBUG] createDeal - Criando negócio: pipelineId=${pipelineId}, stageId=${stageId}, contactId=${contactId}, titulo=${titulo}, valor=${valor}`
      );

      try {
        const res = await fetchWithTimeout(
          "https://backend.loomiecrm.com/negocios/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + key,
            },
            body: JSON.stringify({
              estagio_id: stageId,
              contato_id: contactId,
              titulo,
              valor,
            }),
          }
        );

        if (res.status === 401) {
          addLog("createDeal - 401 Unauthorized");
          return sendResponse({ ok: false, message: "401 Unauthorized" });
        }

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          addLog(`[DEBUG] createDeal - Falha HTTP ${res.status}: ${txt}`);
          return sendResponse({
            ok: false,
            message: `HTTP ${res.status}: ${txt}`,
          });
        }

        const j = await res.json().catch(() => null);
        addLog(
          "[DEBUG] createDeal - Sucesso: " +
            (j ? JSON.stringify(j) : "sem corpo")
        );
        return sendResponse({ ok: true, data: j });
      } catch (err) {
        addLog("[DEBUG] createDeal - Erro de rede: " + err.message);
        return sendResponse({ ok: false, message: err.message });
      }
    });

    return true; // mantém sendResponse async
  }
});
