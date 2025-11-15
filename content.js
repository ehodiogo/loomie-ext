// ====================================================================
// REGEXs
// ====================================================================
const emailRegex =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})*/;
const phoneRegex =
  /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/;

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
  console.log("[LoomieCRM]", msg);
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

// ====================================================================
// CRIAR MARCADOR
// ====================================================================
function createLogoMarker(value) {
  const span = document.createElement("span");
  span.className = "loomie-marker";
  span.dataset.loomieValue = value;
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
// MODAL COM EDIT
// ====================================================================
function openConfirmModal(value) {
  if (document.querySelector(".loomie-modal-root")) return;

  const modal = document.createElement("div");
  modal.className = "loomie-modal-root";

  const type = detectType(value);
  const emailVal = type === "email" ? value : "";
  const phoneVal = type === "phone" ? value : "";

  modal.innerHTML = `
  <div class="loomie-modal" role="dialog" aria-modal="true">
    <div class="loomie-modal-card">
      <div class="loomie-modal-header">
        <img src="${chrome.runtime.getURL(
          "assets/logo-loomie.png"
        )}" class="loomie-logo" alt="Loomie">
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
      </div>
      <div class="loomie-buttons">
        <button id="loomie-send" class="loomie-btn-primary">Enviar</button>
        <button id="loomie-cancel" class="loomie-btn-secondary">Cancelar</button>
      </div>
    </div>
  </div>`;

  document.body.appendChild(modal);

  const cancelBtn = modal.querySelector("#loomie-cancel");
  const sendBtn = modal.querySelector("#loomie-send");

  cancelBtn?.addEventListener("click", () => modal.remove());

  sendBtn?.addEventListener("click", () => {
    const name = modal.querySelector("#loomie-name").value.trim();
    const email = modal.querySelector("#loomie-email").value.trim();
    const phone = modal.querySelector("#loomie-phone").value.trim();

    const payload = { "nome": name, "email": email, "telefone": phone };
    chrome.runtime.sendMessage({ action: "sendData", payload: payload }, () => {
    const card = modal.querySelector(".loomie-modal-card");
    if (card) card.innerHTML = "<h3>Enviado ✔️</h3>";
    setTimeout(() => modal.remove(), 1000);
    addLog("Enviado para CRM: " + JSON.stringify(payload), true);
    });
  });
}

// ====================================================================
// PROCESSAR TEXT NODE
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

  const combined = createCombinedRegex();
  combined.lastIndex = 0;
  let m,
    lastIndex = 0,
    found = false;
  const frag = document.createDocumentFragment();

  while ((m = combined.exec(text)) !== null) {
    const matchStart = m.index;
    const matchText = m[0];
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

// ====================================================================
// CRIA REGEX COMBINADO
// ====================================================================
function createCombinedRegex() {
  return new RegExp(
    "(" + emailRegex.source + ")|(" + phoneRegex.source + ")",
    "g"
  );
}

// ====================================================================
// WALK + OBSERVER
// ====================================================================
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

let scanTimer = null;
function scanPage() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    try {
      walkAndProcess(document.body);
      addLog("scanPage executado", true);
    } catch (err) {
      addLog("scanPage erro: " + err?.message, false);
    }
  }, 120);
}

const observer = new MutationObserver((mutations) => {
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
.loomie-modal-card { background:#fff; padding:16px; border-radius:12px; box-shadow:0 10px 30px rgba(2,6,23,0.12); width:100%; max-width:360px; text-align:center; display:flex; flex-direction:column; gap:12px; box-sizing:border-box; }
.loomie-modal-header { display:flex; flex-direction:column; align-items:center; gap:8px; }
.loomie-logo { width:44px; height:44px; }
.loomie-title { margin:0; }
.loomie-inputs { display:flex; flex-direction:column; gap:8px; text-align:left; }
.loomie-inputs input { width:100%; padding:6px 8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; }
.loomie-buttons { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
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
