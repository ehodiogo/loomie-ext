// ====================================================================
// REGEXs
// ====================================================================
if (window.__loomieContentScriptLoaded) {
  console.log("[LoomieCRM CONTENT.JS] ja injetado nesta aba");
} else {
  window.__loomieContentScriptLoaded = true;

const emailRegex =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})*/;
const phoneRegex =
  /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/;
const MIN_PHONE_DIGITS = 10;

// ====================================================================
// UTILITÁRIAS
// ====================================================================
function addLog(msg, ok = true) {
  try {
    const entry = { message: String(msg), timestamp: Date.now(), ok: !!ok };
    chrome.storage.local.get(["loomie_logs"], (data) => {
      const arr = data.loomie_logs || [];
      arr.unshift(entry);
      if (arr.length > 300) arr.length = 300;
      chrome.storage.local.set({ loomie_logs: arr });
    });
  } catch (e) {}
  console.log("[LoomieCRM CONTENT.JS]", msg);
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

function detectType(value) {
  if (emailRegex.test(value)) return "email";
  return "phone";
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function isLikelyPhone(value) {
  const digits = normalizePhone(value);
  return digits.length >= MIN_PHONE_DIGITS;
}

// ====================================================================
// MARCADOR LOGO
// ====================================================================
function createLogoMarker(value) {
  const span = document.createElement("span");
  span.className = "loomie-marker";
  span.dataset.loomieValue = value;
  span.title = "Enviar para LoomieCRM";
  span.style.display = "inline-flex";
  span.style.alignItems = "center";
  span.style.gap = "6px";
  span.style.padding = "2px 6px";
  span.style.borderRadius = "6px";
  span.style.background = "rgba(13,110,253,0.06)";
  span.style.maxWidth = "100%";
  span.style.overflow = "hidden";
  span.style.textOverflow = "ellipsis";

  const txt = document.createTextNode(value);
  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("assets/logo-loomie.png");
  img.alt = "Loomie";
  img.style.width = "16px";
  img.style.height = "16px";
  img.style.cursor = "pointer";
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    openConfirmModal(value);
  });

  span.appendChild(txt);
  span.appendChild(img);
  return span;
}

// ====================================================================
// MODAL PRINCIPAL — CADASTRAR CONTATO
// ====================================================================
function openConfirmModal(value) {
  if (document.querySelector(".loomie-modal-root")) return;

  const modal = document.createElement("div");
  modal.className = "loomie-modal-root";

  const type = detectType(value);
  const emailVal = type === "email" ? value : "";
  const phoneVal = type === "phone" ? value : "";

  modal.innerHTML = `
  <div class="loomie-modal">
    <div class="loomie-modal-card">
      <div class="loomie-modal-header">
        <img src="${chrome.runtime.getURL(
          "assets/logo-loomie.png"
        )}" class="loomie-logo">
        <h3 class="loomie-title">LoomieCRM</h3>
      </div>

      <div class="loomie-inputs">
        <label>Nome: <input type="text" id="loomie-name" placeholder="Nome"></label>
        <label>Email: <input type="email" id="loomie-email" placeholder="Email" value="${escapeHtml(
          emailVal
        )}"></label>
        <label>Telefone: <input type="tel" id="loomie-phone" placeholder="Telefone" value="${escapeHtml(
          phoneVal
        )}"></label>

        <label class="loomie-check">
          <input type="checkbox" id="loomie-create-deal-toggle">
          Criar negocio agora neste contato
        </label>

        <div id="loomie-deal-fields" style="display:none;">
          <label>Pipeline:
            <select id="loomie-pipeline" class="loomie-select">
              <option value="">Selecione...</option>
            </select>
          </label>

          <label>Estagio:
            <select id="loomie-stage" class="loomie-select">
              <option value="">Selecione um pipeline</option>
            </select>
          </label>

          <label>Titulo do Negocio:
            <input type="text" id="deal-title" placeholder="Ex: Proposta inicial">
          </label>

          <label>Valor do Negocio:
            <input type="number" id="deal-value" placeholder="1000">
          </label>
        </div>
      </div>

      <div class="loomie-buttons">
        <button id="loomie-send" class="loomie-btn-primary">Enviar</button>
        <button id="loomie-cancel" class="loomie-btn-secondary">Cancelar</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(modal);

  const createDealToggle = modal.querySelector("#loomie-create-deal-toggle");
  const dealFields = modal.querySelector("#loomie-deal-fields");
  const pipelineSelect = modal.querySelector("#loomie-pipeline");
  const stageSelect = modal.querySelector("#loomie-stage");
  const dealTitleInput = modal.querySelector("#deal-title");
  const dealValueInput = modal.querySelector("#deal-value");
  let pipelinesLoaded = false;

  function loadPipelines() {
    if (pipelinesLoaded) return;
    pipelinesLoaded = true;

    pipelineSelect.innerHTML = `<option value="">Carregando...</option>`;

    chrome.runtime.sendMessage({ action: "getPipelines" }, (pipelines) => {
      pipelineSelect.innerHTML = `<option value="">Selecione...</option>`;
      (pipelines || []).forEach((p) => {
        pipelineSelect.innerHTML += `<option value="${p.id}">${p.nome}</option>`;
      });
    });
  }

  createDealToggle?.addEventListener("change", () => {
    const enabled = !!createDealToggle.checked;
    dealFields.style.display = enabled ? "block" : "none";
    if (enabled) loadPipelines();
  });

  pipelineSelect?.addEventListener("change", () => {
    const pid = pipelineSelect.value;
    if (!pid) {
      stageSelect.innerHTML = `<option value="">Selecione um pipeline</option>`;
      return;
    }

    stageSelect.innerHTML = `<option value="">Carregando...</option>`;

    chrome.runtime.sendMessage(
      { action: "getStages", pipelineId: pid },
      (stages) => {
        stageSelect.innerHTML = `<option value="">Selecione...</option>`;
        (stages || []).forEach((s) => {
          stageSelect.innerHTML += `<option value="${s.id}">${s.nome}</option>`;
        });
      }
    );
  });

  const onEscape = (ev) => {
    if (ev.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", onEscape);
    }
  };
  document.addEventListener("keydown", onEscape);

  const overlay = modal.querySelector(".loomie-modal");
  overlay?.addEventListener("click", (ev) => {
    if (ev.target === overlay) {
      modal.remove();
      document.removeEventListener("keydown", onEscape);
    }
  });

  modal.querySelector("#loomie-cancel").onclick = () => {
    modal.remove();
    document.removeEventListener("keydown", onEscape);
  };

  modal.querySelector("#loomie-send").onclick = () => {
    const sendBtn = modal.querySelector("#loomie-send");
    const name = modal.querySelector("#loomie-name").value.trim();
    const email = modal.querySelector("#loomie-email").value.trim();
    const phone = modal.querySelector("#loomie-phone").value.trim();
    const shouldCreateDeal = !!createDealToggle?.checked;
    const pipelineId = pipelineSelect?.value || "";
    const stageId = stageSelect?.value || "";
    const dealTitle = dealTitleInput?.value?.trim() || "";
    const dealValue = parseFloat(dealValueInput?.value || 0);

    if (!name && !email && !phone) {
      return addLog("Preencha ao menos um campo antes de enviar", false);
    }
    if (email && !emailRegex.test(email)) {
      return addLog("Email invalido", false);
    }
    if (phone && !isLikelyPhone(phone)) {
      return addLog("Telefone invalido", false);
    }
    if (shouldCreateDeal && !pipelineId) {
      return addLog("Selecione um pipeline para criar o negocio", false);
    }
    if (shouldCreateDeal && !stageId) {
      return addLog("Selecione um estagio para criar o negocio", false);
    }
    if (shouldCreateDeal && !dealTitle) {
      return addLog("Informe o titulo do negocio", false);
    }

    const payload = { nome: name, email, telefone: phone };
    sendBtn.disabled = true;
    sendBtn.textContent = "Enviando...";

    chrome.runtime.sendMessage({ action: "sendData", payload }, (response) => {
      if (response?.ok && shouldCreateDeal && response?.id) {
        const dealPayload = {
          pipelineId,
          stageId,
          contactId: response.id,
          titulo: dealTitle,
          valor: Number.isFinite(dealValue) ? dealValue : 0,
        };

        chrome.runtime.sendMessage(
          { action: "createDeal", payload: dealPayload },
          (resDeal) => {
            if (resDeal?.ok) {
              modal.querySelector(".loomie-modal-card").innerHTML =
                "<h3>Contato e negocio criados ✔️</h3>";
            } else {
              modal.querySelector(
                ".loomie-modal-card"
              ).innerHTML = `<h3>Contato criado, mas falhou ao criar negocio ❌</h3><p>${
                resDeal?.message || ""
              }</p>`;
              addLog(
                "Contato criado, mas falha ao criar negocio: " +
                  (resDeal?.message || "erro desconhecido"),
                false
              );
            }

            setTimeout(() => {
              modal.remove();
              document.removeEventListener("keydown", onEscape);
            }, 1200);
          }
        );
      } else if (response?.ok) {
        modal.querySelector(".loomie-modal-card").innerHTML =
          "<h3>Enviado ✔️</h3>";
        setTimeout(() => {
          modal.remove();
          document.removeEventListener("keydown", onEscape);
        }, 800);
        addLog("Enviado para CRM: " + JSON.stringify(payload), true);
        addLog("Resposta: " + JSON.stringify(response), true);
        addLog("Contato criado com ID: " + response?.id, true);
      } else {
        modal.querySelector(
          ".loomie-modal-card"
        ).innerHTML = `<h3>Falha ao enviar ❌</h3><p>${
          response?.message || "Erro desconhecido"
        }</p>`;
        addLog("Falha ao enviar para CRM: " + JSON.stringify(response), false);
      }
    });
  };
}

// ====================================================================
// MODAL “DESEJA ADICIONAR AO PIPELINE?”
// ====================================================================
function openAskPipelineModal(id) {
  const modal = document.createElement("div");
  modal.className = "loomie-modal-root";

  modal.innerHTML = `
  <div class="loomie-modal">
    <div class="loomie-modal-card">
      <h3>Adicionar ao Pipeline?</h3>
      <p>Deseja colocar este contato em um pipeline agora?</p>

      <div class="loomie-buttons">
        <button id="pipeline-yes" class="loomie-btn-primary">Sim</button>
        <button id="pipeline-no" class="loomie-btn-secondary">Agora não</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(modal);

  modal.querySelector("#pipeline-no").onclick = () => modal.remove();

  modal.querySelector("#pipeline-yes").onclick = () => {
    modal.remove();
    openPipelineModal(id);
  };
}

// ====================================================================
// MODAL SELEÇÃO DE PIPELINE + ESTÁGIO + NEGÓCIO
// ====================================================================
function openPipelineModal(id) {
  const modal = document.createElement("div");
  modal.className = "loomie-modal-root";

  modal.innerHTML = `
  <div class="loomie-modal">
    <div class="loomie-modal-card">
      <h3>Adicionar ao Pipeline</h3>

      <label>Pipeline:
        <select id="loomie-pipeline" class="loomie-select">
          <option>Carregando...</option>
        </select>
      </label>

      <label>Estágio:
        <select id="loomie-stage" class="loomie-select">
          <option>Selecione um pipeline</option>
        </select>
      </label>

      <label>Título do Negócio:
        <input type="text" id="deal-title" placeholder="Ex: Negócio teste">
      </label>

      <label>Valor do Negócio:
        <input type="number" id="deal-value" placeholder="1000">
      </label>

      <div class="loomie-buttons">
        <button id="pipeline-save" class="loomie-btn-primary">Salvar</button>
        <button id="pipeline-cancel" class="loomie-btn-secondary">Cancelar</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(modal);

  const pipelineSelect = modal.querySelector("#loomie-pipeline");
  const stageSelect = modal.querySelector("#loomie-stage");

  chrome.runtime.sendMessage({ action: "getPipelines" }, (pipelines) => {
    pipelineSelect.innerHTML = `<option value="">Selecione...</option>`;
    pipelines.forEach((p) => {
      pipelineSelect.innerHTML += `<option value="${p.id}">${p.nome}</option>`;
    });
  });

  pipelineSelect.onchange = () => {
    const pid = pipelineSelect.value;
    if (!pid) return;
    stageSelect.innerHTML = `<option>Carregando...</option>`;

    chrome.runtime.sendMessage(
      { action: "getStages", pipelineId: pid },
      (stages) => {
        stageSelect.innerHTML = `<option value="">Selecione...</option>`;
        stages?.forEach((s) => {
          stageSelect.innerHTML += `<option value="${s.id}">${s.nome}</option>`;
        });
      }
    );
  };

  modal.querySelector("#pipeline-save").onclick = () => {
    const pipelineId = pipelineSelect.value;
    const stageId = stageSelect.value;
    const dealTitle = modal.querySelector("#deal-title").value.trim();
    const dealValue = parseFloat(modal.querySelector("#deal-value").value || 0);

    if (!pipelineId || !stageId || !id) {
      return addLog(
        "Selecione pipeline, estágio e contato antes de salvar",
        false
      );
    }

    if (!dealTitle) {
      return addLog("Informe o título do negócio", false);
    }

    // Criar negócio (já adiciona contato ao pipeline e estágio)
    const payload = {
      pipelineId: pipelineId,
      stageId: stageId,
      contactId: id,
      titulo: dealTitle,
      valor: dealValue,
    };

    chrome.runtime.sendMessage(
      {
        action: "createDeal",
        payload
      },
      (resDeal) => {
        if (resDeal?.ok) {
          addLog("Negócio criado ✔️");
          modal.querySelector(".loomie-modal-card").innerHTML =
            "<h3>Operação concluída ✔️</h3>";
        } else {
          addLog(
            "Falha ao criar negócio ❌: " + (resDeal?.message || ""),
            false
          );
          modal.querySelector(
            ".loomie-modal-card"
          ).innerHTML = `<h3>Falha ao criar negócio ❌</h3><p>${
            resDeal?.message || ""
          }</p>`;
        }

        setTimeout(() => modal.remove(), 800);
      }
    );
  };

  modal.querySelector("#pipeline-cancel").onclick = () => modal.remove();
}

// ====================================================================
// PROCESSAMENTO DO TEXTO
// ====================================================================
function processTextNode(textNode) {
  const parent = textNode.parentNode;
  if (!parent) return;

  const forbidden = ["script", "style", "textarea", "input"];
  const pTag = parent.nodeName?.toLowerCase();
  if (!pTag || forbidden.includes(pTag)) return;
  if (parent.closest(".loomie-marker")) return;
  if (parent.closest("a")) return;
  if (parent.isContentEditable) return;

  const text = textNode.nodeValue;
  if (!text?.trim()) return;
  if (text.length > 3000) return;

  const combined = createCombinedRegex();
  combined.lastIndex = 0;
  let m,
    lastIndex = 0,
    found = false;
  const frag = document.createDocumentFragment();

  while ((m = combined.exec(text)) !== null) {
    const matchStart = m.index;
    const matchText = m[0];
    const type = detectType(matchText);
    if (type === "phone" && !isLikelyPhone(matchText)) {
      if (combined.lastIndex === matchStart) combined.lastIndex++;
      continue;
    }
    if (matchStart > lastIndex)
      frag.appendChild(
        document.createTextNode(text.slice(lastIndex, matchStart))
      );
    frag.appendChild(createLogoMarker(matchText));
    lastIndex = matchStart + matchText.length;
    found = true;
    if (combined.lastIndex === matchStart) combined.lastIndex++;
  }

  if (!found) return;
  if (lastIndex < text.length)
    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  parent.replaceChild(frag, textNode);
}

function createCombinedRegex() {
  return new RegExp(
    "(" + emailRegex.source + ")|(" + phoneRegex.source + ")",
    "g"
  );
}

function walkAndProcess(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      const forbiddenTags = ["script", "style", "textarea", "input"];
      if (forbiddenTags.includes(p.tagName.toLowerCase()))
        return NodeFilter.FILTER_REJECT;
      if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
      if (p.closest(".loomie-marker") || p.closest("a"))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(processTextNode);
}

let scannerEnabled = true;

let scanTimer = null;
function scanPage() {
  if (!scannerEnabled) return;
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    try {
      walkAndProcess(document.body);
    } catch (err) {}
  }, 120);
}

const observer = new MutationObserver((mutations) => {
  if (!scannerEnabled) return;
  if (
    mutations.some(
      (m) =>
        (m.type === "childList" && m.addedNodes.length > 0) ||
        m.type === "characterData"
    )
  )
    scanPage();
});

try {
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
} catch {
  try {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  } catch {}
}

// ====================================================================
// CSS INJETADO
// ====================================================================
(function injectCSS() {
  const css = `
.loomie-marker { background: rgba(13,110,253,0.06); padding:2px 6px; border-radius:6px; display:inline-flex; align-items:center; gap:6px; max-width:100%; overflow:hidden; text-overflow:ellipsis; }
.loomie-marker img { filter: drop-shadow(0 1px 0 rgba(0,0,0,0.05)); vertical-align:middle; width:16px; height:16px; cursor:pointer; }

.loomie-modal-root { position: fixed; inset: 0; display:flex; align-items:center; justify-content:center; z-index:2147483647; }
.loomie-modal { position: fixed; inset:0; background: rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:center; padding:8px; overflow:auto; }
.loomie-modal-card { background:#fff; padding:16px; border-radius:12px; box-shadow:0 10px 30px rgba(2,6,23,0.12); width:100%; max-width:360px; display:flex; flex-direction:column; gap:12px; }

.loomie-inputs { display:flex; flex-direction:column; gap:8px; }
.loomie-inputs input { width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; }

.loomie-select { width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:6px; margin-top:4px; }

.loomie-buttons { display:flex; gap:8px; justify-content:center; }
.loomie-btn-primary { background:#0d6efd; color:#fff; padding:8px 12px; border-radius:8px; border:none; cursor:pointer; }
.loomie-btn-secondary { background:#f3f4f6; padding:8px 12px; border-radius:8px; border:none; cursor:pointer; }
`;
  const s = document.createElement("style");
  s.textContent = css;
  document.head?.appendChild(s);
})();

// ====================================================================
// START
// ====================================================================
if (document.readyState === "loading")
  window.addEventListener("DOMContentLoaded", scanPage);
else scanPage();

chrome.storage.sync.get(["loomie_detection_enabled"], (data) => {
  scannerEnabled = data.loomie_detection_enabled !== false;
  if (scannerEnabled) scanPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.loomie_detection_enabled) return;
  scannerEnabled = changes.loomie_detection_enabled.newValue !== false;
  if (scannerEnabled) scanPage();
});
}
