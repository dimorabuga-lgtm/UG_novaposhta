const SITE_PASSWORD = 'UG2026';
const ADMIN_PASSWORD = 'UGADMIN2026';

const els = {
  city: document.querySelector("#cityInput"),
  citySuggestions: document.querySelector("#citySuggestions"),
  warehouse: document.querySelector("#warehouseInput"),
  results: document.querySelector("#results"),
  status: document.querySelector("#status"),
  clear: document.querySelector("#clearBtn"),
  toast: document.querySelector("#toast"),
  template: document.querySelector("#warehouseTemplate"),
  loginOverlay: document.querySelector('#loginOverlay'),
  sitePassword: document.querySelector('#sitePassword'),
  loginBtn: document.querySelector('#loginBtn'),
  settingsBtn: document.querySelector('#settingsBtn'),
  logoutBtn: document.querySelector('#logoutBtn'),
  settingsDialog: document.querySelector('#settingsDialog'),
  apiStatus: document.querySelector('#apiStatus'),
  apiMasked: document.querySelector('#apiMasked'),
  changeKeyBtn: document.querySelector('#changeKeyBtn'),
  clearKeyBtn: document.querySelector('#clearKeyBtn'),
  adminPassDialog: document.querySelector('#adminPassDialog'),
  adminPassInput: document.querySelector('#adminPassInput'),
  adminConfirmBtn: document.querySelector('#adminConfirmBtn'),
  newKeyDialog: document.querySelector('#newKeyDialog'),
  newApiInput: document.querySelector('#newApiInput'),
  saveNewApiBtn: document.querySelector('#saveNewApiBtn')
};

let selectedCity = null;
let warehouses = [];
let filterType = "all";
let cityTimer = null;

function toast(text){
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 1600);
}

function isAuthorized(){
  return localStorage.getItem('ug_authorized') === '1';
}

function requireApiKey(){
  return !!localStorage.getItem('nova_poshta_api_key');
}

async function npRequest(modelName, calledMethod, methodProperties = {}){
  const apiKey = localStorage.getItem('nova_poshta_api_key') || '';
  if(!apiKey) throw new Error('API Key не налаштовано');

  const payload = {
    apiKey,
    modelName,
    calledMethod,
    methodProperties
  };

  let res;
  try{
    res = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }catch(e){
    throw new Error('Мережна помилка: ' + e.message);
  }

  if(!res.ok){
    throw new Error('Помилка мережі: ' + res.status);
  }

  let json;
  try{ json = await res.json(); }catch(e){ throw new Error('Невірна відповідь від API'); }

  if(json.success === false){
    // Generic message, do not expose API key
    throw new Error((json.errors && json.errors.length) ? json.errors.join(', ') : 'Не вдалося виконати запит. Перевірте API Key.');
  }
  return json.data || json;
}

async function searchCities(q){
  if(q.trim().length < 2){
    els.citySuggestions.classList.add("hidden");
    return;
  }
  try{
    const data = await npRequest("Address", "searchSettlements", {
      CityName:q.trim(),
      Limit:20,
      Page:1
    });

    const addresses = data?.[0]?.Addresses || [];
    els.citySuggestions.innerHTML = "";
    if(!addresses.length){
      els.citySuggestions.innerHTML = '<div class="suggestion">Нічого не знайдено</div>';
    } else {
      addresses.forEach(item => {
        const div = document.createElement("div");
        div.className = "suggestion";
        const region = [item.Area, item.Region].filter(Boolean).join(", ");
        div.innerHTML = `<strong>${escapeHtml(item.Present || item.MainDescription || "")}</strong>
          ${region ? `<small>${escapeHtml(region)}</small>` : ""}`;
        div.addEventListener("click", () => selectCity(item));
        els.citySuggestions.appendChild(div);
      });
    }
    els.citySuggestions.classList.remove("hidden");
  }catch(e){
    els.status.textContent = e.message;
  }
}

async function selectCity(item){
  selectedCity = item;
  els.city.value = item.Present || item.MainDescription || "";
  els.citySuggestions.classList.add("hidden");
  els.warehouse.disabled = false;
  els.warehouse.value = "";
  els.status.textContent = "Завантажую відділення…";
  els.clear.classList.remove("hidden");
  try{
    warehouses = await npRequest("AddressGeneral", "getWarehouses", {
      SettlementRef: item.Ref,
      Limit: 1000,
      Page: 1
    });
    renderWarehouses();
  }catch(e){
    warehouses = [];
    els.status.textContent = e.message;
    renderWarehouses();
  }
}

function isPostomat(w){
  const s = `${w.Description || ""} ${w.DescriptionRu || ""} ${w.TypeOfWarehouse || ""}`.toLowerCase();
  return s.includes("поштомат") || s.includes("почтомат");
}

function isCargoBranch(w){
  if(isPostomat(w)) return false;
  const maxWeight = Number(String(w.TotalMaxWeightAllowed || "").replace(",", "."));
  const text = `${w.Description || ""} ${w.DescriptionRu || ""}`.toLowerCase();
  return maxWeight > 30 || text.includes("вантажне") || text.includes("грузовое");
}

function renderWarehouses(){
  const query = els.warehouse.value.trim().toLowerCase();
  let data = warehouses.filter(w => {
    if(filterType === "postomat" && !isPostomat(w)) return false;
    if(filterType === "branch" && isPostomat(w)) return false;
    if(filterType === "cargo" && !isCargoBranch(w)) return false;
    if(!query) return true;
    const hay = [
      w.Number, w.Description, w.ShortAddress, w.SettlementDescription,
      w.CityDescription
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(query);
  });

  data.sort((a,b) => (parseInt(a.Number)||999999) - (parseInt(b.Number)||999999));

  els.results.innerHTML = "";
  els.status.textContent = selectedCity
    ? `Знайдено: ${data.length}`
    : "Введіть назву міста";

  if(!data.length){
    els.results.innerHTML = '<div class="empty">За вашим запитом нічого не знайдено</div>';
    return;
  }

  data.slice(0,250).forEach(w => {
    const node = els.template.content.cloneNode(true);
    const postomat = isPostomat(w);
    const cargo = isCargoBranch(w);
    const title = w.Description || `${postomat ? "Поштомат" : "Відділення"} №${w.Number || ""}`;
    const address = w.ShortAddress || w.Description || "";
    const city = w.CityDescription || selectedCity?.MainDescription || selectedCity?.Present || "";
    const weight = w.TotalMaxWeightAllowed ? `до ${w.TotalMaxWeightAllowed} кг` : "";

    node.querySelector(".badge").textContent = postomat ? "ПОШТОМАТ" : (cargo ? "ВАНТАЖНЕ" : "ВІДДІЛЕННЯ");
    node.querySelector(".warehouse-title").textContent = title;
    node.querySelector(".warehouse-address").textContent = address;
    node.querySelector(".warehouse-extra").textContent = [city, weight].filter(Boolean).join(" • ");

    node.querySelector(".copy-btn").addEventListener("click", async () => {
      const number = String(w.Number || "").trim();
      const rawAddress = String(w.ShortAddress || w.Description || "").trim();
      const cityName = String(w.CityDescription || selectedCity?.MainDescription || "").trim();
      const areaRaw = String(selectedCity?.Area || "").trim();

      // ShortAddress часто вже містить місто на початку — прибираємо його,
      // щоб у скопійованому тексті місто було лише один раз наприкінці.
      let streetAddress = rawAddress
        .replace(new RegExp(`^(м\.?\s*)?${escapeRegExp(cityName)}\s*,?\s*`, "i"), "")
        .trim();

      let area = areaRaw;
      if(area && !/область/i.test(area)) area += " область";

      const parts = [
        `НП${number}`,
        streetAddress,
        area,
        cityName ? `м. ${cityName.replace(/^м\.?\s*/i, "")}` : ""
      ].filter(Boolean);

      const copyText = parts.join(" ");
      try{
        await navigator.clipboard.writeText(copyText);
        toast("Скопійовано ✓");
      }catch{
        fallbackCopy(copyText);
      }
    });
    els.results.appendChild(node);
  });
}

function fallbackCopy(text){
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  toast("Скопійовано ✓");
}

function clearAll(){
  selectedCity = null;
  warehouses = [];
  els.city.value = "";
  els.warehouse.value = "";
  els.warehouse.disabled = true;
  els.results.innerHTML = "";
  els.status.textContent = "Введіть назву міста";
  els.clear.classList.add("hidden");
  els.city.focus();
}


function escapeRegExp(str){
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

els.city.addEventListener("input", () => {
  selectedCity = null;
  els.warehouse.disabled = true;
  clearTimeout(cityTimer);
  cityTimer = setTimeout(() => searchCities(els.city.value), 280);
});
els.warehouse.addEventListener("input", renderWarehouses);
els.clear.addEventListener("click", clearAll);

document.addEventListener("click", e => {
  if(!e.target.closest(".field")) els.citySuggestions.classList.add("hidden");
});

document.querySelectorAll(".chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    filterType = btn.dataset.type;
    renderWarehouses();
  });
});

function updateSettingsUI(){
  const has = requireApiKey();
  els.apiStatus.textContent = has ? 'Статус: Підключено ✓' : 'Статус: Не налаштовано';
  els.apiMasked.textContent = has ? '••••••••••••••••' : '—';
}

function openNewKeyDialog(initial=false){
  els.newApiInput.value = '';
  els.newKeyDialog.showModal();
  els.newApiInput.focus();
}

function promptAdminThen(onSuccess){
  els.adminPassInput.value = '';
  els.adminPassDialog.showModal();
  els.adminPassInput.focus();

  const handler = (e) => {
    e.preventDefault();
    const v = els.adminPassInput.value.trim();
    if(v === ADMIN_PASSWORD){
      els.adminPassDialog.close();
      els.adminConfirmBtn.onclick = null;
      onSuccess();
    } else {
      toast('Невірний пароль');
    }
  };

  els.adminConfirmBtn.onclick = handler;
}

// Event handlers for settings and auth
els.settingsBtn.addEventListener('click', () => {
  updateSettingsUI();
  els.settingsDialog.showModal();
});

els.logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('ug_authorized');
  // do not remove API key
  location.reload();
});

els.changeKeyBtn.addEventListener('click', () => {
  els.settingsDialog.close();
  promptAdminThen(() => openNewKeyDialog());
});

els.clearKeyBtn.addEventListener('click', () => {
  els.settingsDialog.close();
  promptAdminThen(() => {
    localStorage.removeItem('nova_poshta_api_key');
    updateSettingsUI();
    toast('API Key очищено');
    // ask to add new key
    openNewKeyDialog(true);
  });
});

els.saveNewApiBtn.addEventListener('click', (e) => {
  e.preventDefault();
  const v = els.newApiInput.value.trim();
  if(!v){ toast('Введіть API Key'); return; }
  localStorage.setItem('nova_poshta_api_key', v);
  els.newKeyDialog.close();
  updateSettingsUI();
  toast('API Key збережено ✓');
});

// Login flow
els.loginBtn.addEventListener('click', () => {
  const v = els.sitePassword.value.trim();
  if(v === SITE_PASSWORD){
    localStorage.setItem('ug_authorized','1');
    els.loginOverlay.style.display = 'none';
    initAfterAuth();
  } else {
    toast('Невірний пароль');
    els.sitePassword.focus();
  }
});

els.sitePassword.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); els.loginBtn.click(); }
});

els.adminPassInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); els.adminConfirmBtn.click(); }
});

els.newApiInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); els.saveNewApiBtn.click(); }
});

// Close dialogs with Escape
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    if(document.fullscreenElement) return;
    try{ if(els.settingsDialog.open) els.settingsDialog.close(); }catch{}
    try{ if(els.adminPassDialog.open) els.adminPassDialog.close(); }catch{}
    try{ if(els.newKeyDialog.open) els.newKeyDialog.close(); }catch{}
  }
});

function initAfterAuth(){
  els.loginOverlay.style.display = 'none';
  updateSettingsUI();
  // if no API key, prompt operator to add one
  if(!requireApiKey()){
    // initial add does not require admin
    openNewKeyDialog(true);
  }
  els.city.focus();
}

window.addEventListener("DOMContentLoaded", () => {
  if(!isAuthorized()){
    // show overlay
    els.loginOverlay.style.display = 'flex';
    els.sitePassword.focus();
  } else {
    initAfterAuth();
  }
});
