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
  map: document.querySelector("#warehouseMap"),
  mapPanel: document.querySelector("#mapPanel"),
  mapPlaceholder: document.querySelector("#mapPlaceholder"),
  mapToggle: document.querySelector("#mapToggle"),
  notesBtn: document.querySelector('#notesBtn'),
  notesDialog: document.querySelector('#notesDialog'),
  operatorNotes: document.querySelector('#operatorNotes'),
  notesStatus: document.querySelector('#notesStatus'),
  clearNotesBtn: document.querySelector('#clearNotesBtn'),
  closeNotesBtn: document.querySelector('#closeNotesBtn'),
  ukrposhtaSearchBtn: document.querySelector('#ukrposhtaSearchBtn'),
  ukrposhtaDialog: document.querySelector('#ukrposhtaDialog'),
  closeUkrposhtaBtn: document.querySelector('#closeUkrposhtaBtn'),
  ukrposhtaQuery: document.querySelector('#ukrposhtaQuery'),
  ukrposhtaStatus: document.querySelector('#ukrposhtaStatus'),
  ukrposhtaUpdated: document.querySelector('#ukrposhtaUpdated'),
  ukrposhtaResults: document.querySelector('#ukrposhtaResults'),
  loginOverlay: document.querySelector('#loginOverlay'),
  sitePassword: document.querySelector('#sitePassword'),
  loginBtn: document.querySelector('#loginBtn'),
  settingsBtn: document.querySelector('#settingsBtn'),
  lightThemeBtn: document.querySelector('#lightThemeBtn'),
  darkThemeBtn: document.querySelector('#darkThemeBtn'),
  logoutBtn: document.querySelector('#logoutBtn'),
  settingsDialog: document.querySelector('#settingsDialog'),
  apiStatus: document.querySelector('#apiStatus'),
  apiMasked: document.querySelector('#apiMasked'),
  largeTextToggle: document.querySelector('#largeTextToggle'),
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
let warehouseMap = null;
let warehouseMarkerLayer = null;
let warehouseMarkers = new Map();
let selectedWarehouseKey = null;
let hoveredWarehouseKey = null;
let fitMapOnNextRender = false;
let ukrposhtaData = null;
let ukrposhtaDataPromise = null;
let ukrposhtaSearchTimer = null;

const POPULAR_CITIES = [
  "Київ",
  "Харків",
  "Одеса",
  "Дніпро",
  "Львів",
  "Запоріжжя",
  "Кривий Ріг",
  "Миколаїв",
  "Вінниця",
  "Полтава",
  "Чернігів",
  "Черкаси",
  "Житомир",
  "Хмельницький",
  "Чернівці",
  "Рівне",
  "Івано-Франківськ",
  "Тернопіль",
  "Луцьк",
  "Ужгород"
];

const OPERATOR_NOTES_KEY = 'ug_operator_notes';

function showNotesSaved(){
  if(!els.notesStatus) return;
  els.notesStatus.textContent = 'Збережено ✓';
  clearTimeout(showNotesSaved.timer);
  showNotesSaved.timer = setTimeout(() => {
    els.notesStatus.textContent = '';
  }, 1400);
}

if(els.operatorNotes){
  els.operatorNotes.value = localStorage.getItem(OPERATOR_NOTES_KEY) || '';
  els.operatorNotes.addEventListener('input', () => {
    localStorage.setItem(OPERATOR_NOTES_KEY, els.operatorNotes.value);
    showNotesSaved();
  });
}

els.clearNotesBtn?.addEventListener('click', () => {
  if(!els.operatorNotes?.value) return;
  if(!window.confirm('Очистити нотатки?')) return;
  els.operatorNotes.value = '';
  localStorage.removeItem(OPERATOR_NOTES_KEY);
  els.notesStatus.textContent = '';
  els.operatorNotes.focus();
});

els.notesBtn?.addEventListener('click', () => {
  if(!els.notesDialog || els.notesDialog.open) return;
  els.operatorNotes.value = localStorage.getItem(OPERATOR_NOTES_KEY) || '';
  els.notesStatus.textContent = '';
  els.notesDialog.showModal();
  setTimeout(() => els.operatorNotes.focus(), 0);
});

els.closeNotesBtn?.addEventListener('click', () => {
  els.notesDialog?.close();
});

function normalizeUkrposhtaSearch(value){
  return String(value || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[’'`]/g, '')
    .replace(/(^|\s)м\.?(?=\s)/gu, '$1')
    .replace(/(^|\s)вул\.?(?=\s)/gu, '$1')
    .replace(/(^|\s)вулиця(?=\s)/gu, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function ukrposhtaIndex(record){
  return String(record[0]).padStart(5, '0');
}

function expandUkrposhtaRecord(record){
  return {
    index: ukrposhtaIndex(record),
    city: ukrposhtaData.cities[record[1]] || '',
    region: ukrposhtaData.regions[record[2]] || '',
    district: ukrposhtaData.districts[record[3]] || '',
    street: ukrposhtaData.streets[record[4]] || '',
    office: ukrposhtaData.offices[record[5]] || ''
  };
}

async function loadUkrposhtaData(){
  if(ukrposhtaData) return ukrposhtaData;
  if(ukrposhtaDataPromise) return ukrposhtaDataPromise;
  els.ukrposhtaStatus.textContent = 'Завантаження бази індексів...';
  const dataUrl = new URL('./data/ukrposhta-indexes.json', window.location.href);
  ukrposhtaDataPromise = fetch(dataUrl)
    .then(response => {
      if(!response.ok){
        console.error(
          'Ukrposhta dataset load failed:',
          response.status,
          response.statusText,
          dataUrl.href
        );
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      const validDataset = data
        && typeof data === 'object'
        && Array.isArray(data.records)
        && Array.isArray(data.cities)
        && Array.isArray(data.regions)
        && Array.isArray(data.districts)
        && Array.isArray(data.streets)
        && Array.isArray(data.offices);
      if(!validDataset) throw new Error('Некоректний формат бази Укрпошти');
      data.search = {
        cities: data.cities.map(normalizeUkrposhtaSearch),
        regions: data.regions.map(normalizeUkrposhtaSearch),
        districts: data.districts.map(normalizeUkrposhtaSearch),
        streets: data.streets.map(normalizeUkrposhtaSearch),
        offices: data.offices.map(normalizeUkrposhtaSearch)
      };
      ukrposhtaData = data;
      els.ukrposhtaUpdated.textContent = `База оновлена: ${data.updated || 'дату не вказано'}`;
      els.ukrposhtaStatus.textContent = 'Введіть запит для пошуку.';
      return data;
    })
    .catch(error => {
      ukrposhtaDataPromise = null;
      console.error('Ukrposhta dataset processing failed:', error.message, dataUrl.href);
      els.ukrposhtaStatus.textContent = 'Не вдалося завантажити базу індексів Укрпошти.';
      throw error;
    });
  return ukrposhtaDataPromise;
}

function ukrposhtaCopyText(item){
  const region = item.region && !/^київ$/i.test(item.region)
    ? (/область/i.test(item.region) ? item.region : `${item.region} область`)
    : '';
  return ['УП', item.index, item.street, region, item.city].filter(Boolean).join(' ');
}

function renderUkrposhtaResults(records, hasMore){
  els.ukrposhtaResults.innerHTML = '';
  records.forEach(record => {
    const item = expandUkrposhtaRecord(record);
    const card = document.createElement('article');
    card.className = 'ukrposhta-result-card';
    card.innerHTML = `
      <div class="ukrposhta-result-main">
        <div class="ukrposhta-result-brand">УКРПОШТА</div>
        <div class="ukrposhta-result-index"><span>Індекс</span>${escapeHtml(item.index)}</div>
        <strong>${escapeHtml(item.city)}</strong>
        ${item.street ? `<div>${escapeHtml(item.street)}</div>` : ''}
        <small>${escapeHtml([item.region, item.district, item.office].filter(Boolean).join(' • '))}</small>
      </div>
      <button class="ukrposhta-copy" type="button">Копіювати</button>`;
    card.querySelector('.ukrposhta-copy').addEventListener('click', async () => {
      const text = ukrposhtaCopyText(item);
      try{
        await navigator.clipboard.writeText(text);
        toast('Скопійовано ✓');
      }catch{
        fallbackCopy(text);
      }
    });
    els.ukrposhtaResults.appendChild(card);
  });
  els.ukrposhtaStatus.textContent = hasMore
    ? 'Знайдено багато результатів. Уточніть адресу.'
    : (records.length ? `Знайдено: ${records.length}` : 'Нічого не знайдено.');
}

function searchUkrposhta(){
  if(!ukrposhtaData) return;
  const rawQuery = els.ukrposhtaQuery.value.trim();
  els.ukrposhtaResults.innerHTML = '';
  if(!rawQuery){
    els.ukrposhtaStatus.textContent = 'Введіть запит для пошуку.';
    return;
  }

  const exactIndex = /^\d{5}$/.test(rawQuery) ? Number(rawQuery) : null;
  const tokens = exactIndex === null ? normalizeUkrposhtaSearch(rawQuery).split(' ').filter(Boolean) : [];
  const matches = [];
  for(const record of ukrposhtaData.records){
    let matchesQuery = record[0] === exactIndex;
    if(exactIndex === null){
      const haystack = [
        ukrposhtaIndex(record),
        ukrposhtaData.search.cities[record[1]],
        ukrposhtaData.search.regions[record[2]],
        ukrposhtaData.search.districts[record[3]],
        ukrposhtaData.search.streets[record[4]],
        ukrposhtaData.search.offices[record[5]]
      ].join(' ');
      matchesQuery = tokens.length > 0 && tokens.every(token => haystack.includes(token));
    }
    if(matchesQuery){
      matches.push(record);
      if(matches.length > 50) break;
    }
  }
  renderUkrposhtaResults(matches.slice(0, 50), matches.length > 50);
}

els.ukrposhtaSearchBtn?.addEventListener('click', () => {
  if(!els.ukrposhtaDialog || els.ukrposhtaDialog.open) return;
  els.ukrposhtaDialog.showModal();
  els.ukrposhtaQuery.focus();
  loadUkrposhtaData().then(() => {
    if(els.ukrposhtaQuery.value.trim()) searchUkrposhta();
  }).catch(() => {});
});

els.closeUkrposhtaBtn?.addEventListener('click', () => els.ukrposhtaDialog?.close());

els.ukrposhtaQuery?.addEventListener('input', () => {
  clearTimeout(ukrposhtaSearchTimer);
  ukrposhtaSearchTimer = setTimeout(searchUkrposhta, 250);
});

if(els.citySuggestions && els.citySuggestions.parentElement){
  document.body.appendChild(els.citySuggestions);
}

window.addEventListener('scroll', () => {
  if(!els.citySuggestions || els.citySuggestions.classList.contains('hidden')) return;
  positionCitySuggestions();
}, true);

window.addEventListener('resize', () => {
  if(!els.citySuggestions || els.citySuggestions.classList.contains('hidden')) return;
  positionCitySuggestions();
});

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

function getStoredTheme(){
  const key = 'ug_theme';
  const saved = localStorage.getItem(key);
  if(saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme){
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('ug_theme', next);
  els.lightThemeBtn?.classList.toggle('is-active', next === 'light');
  els.darkThemeBtn?.classList.toggle('is-active', next === 'dark');
  els.lightThemeBtn?.setAttribute('aria-pressed', String(next === 'light'));
  els.darkThemeBtn?.setAttribute('aria-pressed', String(next === 'dark'));
  if(warehouseMap) setTimeout(() => warehouseMap.invalidateSize(), 0);
}

els.lightThemeBtn?.addEventListener('click', () => applyTheme('light'));
els.darkThemeBtn?.addEventListener('click', () => applyTheme('dark'));

applyTheme(getStoredTheme());

function initWarehouseMap(){
  if(warehouseMap) return true;
  if(!els.map || typeof L === 'undefined') return false;
  warehouseMap = L.map(els.map, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(warehouseMap);
  els.mapPlaceholder?.classList.add('hidden');
  setTimeout(() => warehouseMap.invalidateSize(), 0);
  return true;
}

function warehouseCoordinates(warehouse){
  const latitude = Number.parseFloat(String(warehouse?.Latitude ?? '').replace(',', '.'));
  const longitude = Number.parseFloat(String(warehouse?.Longitude ?? '').replace(',', '.'));
  if(!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if(latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if(latitude === 0 && longitude === 0) return null;
  return [latitude, longitude];
}

function warehouseKey(warehouse, index = 0){
  return String(warehouse?.Ref || [warehouse?.Number, warehouse?.Latitude, warehouse?.Longitude, warehouse?.Description].join('|'));
}

function warehouseMarkerType(warehouse){
  if(isPostomat(warehouse)) return 'postomat';
  if(isCargoBranch(warehouse)) return 'cargo';
  return 'branch';
}

function markerIcon(type = 'branch', state = ''){
  const label = type === 'postomat' ? 'П' : (type === 'cargo' ? 'В' : '');
  return L.divIcon({
    className: '',
    html: `<div class="warehouse-marker marker-${type}${state ? ` is-${state}` : ''}">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

function warehousePopup(warehouse, key){
  const status = buildWarehouseStatus(warehouse);
  const limits = getWarehouseLimits(warehouse);
  const type = warehouseMarkerType(warehouse);
  const typeLabel = type === 'postomat' ? 'ПОШТОМАТ' : (type === 'cargo' ? 'ВАНТАЖНЕ' : 'ВІДДІЛЕННЯ');
  const number = warehouse.Number ? `${type === 'postomat' ? 'Поштомат' : 'Відділення'} №${escapeHtml(warehouse.Number)}` : typeLabel;
  const address = escapeHtml(warehouse.ShortAddress || warehouse.Description || 'Адресу не вказано');
  const statusText = escapeHtml(status.label || 'Статус не вказано');
  const schedule = escapeHtml(status.todayText || 'Графік на сьогодні не вказано');
  const coordinates = warehouseCoordinates(warehouse);
  const routeUrl = coordinates ? `https://www.google.com/maps/dir/?api=1&destination=${coordinates[0]},${coordinates[1]}` : '';
  return `<div class="map-popup"><b>${typeLabel}</b><strong>${number}</strong><div>${address}</div><span>${statusText}</span><span>${schedule}</span><div class="map-popup-limits"><strong>⚖ до ${escapeHtml(formatLimitNumber(limits.weight))} кг</strong><span>📦 до ${escapeHtml(formatDimensions(limits))} см</span></div><div class="map-popup-actions"><button type="button" data-map-copy="${escapeHtml(key)}">Копіювати</button><a href="${routeUrl}" target="_blank" rel="noopener noreferrer">Маршрут</a></div></div>`;
}

function setMarkerState(key, state = ''){
  const entry = warehouseMarkers.get(key);
  if(!entry) return;
  entry.marker.setIcon(markerIcon(entry.type, state));
  entry.marker.setZIndexOffset(state === 'selected' ? 1000 : (state === 'hovered' ? 500 : 0));
}

function setMarkerHover(key, active){
  const entry = warehouseMarkers.get(key);
  if(!entry) return;
  setMarkerState(key, active ? 'hovered' : '');
  const visibleParent = warehouseMarkerLayer?.getVisibleParent?.(entry.marker);
  if(visibleParent && visibleParent !== entry.marker){
    visibleParent.getElement?.()?.classList.toggle('is-marker-hovered', active);
  }
}

function selectWarehouseOnMap(warehouse, key, options = {}){
  const { fly = true, openPopup = true, scrollCard = false } = options;
  document.querySelectorAll('.warehouse-card.is-selected').forEach(card => card.classList.remove('is-selected'));
  const card = document.querySelector(`.warehouse-card[data-warehouse-key="${CSS.escape(key)}"]`);
  card?.classList.add('is-selected');
  if(scrollCard) card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if(!warehouseMap) return;
  if(selectedWarehouseKey) setMarkerState(selectedWarehouseKey, '');
  if(hoveredWarehouseKey === key){
    setMarkerHover(key, false);
    hoveredWarehouseKey = null;
  }
  selectedWarehouseKey = key;
  const entry = warehouseMarkers.get(key);
  if(!entry) return;
  setMarkerState(key, 'selected');
  if(fly){
    warehouseMap.flyTo(entry.marker.getLatLng(), 16, { duration: .45 });
    if(openPopup) warehouseMap.once('moveend', () => {
      if(warehouseMarkerLayer?.zoomToShowLayer) warehouseMarkerLayer.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
      else entry.marker.openPopup();
    });
  } else if(openPopup){
    entry.marker.openPopup();
  }
}

function prepareWarehouseMarkers(data){
  if(!initWarehouseMap()) return;
  if(warehouseMarkerLayer) warehouseMap.removeLayer(warehouseMarkerLayer);
  warehouseMarkerLayer = null;
  warehouseMarkers.clear();
  selectedWarehouseKey = null;
  data.forEach((warehouse, index) => {
    const coordinates = warehouseCoordinates(warehouse);
    if(!coordinates) return;
    const key = warehouseKey(warehouse, index);
    const type = warehouseMarkerType(warehouse);
    const marker = L.marker(coordinates, { icon: markerIcon(type), keyboard: true })
      .bindPopup(warehousePopup(warehouse, key))
      .on('click', () => selectWarehouseOnMap(warehouse, key, { fly: false, openPopup: false, scrollCard: true }));
    warehouseMarkers.set(key, { marker, warehouse, type });
  });
  fitMapOnNextRender = true;
}

function renderMapMarkers(data, options = {}){
  if(!warehouseMap) return;
  const { focusSingle = false } = options;
  if(warehouseMarkerLayer) warehouseMap.removeLayer(warehouseMarkerLayer);
  const visibleEntries = data.map((warehouse, index) => warehouseMarkers.get(warehouseKey(warehouse, index))).filter(Boolean);
  const useClusters = visibleEntries.length >= 12 && typeof L.markerClusterGroup === 'function';
  warehouseMarkerLayer = useClusters
    ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, spiderfyOnMaxZoom: true })
    : L.featureGroup();
  visibleEntries.forEach(entry => warehouseMarkerLayer.addLayer(entry.marker));
  warehouseMarkerLayer.addTo(warehouseMap);

  if(focusSingle && visibleEntries.length === 1){
    const entry = visibleEntries[0];
    warehouseMap.setView(entry.marker.getLatLng(), 16);
    setTimeout(() => entry.marker.openPopup(), 0);
    fitMapOnNextRender = false;
    return;
  }

  if(fitMapOnNextRender && visibleEntries.length){
    const bounds = L.latLngBounds(visibleEntries.map(entry => entry.marker.getLatLng()));
    if(visibleEntries.length === 1) warehouseMap.setView(bounds.getCenter(), 15);
    else warehouseMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    fitMapOnNextRender = false;
  }
}

function resetWarehouseMap(){
  if(warehouseMap) warehouseMap.remove();
  warehouseMap = null;
  warehouseMarkerLayer = null;
  warehouseMarkers.clear();
  selectedWarehouseKey = null;
  hoveredWarehouseKey = null;
  fitMapOnNextRender = false;
  els.mapPlaceholder?.classList.remove('hidden');
  els.mapPanel?.classList.remove('is-mobile-open');
  if(els.mapToggle){
    els.mapToggle.textContent = 'Показати карту';
    els.mapToggle.setAttribute('aria-expanded', 'false');
  }
}

els.mapPanel?.addEventListener('click', (event) => {
  const copyButton = event.target.closest('[data-map-copy]');
  if(!copyButton) return;
  const entry = warehouseMarkers.get(copyButton.dataset.mapCopy);
  if(entry) copyWarehouseAddress(entry.warehouse);
});

els.mapToggle?.addEventListener('click', () => {
  const expanded = els.mapPanel?.classList.toggle('is-mobile-open') || false;
  els.mapToggle.textContent = expanded ? 'Сховати карту' : 'Показати карту';
  els.mapToggle.setAttribute('aria-expanded', String(expanded));
  if(expanded) setTimeout(() => {
    warehouseMap?.invalidateSize();
    const bounds = warehouseMarkerLayer?.getBounds?.();
    if(bounds?.isValid()) warehouseMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
  }, 0);
});

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

function positionCitySuggestions(){
  const input = els.city;
  const dropdown = els.citySuggestions;
  if(!input || !dropdown || dropdown.classList.contains('hidden')) return;

  const rect = input.getBoundingClientRect();
  const dropdownMaxHeight = Math.min(420, window.innerHeight * 0.6);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
  const top = Math.min(rect.bottom + 6, window.innerHeight - dropdownMaxHeight - 12);

  dropdown.style.position = 'fixed';
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;
  dropdown.style.width = `${rect.width}px`;
  dropdown.style.maxHeight = `${dropdownMaxHeight}px`;
}

function renderPopularCities(){
  els.citySuggestions.innerHTML = `
    <div class="popular-header">Популярні міста</div>
    <div class="popular-grid popular-cities-grid">
      ${POPULAR_CITIES.map(city => `
        <button type="button" class="popular-item popular-city-btn" data-city="${escapeHtml(city)}">
          <span class="popular-pin">📍</span>
          <span>${escapeHtml(city)}</span>
        </button>
      `).join("")}
    </div>
  `;

  els.citySuggestions.querySelectorAll(".popular-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cityName = btn.dataset.city;
      if(!cityName) return;

      els.city.value = cityName;
      els.citySuggestions.classList.add("hidden");

      try{
        const data = await npRequest("Address", "searchSettlements", {
          CityName: cityName,
          Limit: 20,
          Page: 1
        });

        const addresses = data?.[0]?.Addresses || [];
        if(!addresses.length){
          els.status.textContent = `Не вдалося знайти "${cityName}"`;
          return;
        }

        const match = addresses.find(item => {
          const present = (item.Present || item.MainDescription || "").toLowerCase();
          return present === cityName.toLowerCase();
        }) || addresses[0];

        selectCity(match);
      }catch(e){
        els.status.textContent = e.message;
      }
    });
  });

  els.citySuggestions.classList.remove("hidden");
  positionCitySuggestions();
}

async function searchCities(q){
  const value = q.trim();
  if(!value){
    els.citySuggestions.classList.add("hidden");
    return;
  }
  if(value.length < 2){
    els.citySuggestions.classList.add("hidden");
    return;
  }
  els.citySuggestions.style.position = 'fixed';
  try{
    const data = await npRequest("Address", "searchSettlements", {
      CityName: value,
      Limit: 20,
      Page: 1
    });

    const addresses = data?.[0]?.Addresses || [];
    els.citySuggestions.innerHTML = "";
    if(!addresses.length){
      els.citySuggestions.innerHTML = '<div class="suggestion">Нічого не знайдено</div>';
    } else {
      addresses.forEach(item => {
        const div = document.createElement("div");
        div.className = "suggestion city-suggestion";
        const region = [item.Area, item.Region].filter(Boolean).join(", ");
        div.innerHTML = `<strong>${escapeHtml(item.Present || item.MainDescription || "")}</strong>
          ${region ? `<small>${escapeHtml(region)}</small>` : ""}`;
        div.addEventListener("click", () => selectCity(item));
        els.citySuggestions.appendChild(div);
      });
    }
    els.citySuggestions.classList.remove("hidden");
    positionCitySuggestions();
  }catch(e){
    els.status.textContent = e.message;
  }
}

async function selectCity(item){
  selectedCity = item;
  els.city.dataset.isTyping = '';
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
    prepareWarehouseMarkers(warehouses);
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

function positiveLimit(value){
  const number = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatLimitNumber(value){
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function getWarehouseLimits(warehouse){
  const postomat = isPostomat(warehouse);
  const cargo = isCargoBranch(warehouse);
  const defaults = postomat
    ? { type: 'postomat', weight: 20, length: 60, width: 40, height: 30 }
    : cargo
      ? { type: 'cargo', weight: 1000, length: 300, width: 170, height: 170 }
      : { type: 'branch', weight: 30, length: 120, width: 70, height: 70 };

  const totalWeight = positiveLimit(warehouse?.TotalMaxWeightAllowed);
  const placeWeight = positiveLimit(warehouse?.PlaceMaxWeightAllowed);
  const apiDimensions = warehouse?.SendingLimitationsOnDimensions;

  return {
    ...defaults,
    weight: totalWeight ?? placeWeight ?? defaults.weight,
    length: positiveLimit(apiDimensions?.Length) ?? defaults.length,
    width: positiveLimit(apiDimensions?.Width) ?? defaults.width,
    height: positiveLimit(apiDimensions?.Height) ?? defaults.height
  };
}

function formatDimensions(limits){
  return `${formatLimitNumber(limits.length)} × ${formatLimitNumber(limits.width)} × ${formatLimitNumber(limits.height)}`;
}

function warehouseLimitsRows(limits){
  const weight = `<div class="warehouse-limit-row warehouse-limit-weight"><span aria-hidden="true">⚖</span><span>До <strong>${escapeHtml(formatLimitNumber(limits.weight))} кг</strong></span></div>`;
  if(limits.type === 'postomat'){
    return `${weight}<div class="warehouse-limit-row"><span aria-hidden="true">📦</span><span>До ${escapeHtml(formatDimensions(limits))} см</span></div>`;
  }
  const lengthLabel = limits.type === 'cargo' ? 'До' : 'Довжина до';
  const crossLabel = limits.type === 'cargo' ? 'До' : 'Ширина / висота до';
  return `${weight}<div class="warehouse-limit-row"><span aria-hidden="true">↔</span><span>${lengthLabel} ${escapeHtml(formatLimitNumber(limits.length))} см</span></div><div class="warehouse-limit-row"><span aria-hidden="true">↕</span><span>${crossLabel} ${escapeHtml(formatLimitNumber(limits.width))} × ${escapeHtml(formatLimitNumber(limits.height))} см</span></div>`;
}

function getKyivDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
}

function getTodayScheduleKey() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    weekday: 'long'
  }).format(getKyivDate());
}

function getCurrentKyivMinutes(date = getKyivDate()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function normalizeScheduleValue(value) {
  if(value === null || value === undefined) return "";
  const raw = String(value).trim().replace(/\u00A0/g, ' ');
  if(!raw) return "";
  const firstPart = raw.split(',')[0].trim();
  return firstPart
    .replace(/\s*[-–—]\s*/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractScheduleForDay(warehouse, dayName) {
  const candidates = [
    warehouse?.Schedule,
    warehouse?.WorkSchedule,
    warehouse?.WorkTime,
    warehouse?.OpeningHours,
    warehouse?.ScheduleData,
    warehouse?.ScheduleInfo
  ];

  for (const obj of candidates) {
    if(!obj || typeof obj !== 'object') continue;
    const values = [
      obj[dayName],
      obj[dayName.toLowerCase()],
      obj[dayName.toUpperCase()],
      obj[dayName.slice(0, 3)]
    ];
    const value = values.find(v => v !== undefined && v !== null && String(v).trim() !== "");
    if(value !== undefined) return normalizeScheduleValue(value);
  }

  const altNames = [
    `Schedule${dayName}`,
    `WorkSchedule${dayName}`,
    `WorkTime${dayName}`,
    `${dayName}Schedule`,
    `${dayName}WorkTime`
  ];

  for (const key of altNames) {
    const value = warehouse?.[key];
    if(value !== undefined && value !== null && String(value).trim() !== "") {
      return normalizeScheduleValue(value);
    }
  }

  return "";
}

function parseScheduleRange(rangeText) {
  const normalized = normalizeScheduleValue(rangeText);
  if(!normalized) return null;

  const match = normalized.match(/^(\d{1,2}:\d{2})\s*–\s*(\d{1,2}:\d{2})$/i);
  if(!match) return null;

  const startMinutes = Number(match[1].split(':')[0]) * 60 + Number(match[1].split(':')[1]);
  let endMinutes = Number(match[2].split(':')[0]) * 60 + Number(match[2].split(':')[1]);
  if(endMinutes <= startMinutes) endMinutes += 24 * 60;

  return { startMinutes, endMinutes };
}

function isTemporarilyInactive(warehouse) {
  const values = [
    warehouse?.IsActive,
    warehouse?.IsWorking,
    warehouse?.IsWarehouseWorking,
    warehouse?.WarehouseIsWorking,
    warehouse?.WarehouseStatus,
    warehouse?.WarehouseStatusDescription,
    warehouse?.Status,
    warehouse?.StatusDescription,
    warehouse?.Schedule?.IsActive,
    warehouse?.WorkSchedule?.IsActive,
    warehouse?.Schedule?.Status,
    warehouse?.WorkSchedule?.Status
  ];

  for (const value of values) {
    if(value === null || value === undefined) continue;

    if(typeof value === 'boolean') {
      if(!value) return true;
      continue;
    }

    if(typeof value === 'number') {
      if(value === 0 || value === 2 || value === 3) return true;
      continue;
    }

    const text = String(value).trim().toLowerCase();
    if(!text) continue;

    const inactivePattern = /(неактив|inactive|not active|не працює|not working|тимчасово|temporary|closed|закрито|закритий|disabled|вимкн)/i;
    if(inactivePattern.test(text)) return true;
  }

  return false;
}

function buildWarehouseStatus(warehouse) {
  const today = getTodayScheduleKey();
  const todayRange = extractScheduleForDay(warehouse, today);

  if(isTemporarilyInactive(warehouse)) {
    return {
      type: 'inactive',
      label: '🔴 Тимчасово не працює',
      todayText: ''
    };
  }

  if(!todayRange) {
    return {
      type: 'missing',
      label: '',
      todayText: 'Графік не вказано'
    };
  }

  const range = parseScheduleRange(todayRange);
  if(!range) {
    return {
      type: 'missing',
      label: '',
      todayText: `Сьогодні: ${todayRange}`
    };
  }

  const currentMinutes = getCurrentKyivMinutes();
  const isOpen = currentMinutes >= range.startMinutes && currentMinutes < range.endMinutes;

  return {
    type: isOpen ? 'open' : 'closed',
    label: isOpen ? '🟢 Працює зараз' : '⚫ Зараз зачинено',
    todayText: `Сьогодні: ${todayRange}`
  };
}

function renderWarehouses(){
  const query = els.warehouse.value.trim().toLowerCase();
  const isNumberQuery = /^\d+$/.test(query);
  let data = warehouses.filter(w => {
    if(filterType === "postomat" && !isPostomat(w)) return false;
    if(filterType === "branch" && isPostomat(w)) return false;
    if(filterType === "cargo" && !isCargoBranch(w)) return false;
    if(!query) return true;
    if(isNumberQuery) return String(w.Number ?? "").trim() === query;
    const hay = [
      w.Description, w.DescriptionRu, w.ShortAddress, w.SettlementDescription,
      w.CityDescription
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(query);
  });

  data.sort((a,b) => (parseInt(a.Number)||999999) - (parseInt(b.Number)||999999));

  renderMapMarkers(data, { focusSingle: isNumberQuery && data.length === 1 });

  els.results.innerHTML = "";
  els.status.textContent = selectedCity
    ? (isNumberQuery && !data.length ? `Відділення №${query} не знайдено` : `Знайдено: ${data.length}`)
    : "Введіть назву міста";

  if(!data.length){
    els.results.innerHTML = isNumberQuery
      ? `<div class="empty">Відділення №${query} не знайдено</div>`
      : '<div class="empty">За вашим запитом нічого не знайдено</div>';
    return;
  }

  data.slice(0,250).forEach((w, index) => {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector('.warehouse-card');
    const key = warehouseKey(w, index);
    card.dataset.warehouseKey = key;
    const postomat = isPostomat(w);
    const cargo = isCargoBranch(w);
    const title = w.Description || `${postomat ? "Поштомат" : "Відділення"} №${w.Number || ""}`;
    const address = w.ShortAddress || w.Description || "";
    const city = w.CityDescription || selectedCity?.MainDescription || selectedCity?.Present || "";
    const status = buildWarehouseStatus(w);
    const limits = getWarehouseLimits(w);

    node.querySelector(".badge").textContent = postomat ? "ПОШТОМАТ" : (cargo ? "ВАНТАЖНЕ" : "ВІДДІЛЕННЯ");
    node.querySelector(".warehouse-title").textContent = title;
    node.querySelector(".warehouse-address").textContent = address;
    node.querySelector(".warehouse-extra").textContent = city;
    node.querySelector(".warehouse-limits-title").textContent = limits.type === 'postomat' ? 'ОБМЕЖЕННЯ' : 'ОБМЕЖЕННЯ ВІДДІЛЕННЯ';
    node.querySelector(".warehouse-limits-rows").innerHTML = warehouseLimitsRows(limits);

    const statusBar = node.querySelector(".status-line");
    const statusText = node.querySelector(".status-text");
    const scheduleLine = node.querySelector(".schedule-line");

    if(status.type === 'missing'){
      statusBar.classList.add('hidden');
      scheduleLine.textContent = status.todayText;
    } else if(status.type === 'inactive'){
      statusBar.classList.add(status.type);
      statusText.textContent = status.label;
      scheduleLine.textContent = '';
    } else {
      statusBar.classList.add(status.type);
      statusText.textContent = status.label;
      scheduleLine.textContent = status.todayText;
    }

    card.addEventListener('click', () => selectWarehouseOnMap(w, key));
    card.addEventListener('mouseenter', () => {
      if(key === selectedWarehouseKey) return;
      hoveredWarehouseKey = key;
      setMarkerHover(key, true);
    });
    card.addEventListener('mouseleave', () => {
      if(hoveredWarehouseKey !== key || key === selectedWarehouseKey) return;
      hoveredWarehouseKey = null;
      setMarkerHover(key, false);
    });

    node.querySelector(".copy-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      copyWarehouseAddress(w);
    });
    els.results.appendChild(node);
  });
}

function formatWarehouseCopyText(warehouse){
  const number = String(warehouse.Number || "").trim();
  const rawAddress = String(warehouse.ShortAddress || warehouse.Description || "").trim();
  const cityName = String(warehouse.CityDescription || selectedCity?.MainDescription || "").trim();
  const areaRaw = String(selectedCity?.Area || "").trim();
  const streetAddress = rawAddress
    .replace(new RegExp(`^(м\.?\s*)?${escapeRegExp(cityName)}\s*,?\s*`, "i"), "")
    .trim();
  const area = areaRaw && !/область/i.test(areaRaw) ? `${areaRaw} область` : areaRaw;
  return [
    `НП${number}`,
    streetAddress,
    area,
    cityName ? `м. ${cityName.replace(/^м\.?\s*/i, "")}` : ""
  ].filter(Boolean).join(" ");
}

async function copyWarehouseAddress(warehouse){
  const copyText = formatWarehouseCopyText(warehouse);
  try{
    await navigator.clipboard.writeText(copyText);
    toast("Скопійовано ✓");
  }catch{
    fallbackCopy(copyText);
  }
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
  resetWarehouseMap();
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

function resetCitySelection(){
  selectedCity = null;
  els.city.value = "";
  els.warehouse.value = "";
  els.warehouse.disabled = true;
  warehouses = [];
  els.results.innerHTML = "";
  els.status.textContent = "Введіть назву міста";
  els.clear.classList.add("hidden");
  resetWarehouseMap();
  renderPopularCities();
  els.city.focus();
}

els.city.addEventListener("focus", () => {
  const currentValue = els.city.value.trim();
  const selectedValue = selectedCity ? (selectedCity.Present || selectedCity.MainDescription || "").trim() : "";

  if(selectedCity && selectedValue && currentValue === selectedValue && !els.city.dataset.isTyping) {
    resetCitySelection();
    return;
  }

  if(!currentValue){
    renderPopularCities();
  }
});

els.city.addEventListener("click", () => {
  if(!selectedCity && !els.city.value.trim()){
    renderPopularCities();
  }
});

els.city.addEventListener("input", () => {
  selectedCity = null;
  els.warehouse.disabled = true;
  clearTimeout(cityTimer);

  els.city.dataset.isTyping = '1';

  if(!els.city.value.trim()){
    els.citySuggestions.classList.add("hidden");
    els.city.dataset.isTyping = '';
    return;
  }

  cityTimer = setTimeout(() => {
    els.city.dataset.isTyping = '';
    searchCities(els.city.value);
  }, 280);
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

function getStoredLargeText(){
  return localStorage.getItem('ug_large_text') === '1';
}

function applyLargeText(enabled){
  const next = !!enabled;
  document.documentElement.dataset.largeText = next ? '1' : '0';
  localStorage.setItem('ug_large_text', next ? '1' : '0');

  if(els.largeTextToggle){
    els.largeTextToggle.checked = next;
  }
}

function updateSettingsUI(){
  const has = requireApiKey();
  els.apiStatus.textContent = has ? 'Статус: Підключено ✓' : 'Статус: Не налаштовано';
  els.apiMasked.textContent = has ? '••••••••••••••••' : '—';
  if(els.largeTextToggle){
    els.largeTextToggle.checked = getStoredLargeText();
  }
}

els.largeTextToggle?.addEventListener('change', () => {
  applyLargeText(els.largeTextToggle.checked);
});

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
    try{ if(els.notesDialog.open) els.notesDialog.close(); }catch{}
    try{ if(els.ukrposhtaDialog.open) els.ukrposhtaDialog.close(); }catch{}
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

applyLargeText(getStoredLargeText());

window.addEventListener("DOMContentLoaded", () => {
  if(!isAuthorized()){
    // show overlay
    els.loginOverlay.style.display = 'flex';
    els.sitePassword.focus();
  } else {
    initAfterAuth();
  }
});
