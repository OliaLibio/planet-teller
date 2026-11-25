// Planet Teller – App-Logik (Vanilla JS, kein Build).
// Die Lebensmittel-Daten stehen in foods.js und werden vor dieser Datei geladen.

// ---------- Speicher ----------
const KEY_PREFIX = "mein-tag:";
const SETTINGS_KEY = "mein-tag-settings";
const PROFILE_KEY = "mein-tag-profile";
const PREFS_KEY = "mein-tag-prefs";
const CUSTOM_KEY = "mein-tag-foods";      // gemerkte Online-Produkte und eigene Lebensmittel
const BACKUP_INFO_KEY = "mein-tag-backup-info";
const ALL_KEYS_PREFIX = "mein-tag";
const ENTRY_VERSION = 2;                  // Einträge ab Version 2 tragen feste Gruppe und festen CO₂-Wert
const memoryStore = new Map();
let storageFailed = false;

const DEFAULT_TARGETS = {kcal: 1800, prot: 60, co2: 2500};
const DEFAULT_PREFS = ["gemuese", "obst", "huelsen", "getreide"];
const DEFAULT_PROFILE = {
  age: 30, weight: 50, height: 165, activity: 1.45, proteinFactor: 1.2, planetMode: 2500,
  healthNote: "", sex: "w", diet: "alles", avoid: []
};
const ALL_GROUPS = [...FOOD_GROUPS, ...OTHER_GROUPS];

function readStoredValue(key) {
  try {
    const value = localStorage.getItem(key);
    if (value !== null) return value;
  } catch (e) { /* Speicher gesperrt: unten aus dem Arbeitsspeicher lesen */ }
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

// silent: true = Änderung kommt vom Abgleich selbst und muss nicht wieder hochgeladen werden.
function writeStoredValue(key, value, silent) {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    storageFailed = true;
    console.warn("Speichern im Browser ist gerade nicht verfügbar.", e);
    showStorageWarning();
  }
  if (!silent && window.PlanetSync) window.PlanetSync.markDirty(key);
}

function removeStoredValue(key) {
  memoryStore.delete(key);
  try { localStorage.removeItem(key); } catch (e) { /* ignorieren */ }
}

function allStoredKeys() {
  const keys = new Set(memoryStore.keys());
  try {
    for (let i = 0; i < localStorage.length; i++) keys.add(localStorage.key(i));
  } catch (e) { /* ignorieren */ }
  return [...keys].filter(k => k && k.startsWith(ALL_KEYS_PREFIX)).sort();
}

function readJson(key, fallback) {
  try {
    const value = readStoredValue(key);
    return value ? JSON.parse(value) : fallback;
  } catch (e) { return fallback; }
}

function showStorageWarning() {
  const el = document.getElementById("storageWarning");
  if (el) el.style.display = "";
}

// ---------- Datum ----------
let currentDate = new Date();

function dateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return KEY_PREFIX + year + "-" + month + "-" + day;
}

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

// ---------- Text-Helfer ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[m]));
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/sosse/g, "sauce") // „Tomatensoße“ findet „Tomatensauce“
    .replaceAll("é", "e")
    .replaceAll("è", "e");
}

function normalizeFoodName(name) {
  return normalizeSearchText(name).replace(/\s+/g, " ").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function groupLabel(groupId) {
  const group = ALL_GROUPS.find(g => g.id === groupId);
  return group ? group.label : "Sonstiges";
}

// ---------- Lebensmittel: Nachschlagen ----------
const FOOD_BY_NAME = new Map(FOODS.map(f => [normalizeFoodName(f.n), f]));
FOODS.forEach(prepareFood);

let customFoods = [];
let onlineFoods = [];

// Suchtext einmal vorbereiten: Name, Suchwörter, Gruppe, Nuss-Hinweis.
function prepareFood(food) {
  const extra = [];
  if (/[NP]/.test(food.flags || "")) extra.push("nuss nuesse nuts");
  extra.push(normalizeSearchText(groupLabel(food.group)));
  food.nameNorm = normalizeFoodName(food.n);
  food.hay = `${food.nameNorm} ${normalizeSearchText(food.tags || "")} ${extra.join(" ")}`;
  return food;
}

function foodByName(name) {
  const key = normalizeFoodName(name);
  return FOOD_BY_NAME.get(key) || customFoods.find(f => f.nameNorm === key) || null;
}

// Findet das Lebensmittel zu einem gespeicherten Eintrag ("… (Vorschlag)", "Suppe (Linsen, gekocht)" …).
function foodForEntryName(name) {
  const clean = String(name || "").replace(/ \((Vorschlag|Foto bestätigt)\)$/, "");
  const direct = foodByName(clean);
  if (direct) return direct;
  return FOODS.find(f => clean.endsWith(` (${f.n})`)) || null;
}

function baseEntryName(name) {
  const food = foodForEntryName(name);
  return food ? food.n : String(name || "").replace(/ \((Vorschlag|Foto bestätigt)\)$/, "");
}

// ---------- Gruppen und CO₂ schätzen (nur für freie Einträge und Online-Produkte) ----------
function inferGroup(name) {
  const t = normalizeSearchText(name);
  if (/hafermilch|haferdrink|sojadrink|sojamilch|mandeldrink|mandelmilch|pflanzendrink|plant-based-milk|kaffee|coffee|espresso|cappuccino|latte|\btee\b|saft|juice|wasser|water|limo|cola|\bbier|beer|\bwein|rotwein|weisswein|wine|smoothie|beverage|getraenk|drink/.test(t)) return "getraenk";
  if (/suppe|eintopf|pizza|burger|lasagne|curry|auflauf|\bbowl|\bwrap|sandwich|doener|sushi|fertiggericht|\bmeals?\b|soup/.test(t)) return "gericht";
  if (/tofu|tempeh|seitan/.test(t)) return "huelsen"; // vor den Nüssen: „Räuchertofu Mandel-Sesam“ ist Tofu
  if (/erdnuss|peanut|mandel|almond|walnuss|walnuesse|cashew|haselnuss|haselnuesse|pistaz|pekannuss|macadamia|paranuss|\bnuss|nuesse|\bnuts?\b|chia|leinsamen|kuerbiskern|sonnenblumenkern|sesam|oel\b|margarine|tahin|nussmus/.test(t)) return "nuesse";
  if (/vegan|veggie|vegetarisch|fleischersatz|tofu|tempeh|seitan|soja|soy/.test(t)) return "huelsen";
  if (/\bei\b|\beier\b|ruehrei|spiegelei|omelett|\beggs?\b/.test(t)) return "ei";
  if (/rind|steak|hackfleisch|schwein|wurst|wuerst|salami|schinken|huhn|haehn|huehn|pute|lamm|speck|bacon|schnitzel|fleisch|\bmeats?\b|chicken|beef|pork/.test(t)) return "fleisch";
  if (/lachs|forelle|hering|thun|fisch|\bfish|garnele|makrele|sardine|seafood/.test(t)) return "fisch";
  if (/joghurt|yogurt|yoghurt|quark|skyr|milch|milk|kaese|cheese|feta|mozzarella|butter|sahne|dairy|dairies/.test(t)) return "milch";
  if (/linse|kicher|bohne|hummus|falafel|legume|lentil|\bbeans?\b|huelsenfr/.test(t)) return "huelsen";
  if (/schoko|chocolate|keks|kuchen|bonbon|gummi|\beis\b|eiscreme|zucker|sugar|riegel|chips|snack|suessigkeit|sweet|marmelade|honig|dessert|pudding/.test(t)) return "suess";
  if (/brot|broetchen|toast|\breis|rice|pasta|nudel|spaghetti|kartoffel|potato|hafer|quinoa|muesli|cereal|mehl|couscous|bulgur|hirse|getreide|bread/.test(t)) return "getreide";
  if (/apfel|banane|beere|orange|birne|traube|kiwi|mango|ananas|pfirsich|pflaume|kirsche|melone|obst|frucht|fruit/.test(t)) return "obst";
  if (/gemuese|salat|tomate|gurke|brokkoli|zucchini|paprika|spinat|karotte|moehre|kohl|pilz|champignon|zwiebel|kuerbis|vegetable|aubergine|spargel|avocado|mais|erbse/.test(t)) return "gemuese";
  return "sonst";
}

// Grobe Schätzung in kg CO₂e je kg, wenn kein hinterlegter Wert vorhanden ist.
function estimateCO2PerKg(name) {
  const t = normalizeSearchText(name);
  if (/hafermilch|haferdrink|\boat|sojadrink|sojamilch|soy-?milk|mandeldrink|mandelmilch|plant-based-milk|pflanzendrink|milk-substitute/.test(t)) return 0.9;
  if (/\brind|rinder|beef|steak|hackfleisch|kalb/.test(t)) return 60;
  if (/lamm|lamb/.test(t)) return 39.7;
  if (/schwein|pork|salami|schinken|wurst|wuerst|sausage|speck|bacon/.test(t)) return 12.3;
  if (/haehn|huhn|huehn|chicken|pute|turkey|gefluegel|poultry/.test(t)) return 9.9;
  if (/garnele|shrimp|prawn|crustacean/.test(t)) return 20;
  if (/lachs|salmon|thun|tuna/.test(t)) return 8;
  if (/fisch|\bfish|forelle|hering|seafood/.test(t)) return 5;
  if (/\bei\b|\beier\b|\beggs?\b/.test(t)) return 4.7;
  if (/erdnuss|peanut/.test(t)) return 3.23;
  if (/butter/.test(t) && !/buttermilch|nuss/.test(t)) return 12;
  if (/feta|mozzarella|frischkaese|cream-cheese/.test(t)) return 8;
  if (/kaese|cheese|parmesan|gouda|emmental/.test(t)) return 12;
  if (/sahne|\bcream|rahm/.test(t)) return 6;
  if (/joghurt|yogurt|yoghurt|quark|skyr|milch|milk|dairy|dairies/.test(t)) return 3.15;
  if (/schoko|chocolate|kakao|cocoa/.test(t)) return 20;
  if (/kaffee|coffee|espresso|cappuccino/.test(t)) return 0.6;
  if (/tofu|tempeh|soja|soy/.test(t)) return 3;
  if (/linse|lentil|kichererbse|chickpea|bohne|\bbeans?\b|hummus|legume|huelsenfr/.test(t)) return 1;
  if (/\breis|rice/.test(t)) return 2.5;
  if (/hafer/.test(t)) return 2.48;
  if (/brot|bread|pasta|nudel|noodle|mehl|flour|cereal|muesli|getreide|keks|biscuit|kuchen|cake|gebaeck/.test(t)) return 1.6;
  if (/kartoffel|potato|karotte|carrot/.test(t)) return 0.45;
  if (/\bnuss|nuesse|\bnuts?\b|mandel|almond|cashew|pistaz|kern|samen|seed/.test(t)) return 1.5;
  if (/oel\b|\boils?\b/.test(t)) return 4;
  if (/gemuese|vegetable|salat|salad|tomate|gurke|paprika|spinat|brokkoli|zucchini|pilz|mushroom/.test(t)) return 0.7;
  if (/obst|frucht|fruit|apfel|apple|banane|beere|berry|orange|saft|juice/.test(t)) return 0.9;
  if (/\bwein|wine|\bbier|beer/.test(t)) return 1.5;
  if (/wasser|water|\btee\b|\btea\b|getraenk|beverage|drink|limo|cola/.test(t)) return 0.4;
  return 2.5;
}

function inferGrams(unit) {
  const text = String(unit || "");
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  if (match) return parseFloat(match[1].replace(",", "."));
  const liter = text.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (liter) return parseFloat(liter[1].replace(",", ".")) * 1000;
  if (/stück/i.test(text)) return 100;
  if (/tasse/i.test(text)) return 200;
  if (/\bel\b/i.test(text)) return 10;
  return 100;
}

// ---------- Rechnen ----------
function scaleFood(food, grams) {
  const amount = Math.max(0, num(grams));
  const entry = {
    n: food.n,
    u: `${Math.round(amount)} ${food.liquid ? "ml" : "g"}`,
    k: food.k100 * amount / 100,
    p: food.p100 * amount / 100,
    c: food.co2 * amount,
    group: food.group,
    grams: amount,
    v: ENTRY_VERSION,
    src: food.src || "liste"
  };
  if (food.co2est) entry.est = 1;
  return entry;
}

function formatFoodValues(food, grams) {
  const scaled = scaleFood(food, grams);
  return `${Math.round(scaled.k)} kcal · ${scaled.p.toFixed(1)} g Protein · ${food.co2est ? "≈ " : ""}${Math.round(scaled.c)} g CO₂`;
}

// Bringt einen gespeicherten Eintrag in die aktuelle Form.
// Einträge vor Version 2 hatten Gruppen aus einer Namens-Schätzung (Eier landeten bei Gemüse)
// und CO₂ wurde bei jedem Laden neu berechnet. Regel für diese Alt-Einträge:
//  - Gruppe: aus dem hinterlegten Lebensmittel, sonst neu geschätzt.
//  - CO₂: Listen-, Foto- und Vorschlags-Einträge nach heutigem Wert; frei Eingetragenes bleibt wie gespeichert.
//  - kcal/Protein: nur bei gekochtem Ei und Bier korrigiert (dort war die Basismenge falsch).
function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const out = {...entry, n: String(entry.n || "Eintrag"), k: num(entry.k), p: num(entry.p), c: num(entry.c)};
  out.grams = num(entry.grams) || inferGrams(entry.u);
  if (num(entry.v) >= ENTRY_VERSION) {
    if (!out.group) out.group = "sonst";
    return out;
  }
  const free = /frei eingegeben/.test(String(entry.u || ""));
  const food = foodForEntryName(out.n);
  out.group = food ? food.group : inferGroup(out.n);
  if (food && !free) {
    out.c = food.co2 * out.grams;
    if (/^(Ei, gekocht|Bier$)/.test(food.n) && out.grams !== 100) {
      out.k = food.k100 * out.grams / 100;
      out.p = food.p100 * out.grams / 100;
    }
  }
  return out;
}

// ---------- Eintrags-Kennungen (für den Abgleich zwischen Geräten) ----------
// Jeder Eintrag bekommt eine feste Kennung „id“ und einen Zeitpunkt „t“.
// Alte Einträge ohne Kennung bekommen eine, die sich aus Tag, Position und Inhalt ergibt –
// so erhält derselbe alte Eintrag auf Mac und Handy dieselbe Kennung und wird nicht doppelt gezählt.
const TOMBSTONE_KEY = "mein-tag-deleted"; // Kennungen gelöschter Einträge: {id: Zeitpunkt}

function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function newEntryId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
}

function ensureEntryIds(storageKey, list) {
  return list.map((e, i) => {
    if (!e || typeof e !== "object" || e.id) return e;
    return {...e, id: "a" + hashText(`${storageKey}|${i}|${e.n}|${e.u}|${e.k}|${e.p}|${e.grams || ""}`), t: e.t || 0};
  });
}

function readTombstones() {
  const stored = readJson(TOMBSTONE_KEY, {});
  return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

function rememberDeleted(entry) {
  if (!entry || !entry.id) return;
  const tombs = readTombstones();
  tombs[entry.id] = Date.now();
  writeStoredValue(TOMBSTONE_KEY, JSON.stringify(tombs));
}

function readDayEntries(d) {
  const key = dateKey(d);
  const raw = readJson(key, []);
  return Array.isArray(raw) ? ensureEntryIds(key, raw).map(normalizeEntry).filter(Boolean) : [];
}

async function loadDay(d) { return readDayEntries(d); }

async function saveDay(d, list) {
  const now = Date.now();
  list.forEach(e => { // direkt am Eintrag setzen, damit ein späteres Löschen die Kennung kennt
    if (!e.id) e.id = newEntryId();
    if (e.t === undefined) e.t = now;
    e.v = ENTRY_VERSION;
  });
  writeStoredValue(dateKey(d), JSON.stringify(list));
}

// Wird vom Abgleich aufgerufen, wenn neue Daten von einem anderen Gerät angekommen sind.
async function reloadFromStorage() {
  await loadState();
  renderAll();
}

async function loadSettings() { return {...DEFAULT_TARGETS, ...readJson(SETTINGS_KEY, {})}; }
async function saveSettings(s) { writeStoredValue(SETTINGS_KEY, JSON.stringify(s)); }
async function loadProfile() {
  const stored = readJson(PROFILE_KEY, {});
  const merged = {...DEFAULT_PROFILE, ...stored};
  if (!Array.isArray(merged.avoid)) merged.avoid = [];
  return merged;
}
async function saveProfile(p) { writeStoredValue(PROFILE_KEY, JSON.stringify(p)); }
async function loadPrefs() {
  const stored = readJson(PREFS_KEY, null);
  return Array.isArray(stored) ? stored : [...DEFAULT_PREFS];
}
async function savePrefs(list) { writeStoredValue(PREFS_KEY, JSON.stringify(list)); }

// ---------- Eigene / gemerkte Lebensmittel ----------
function makeCustomFood(obj) {
  const recipe = obj.src === "rezept" && Array.isArray(obj.zutaten);
  const group = recipe ? "gericht" : (ALL_GROUPS.some(g => g.id === obj.group) ? obj.group : "sonst");
  const liquid = group === "getraenk";
  const grams = Math.max(1, Math.round(num(obj.g) || 100));
  const unit = liquid ? "ml" : "g";
  const portions = recipe
    ? [{g: grams, label: `1 Portion (${grams} g)`, short: "1 Portion"}]
    : [{g: grams, label: `${grams} ${unit}`, short: `${grams} ${unit}`}];
  if (grams !== 100) portions.push({g: 100, label: `100 ${unit}`, short: `100 ${unit}`});
  return prepareFood({
    n: String(obj.n), group, k100: num(obj.k100), p100: num(obj.p100), co2: num(obj.co2),
    co2est: !!obj.co2est, flags: String(obj.flags || ""), liquid, portions,
    g: grams, u: portions[0].label, alt: "", saved: true,
    tags: recipe ? obj.zutaten.map(z => z.n).join(" ") : "",
    src: recipe ? "rezept" : (obj.src === "online" ? "online" : "eigen"),
    zutaten: recipe ? obj.zutaten.map(z => ({n: String(z.n), g: num(z.g)})) : undefined,
    port: recipe ? Math.max(1, num(obj.port) || 1) : undefined
  });
}

function loadCustomFoods() {
  const stored = readJson(CUSTOM_KEY, []);
  customFoods = Array.isArray(stored) ? stored.filter(o => o && o.n).map(makeCustomFood) : [];
}

function persistCustomFoods() {
  // Eigene Gerichte immer behalten; gemerkte Einzel-Lebensmittel höchstens 300.
  const recipes = customFoods.filter(f => f.src === "rezept");
  const others = customFoods.filter(f => f.src !== "rezept").slice(0, 300);
  const plain = [...recipes, ...others].map(f => {
    const row = {
      n: f.n, group: f.group, k100: f.k100, p100: f.p100, co2: f.co2, co2est: f.co2est ? 1 : 0,
      flags: f.flags, g: f.g, src: f.src
    };
    if (f.src === "rezept") { row.zutaten = f.zutaten; row.port = f.port; }
    return row;
  });
  writeStoredValue(CUSTOM_KEY, JSON.stringify(plain));
}

function rememberFood(food) {
  if (FOOD_BY_NAME.has(food.nameNorm) || customFoods.some(f => f.nameNorm === food.nameNorm)) return;
  customFoods.unshift(makeCustomFood({
    n: food.n, group: food.group, k100: food.k100, p100: food.p100, co2: food.co2,
    co2est: food.co2est, flags: food.flags, g: food.g, src: food.src
  }));
  persistCustomFoods();
}

function forgetFood(food) {
  customFoods = customFoods.filter(f => f.nameNorm !== food.nameNorm);
  persistCustomFoods();
}

// ---------- Zustand ----------
let entries = [];
let targets = {...DEFAULT_TARGETS};
let profile = {...DEFAULT_PROFILE};
let prefs = [];
let selectedFood = null;
let foodSearchTimer = null;
let foodSearchRun = 0;
let activeCategory = "alle";
let currentList = [];
let freqMap = {};
let balanceShown = false;
let currentSuggestions = [];
let discoverOffset = 0;
let pendingImport = null;
// Die echte Textsuche braucht den eigenen Server (server.py). Auf GitHub Pages gibt es ihn nicht –
// dort sucht die App stattdessen über Kategorien und Marken (siehe requestOnlineProducts).
const STATIC_HOSTING = location.protocol === "file:" || /\.github\.io$/.test(location.hostname);
let proxyAvailable = !STATIC_HOSTING;
const onlineCache = new Map();

// ---------- Start ----------
async function init() {
  await loadState();
  setupListeners();
  renderAll();
}

async function loadState() {
  targets = await loadSettings();
  profile = await loadProfile();
  prefs = await loadPrefs();
  loadCustomFoods();
  entries = await loadDay(currentDate);
}

function renderAll() {
  document.getElementById("tKcalIn").value = targets.kcal;
  document.getElementById("tProtIn").value = targets.prot;
  document.getElementById("tCO2In").value = targets.co2;
  fillProfileForm();
  renderAvoidChips();
  renderPrefs();
  renderPhotoOptions();
  renderCategoryChips();
  updateDateLabel();
  render();
  renderFoodList(document.getElementById("search").value);
  renderBackupInfo();
  renderDishList();
}

async function refreshDay() {
  entries = await loadDay(currentDate);
  updateDateLabel();
  render();
}

function updateDateLabel() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cd = new Date(currentDate);
  cd.setHours(0, 0, 0, 0);
  const diff = Math.round((cd - today) / 86400000);
  const opts = {weekday: "long", day: "numeric", month: "long"};
  let label;
  if (diff === 0) label = "Heute";
  else if (diff === -1) label = "Gestern";
  else if (diff === 1) label = "Morgen";
  else label = currentDate.toLocaleDateString("de-DE", opts);
  document.getElementById("dateLabel").textContent = label;
  document.getElementById("todayLabel").textContent = currentDate.toLocaleDateString("de-DE", opts);
}

// ---------- Verlauf ----------
function getEntriesForLastDays(days) {
  const result = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(currentDate);
    d.setDate(currentDate.getDate() - offset);
    result.push({date: d, entries: readDayEntries(d)});
  }
  return result;
}

function buildFrequencyMap() {
  const map = {};
  getEntriesForLastDays(28).forEach(day => day.entries.forEach(e => {
    const name = baseEntryName(e.n);
    map[name] = (map[name] || 0) + 1;
  }));
  return map;
}

function weeklyTotals() {
  const totals = {};
  const start = startOfWeek(currentDate);
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    readDayEntries(d).forEach(e => {
      totals[e.group] = (totals[e.group] || 0) + e.grams;
    });
  }
  return totals;
}

// ---------- Anzeige des Tages ----------
function dayTotals() {
  return entries.reduce((sum, e) => ({k: sum.k + e.k, p: sum.p + e.p, c: sum.c + e.c}), {k: 0, p: 0, c: 0});
}

function render() {
  const total = dayTotals();
  freqMap = buildFrequencyMap();

  document.getElementById("vKcal").textContent = Math.round(total.k);
  document.getElementById("vProt").textContent = Math.round(total.p);
  document.getElementById("vCO2").textContent = Math.round(total.c);
  document.getElementById("tKcal").textContent = targets.kcal;
  document.getElementById("tProt").textContent = targets.prot;
  document.getElementById("tCO2").textContent = targets.co2;
  updateCalculatedPreview(calculateTargetsFromProfile(profile));
  renderTargetsNote();

  setRing("ringKcal", total.k / targets.kcal, false);
  setRing("ringProt", total.p / targets.prot, false);
  setRing("ringCO2", total.c / targets.co2, true); // CO₂: weniger ist besser

  const eDiv = document.getElementById("entries");
  if (entries.length === 0) {
    eDiv.className = "entries empty";
    eDiv.innerHTML = '<div class="e-empty">Noch nichts gegessen heute.</div>';
  } else {
    eDiv.className = "entries";
    eDiv.innerHTML = entries.map((e, i) => `
      <div class="entry">
        <div>
          <div class="e-name">${escapeHtml(e.n)}</div>
          <div class="e-meta">${escapeHtml(e.u || "")} · ${escapeHtml(groupLabel(e.group))}</div>
        </div>
        <div class="e-vals">
          <div class="e-val">${Math.round(e.k)}<span>kcal</span></div>
          <div class="e-val">${e.p.toFixed(1)}<span>g P</span></div>
          <div class="e-val" ${e.est ? 'title="CO₂ geschätzt"' : ""}>${e.est ? "≈" : ""}${Math.round(e.c)}<span>g CO₂</span></div>
          <button class="del" data-i="${i}" title="Löschen">×</button>
        </div>
      </div>`).join("");
  }

  document.getElementById("summary").textContent = makeSummary(total.k, total.p, total.c);
  renderBalanceRest(total.k, total.p, total.c);
  if (balanceShown) renderBalanceSuggestions();
  renderWeeklyPlan();
  renderLongTermAnalysis();
  renderDiscover();
}

function setRing(id, frac, inverse) {
  const C = 263.89; // Umfang bei Radius 42
  const ring = document.getElementById(id);
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  ring.setAttribute("stroke-dashoffset", C * (1 - f));
  const tooMuch = inverse ? frac > 1 : frac > 1.15;
  ring.style.stroke = tooMuch ? "var(--rose)" : ""; // leer = Farbe aus dem Stylesheet
}

function makeSummary(k, p, c) {
  if (entries.length === 0) return "Noch nichts hinzugefügt — fang gerne mit dem Frühstück an.";
  const parts = [];
  const kFrac = k / targets.kcal;
  if (kFrac < 0.5) parts.push("Du hast heute noch wenig gegessen.");
  else if (kFrac < 0.85) parts.push("Du bist auf einem guten Weg, hast aber noch Spielraum.");
  else if (kFrac <= 1.1) parts.push("Energie passt — schön ausgewogen heute.");
  else parts.push("Du bist heute über deinem Energieziel.");
  const pFrac = p / targets.prot;
  if (pFrac < 0.7 && kFrac > 0.5) parts.push("Etwas mehr Protein wäre gut — die Vorschläge unten helfen beim Ausgleich.");
  else if (pFrac >= 0.85) parts.push("Protein ist gedeckt.");
  const cFrac = c / targets.co2;
  if (cFrac > 1) {
    const top = [...entries].sort((a, b) => b.c - a.c)[0];
    parts.push(`Erde-Bilanz ist heute hoch — größter Posten: ${baseEntryName(top.n)} (${Math.round(top.c)} g CO₂).`);
  } else if (cFrac < 0.5 && entries.length > 2) parts.push("Sehr leichter Tag für die Erde. ✿");
  const weekly = weeklyTotals();
  const highGroup = FOOD_GROUPS.find(g => ["fleisch", "milch"].includes(g.id) && weekly[g.id] > weeklyTargetFor(g) * 1.15);
  if (highGroup) parts.push(`${highGroup.label} ist diese Woche schon viel vertreten — morgen vielleicht mehr Gemüse oder Hülsenfrüchte.`);
  return parts.join(" ");
}

function renderBalanceRest(k, p, c) {
  const rest = document.getElementById("balanceRest");
  if (!rest) return;
  const kcalLeft = Math.max(0, Math.round(targets.kcal - k));
  const protLeft = Math.max(0, Math.round(targets.prot - p));
  const co2Left = Math.round(targets.co2 - c);
  const co2Text = co2Left >= 0 ? `${co2Left} g CO₂ frei` : `${Math.abs(co2Left)} g CO₂ über Ziel`;
  rest.textContent = `Heute offen: ${kcalLeft} kcal, ${protLeft} g Protein, ${co2Text}.`;
}

function renderTargetsNote() {
  const note = document.getElementById("targetsNote");
  if (!note) return;
  note.textContent = `Aktuell gelten ${targets.kcal} kcal, ${targets.prot} g Protein und ${targets.co2} g CO₂ pro Tag. ` +
    "Du kannst die Werte hier von Hand ändern oder oben aus deinen Körperdaten berechnen lassen. Das CO₂-Budget ist ein selbst gewählter Rahmen, kein amtlicher Grenzwert.";
}

// ---------- Profil, Vorlieben, Allergien ----------
function fillProfileForm() {
  document.getElementById("ageIn").value = profile.age;
  document.getElementById("weightIn").value = profile.weight;
  document.getElementById("heightIn").value = profile.height;
  document.getElementById("activityIn").value = String(profile.activity);
  document.getElementById("proteinFactorIn").value = String(profile.proteinFactor);
  document.getElementById("planetModeIn").value = String(profile.planetMode);
  document.getElementById("sexIn").value = profile.sex === "m" ? "m" : "w";
  document.getElementById("dietIn").value = profile.diet || "alles";
  document.getElementById("healthNoteIn").value = profile.healthNote || "";
  updateCalculatedPreview(calculateTargetsFromProfile(profile));
}

function readProfileForm() {
  return {
    age: parseInt(document.getElementById("ageIn").value) || DEFAULT_PROFILE.age,
    weight: parseFloat(document.getElementById("weightIn").value) || DEFAULT_PROFILE.weight,
    height: parseFloat(document.getElementById("heightIn").value) || DEFAULT_PROFILE.height,
    activity: parseFloat(document.getElementById("activityIn").value) || DEFAULT_PROFILE.activity,
    proteinFactor: parseFloat(document.getElementById("proteinFactorIn").value) || DEFAULT_PROFILE.proteinFactor,
    planetMode: parseInt(document.getElementById("planetModeIn").value) || DEFAULT_PROFILE.planetMode,
    sex: document.getElementById("sexIn").value === "m" ? "m" : "w",
    diet: document.getElementById("dietIn").value || "alles",
    avoid: Array.isArray(profile.avoid) ? profile.avoid : [],
    healthNote: document.getElementById("healthNoteIn").value.trim()
  };
}

// Grundumsatz nach Mifflin-St Jeor, mal Aktivität.
function calculateTargetsFromProfile(p) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "m" ? 5 : -161);
  return {
    kcal: Math.max(1300, Math.round((bmr * p.activity) / 50) * 50),
    prot: Math.max(35, Math.round(p.weight * p.proteinFactor)),
    co2: p.planetMode
  };
}

function updateCalculatedPreview(nextTargets) {
  document.getElementById("calcKcal").textContent = nextTargets.kcal;
  document.getElementById("calcProt").textContent = nextTargets.prot;
  document.getElementById("calcCO2").textContent = nextTargets.co2;
}

function explainProfileCalculation(p, nextTargets) {
  const note = [];
  note.push(`Berechnet aus ${p.weight} kg, ${p.height} cm, ${p.age} Jahren und Aktivität.`);
  note.push(`Protein: ${p.proteinFactor.toString().replace(".", ",")} g pro kg Körpergewicht.`);
  if (p.healthNote) note.push("Gesundheitliche Notizen werden gespeichert, aber nicht automatisch ausgewertet.");
  note.push(`Gespeichert: ${nextTargets.kcal} kcal, ${nextTargets.prot} g Protein, ${nextTargets.co2} g CO₂ pro Tag.`);
  return note.join(" ");
}

function renderAvoidChips() {
  const grid = document.getElementById("avoidGrid");
  if (!grid) return;
  grid.innerHTML = ALLERGENS.map(a => `
    <button type="button" class="pref-chip avoid ${profile.avoid.includes(a.id) ? "active" : ""}" data-avoid="${a.id}">${escapeHtml(a.label)}</button>`).join("");
}

function renderPrefs() {
  const grid = document.getElementById("prefGrid");
  grid.innerHTML = FOOD_GROUPS.map(g => `
    <button type="button" class="pref-chip ${prefs.includes(g.id) ? "active" : ""}" data-group="${g.id}">${escapeHtml(g.label)}</button>`).join("");
}

// Gründe, warum ein Lebensmittel nicht zu Allergien oder Ernährungsweise passt (leer = passt).
function foodConflicts(food) {
  const reasons = [];
  const flags = food.flags || "";
  (profile.avoid || []).forEach(id => {
    const allergen = ALLERGENS.find(a => a.id === id);
    if (allergen && flags.includes(allergen.flag)) reasons.push(allergen.label);
  });
  const meat = food.group === "fleisch" || flags.includes("T");
  const fish = food.group === "fisch" || flags.includes("F") || flags.includes("K");
  const animal = meat || fish || /[MEH]/.test(flags) || food.group === "milch" || food.group === "ei";
  if (profile.diet === "vegan" && animal) reasons.push("nicht vegan");
  else if (profile.diet === "vegetarisch" && (meat || fish)) reasons.push("nicht vegetarisch");
  else if (profile.diet === "pescetarisch" && meat) reasons.push("enthält Fleisch");
  return reasons;
}

function conflictText(reasons) {
  const allergens = reasons.filter(r => !/^(nicht|enthält)/.test(r));
  const diet = reasons.filter(r => /^(nicht|enthält)/.test(r));
  const parts = [];
  if (allergens.length) parts.push(`enthält ${allergens.join(", ")}`);
  parts.push(...diet);
  return parts.join(" · ");
}

// ---------- Wochenration ----------
function weeklyTargetFor(group) {
  let amount = group.base;
  const energyScale = Math.min(1.4, Math.max(0.75, targets.kcal / 1800));
  const proteinScale = Math.min(1.45, Math.max(0.75, targets.prot / 60));
  if (["getreide", "obst", "nuesse"].includes(group.id)) amount *= energyScale;
  if (group.id === "gemuese") amount *= Math.min(1.2, Math.max(0.85, energyScale));
  if (["huelsen", "milch", "fisch", "fleisch", "ei"].includes(group.id)) amount *= proteinScale;
  if (prefs.includes(group.id)) amount *= 1.18;
  if (!prefs.includes(group.id) && ["fleisch", "milch", "fisch", "ei"].includes(group.id)) amount *= 0.7;
  if (group.id === "fleisch" && targets.co2 <= 1800) amount *= 0.55;
  if (group.id === "milch" && targets.co2 <= 1800) amount *= 0.75;
  if (group.id === "huelsen" && !prefs.includes("fleisch")) amount *= 1.25;
  return Math.round(amount / 10) * 10;
}

function groupAllowed(groupId) {
  if (profile.diet === "vegan") return !["fleisch", "fisch", "milch", "ei"].includes(groupId);
  if (profile.diet === "vegetarisch") return !["fleisch", "fisch"].includes(groupId);
  if (profile.diet === "pescetarisch") return groupId !== "fleisch";
  return true;
}

function renderWeeklyPlan() {
  const plan = document.getElementById("weeklyPlan");
  if (!plan) return;
  const totals = weeklyTotals();
  plan.innerHTML = FOOD_GROUPS.map(g => {
    const eaten = totals[g.id] || 0;
    if (!groupAllowed(g.id)) {
      return `
      <div class="ration-card ${eaten > 0 ? "high" : ""}">
        <div class="r-top"><div class="r-name">${escapeHtml(g.label)}</div><div class="r-amount">–</div></div>
        <div class="bar"><span style="width:${eaten > 0 ? 100 : 0}%"></span></div>
        <div class="r-note">${Math.round(eaten)} g diese Woche · passt nicht zu deiner Ernährungsweise</div>
      </div>`;
    }
    const target = weeklyTargetFor(g);
    const pct = Math.min(100, Math.round((eaten / target) * 100));
    const high = eaten > target * 1.15;
    return `
      <div class="ration-card ${high ? "high" : ""}">
        <div class="r-top">
          <div class="r-name">${escapeHtml(g.label)}</div>
          <div class="r-amount">${target} g</div>
        </div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div class="r-note">${Math.round(eaten)} g diese Woche · ca. ${Math.round(target / 7)} g/Tag · ${escapeHtml(g.note)}</div>
      </div>`;
  }).join("");
}

// ---------- Auswertung der letzten Wochen (feste Regeln, keine KI) ----------
function renderLongTermAnalysis() {
  const grid = document.getElementById("analysisGrid");
  const range = document.getElementById("analysisRange");
  if (!grid || !range) return;
  const analysis = buildNutritionAnalysis(28);
  range.textContent = analysis.rangeText;
  grid.innerHTML = analysis.cards.map(card => `
    <div class="analysis-card ${card.tone || ""}">
      <strong>${escapeHtml(card.title)}</strong>
      <p>${escapeHtml(card.text)}</p>
      ${card.ideas && card.ideas.length ? `<div class="idea-list">${card.ideas.map(i => `<span>${escapeHtml(i)}</span>`).join("")}</div>` : ""}
    </div>`).join("");
}

// Lässt nur Ideen stehen, die zu Allergien und Ernährungsweise passen.
function allowedIdeas(ideas) {
  return ideas.filter(idea => {
    const target = idea.includes("→") ? idea.split("→")[1] : idea;
    const food = bestLocalMatch(target.trim());
    return !food || foodConflicts(food).length === 0;
  });
}

function nutrientSignalsFor(name) {
  const lower = normalizeSearchText(name);
  const signals = [];
  if (/spinat|brokkoli|salat|zucchini|gurke|kohl|rucola|erbse|gruene bohnen/.test(lower)) signals.push("greens");
  if (/karotte|suesskartoffel|paprika|tomate|kuerbis|rote bete/.test(lower)) signals.push("orange");
  if (/apfel|banane|beere|orange|birne|traube|kiwi|mango|pfirsich|pflaume|kirsche|melone|obst/.test(lower)) signals.push("fruit");
  if (/linse|kicher|bohne|tofu|hummus|tempeh|falafel|chili sin/.test(lower)) signals.push("legumes");
  if (/mandel|walnuss|walnuesse|nuss|nuesse|cashew|pistaz|kerne|samen/.test(lower)) signals.push("nuts");
  if (/lachs|forelle|hering|thun|fisch|makrele|sardine/.test(lower)) signals.push("fish");
  if (/joghurt|quark|skyr|milch|kaese|feta|mozzarella/.test(lower)) signals.push("dairy");
  if (/rind|steak|hack|lamm|burger \(rind\)|bolognese \(rind\)/.test(lower)) signals.push("redMeat");
  return signals;
}

function buildNutritionAnalysis(days) {
  const history = getEntriesForLastDays(days);
  const activeDays = history.filter(day => day.entries.length > 0);
  if (activeDays.length < 3) {
    return {
      rangeText: `${activeDays.length} gespeicherte Tage in den letzten ${days} Tagen.`,
      cards: [
        {
          title: "Noch zu wenig Verlauf",
          text: "Für echte Muster braucht die App ein paar Tage mehr. Ab etwa 7 gespeicherten Tagen werden Vorschläge deutlich sinnvoller; nach 2 bis 4 Wochen erkennt man Gewohnheiten.",
          ideas: ["3 Tage eintragen", "Lieblingsessen merken", "Neues entdecken"]
        },
        {
          title: "Was später ausgewertet wird",
          text: "Die App schaut auf Energie, Protein, CO₂, Lebensmittelgruppen und Vielfalt. Daraus entstehen Vorschläge wie: mehr Hülsenfrüchte, Käse reduzieren, mehr grünes Gemüse oder Beeren ergänzen.",
          ideas: ["Vielfalt", "Bedarf", "CO₂-Treiber"]
        }
      ]
    };
  }

  const totals = {k: 0, p: 0, c: 0};
  const groups = {};
  const names = {};
  const co2ByName = {};
  const nutrientSignals = {greens: 0, orange: 0, fruit: 0, legumes: 0, nuts: 0, fish: 0, dairy: 0, redMeat: 0};
  activeDays.forEach(day => day.entries.forEach(e => {
    const name = baseEntryName(e.n);
    totals.k += e.k;
    totals.p += e.p;
    totals.c += e.c;
    groups[e.group] = (groups[e.group] || 0) + e.grams;
    names[name] = (names[name] || 0) + 1;
    co2ByName[name] = (co2ByName[name] || 0) + e.c;
    nutrientSignalsFor(name).forEach(signal => nutrientSignals[signal]++);
  }));

  const avgK = totals.k / activeDays.length;
  const avgP = totals.p / activeDays.length;
  const avgC = totals.c / activeDays.length;
  const topGroup = Object.entries(groups).sort((a, b) => b[1] - a[1])[0];
  const topFoods = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
  const topDrivers = Object.entries(co2ByName).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const distinct = Object.keys(names).length;
  const cards = [];

  cards.push({
    title: "Dein Muster",
    text: `In ${activeDays.length} gespeicherten Tagen liegst du im Schnitt bei ${Math.round(avgK)} kcal, ${Math.round(avgP)} g Protein und ${Math.round(avgC)} g CO₂ pro Tag. Am stärksten vertreten ist ${groupLabel(topGroup ? topGroup[0] : "gemuese")}; insgesamt waren es ${distinct} verschiedene Lebensmittel.`,
    ideas: topFoods.length ? topFoods : ["mehr Tage sammeln"],
    tone: avgC <= targets.co2 && avgP >= targets.prot * 0.8 ? "good" : ""
  });

  if (avgP < targets.prot * 0.8) {
    cards.push({
      title: "Protein sanft auffüllen",
      text: "Dein Durchschnitt liegt noch unter deinem Proteinrahmen. Klimafreundlich lässt sich das vor allem mit Hülsenfrüchten und Sojaprodukten lösen.",
      ideas: allowedIdeas(["Linsen", "Kichererbsen", "Tofu", "Skyr", "Tempeh"]).slice(0, 4),
      tone: "warning"
    });
  } else {
    cards.push({
      title: "Protein ist nah am Ziel",
      text: "Deine Proteinversorgung wirkt im Verlauf solide. Jetzt lohnt sich eher die Frage, aus welchen Quellen sie kommt und ob genug Pflanzenvielfalt dabei ist.",
      ideas: allowedIdeas(["Bohnen", "Haferflocken", "Nussmischung", "Naturjoghurt"]),
      tone: "good"
    });
  }

  const vitaminIdeas = [];
  if (nutrientSignals.greens < activeDays.length * 0.45) vitaminIdeas.push("Spinat", "Brokkoli");
  if (nutrientSignals.orange < activeDays.length * 0.35) vitaminIdeas.push("Karotten", "Süßkartoffel");
  if (nutrientSignals.fruit < activeDays.length * 0.6) vitaminIdeas.push("Beeren", "Orange");
  if (nutrientSignals.nuts < activeDays.length * 0.35) vitaminIdeas.push("Walnüsse", "Leinsamen");
  const safeVitaminIdeas = allowedIdeas([...new Set(vitaminIdeas)]).slice(0, 5);
  cards.push({
    title: "Vielfalt & Farben",
    text: safeVitaminIdeas.length
      ? "Dein Verlauf wirkt noch etwas schmal. Ein einfacher Hebel ist Farbe: grün, orange/rot, Obst und kleine Mengen Nüsse oder Samen über die Woche verteilen. Vitamine rechnet die App nicht einzeln aus."
      : "Deine Lebensmittelauswahl zeigt schon mehrere gute Vielfalt-Signale. Halte den Farbenmix über die Woche bei.",
    ideas: safeVitaminIdeas.length ? safeVitaminIdeas : ["grün", "orange", "rot", "Samen"],
    tone: safeVitaminIdeas.length ? "warning" : "good"
  });

  if (avgC > targets.co2 || nutrientSignals.redMeat > 0) {
    const swapIdeas = topDrivers
      .map(([name]) => {
        const food = foodByName(name);
        const alt = food ? alternativesFor(food)[0] : null;
        return alt ? `${name} → ${alt.n}` : null;
      })
      .filter(Boolean);
    cards.push({
      title: "CO₂-Treiber austauschen",
      text: `Am meisten CO₂ kam in diesem Zeitraum von: ${topDrivers.map(([name, c]) => `${name} (${Math.round(c)} g)`).join(", ")}. Du musst nichts streichen — kleine Austauschschritte reichen.`,
      ideas: swapIdeas.length ? swapIdeas : allowedIdeas(["Rind → Linsen", "Käse → Hummus", "Butter → Olivenöl"]),
      tone: "warning"
    });
  } else {
    cards.push({
      title: "Planet-Budget stabil",
      text: "Dein durchschnittlicher CO₂-Wert bleibt im gewählten Budget. Für mehr Abwechslung kannst du jetzt vor allem Gemüse, Hülsenfrüchte und Vollkorn variieren.",
      ideas: allowedIdeas(["Brokkoli", "Bohnen", "Vollkornbrot", "Quinoa"]),
      tone: "good"
    });
  }

  cards.push({
    title: "Nächste Ration-Idee",
    text: "Zwei bis drei kleine Ergänzungen, die zu deinem Muster passen — statt eines komplett neuen Plans.",
    ideas: nextRationIdeas(groups, nutrientSignals),
    tone: ""
  });

  return {rangeText: `${activeDays.length} gespeicherte Tage in den letzten ${days} Tagen ausgewertet.`, cards};
}

function nextRationIdeas(groups, signals) {
  const groupById = id => FOOD_GROUPS.find(g => g.id === id);
  const ideas = [];
  if ((groups.huelsen || 0) < weeklyTargetFor(groupById("huelsen")) * 0.5) ideas.push("2 Linsen-Mahlzeiten");
  if (signals.greens < 3) ideas.push("3 Portionen grünes Gemüse");
  if (signals.fruit < 4) ideas.push("Beeren oder Orange");
  if (signals.nuts < 2 && !profile.avoid.includes("nuss")) ideas.push("kleine Nuss-Portionen");
  if ((groups.fleisch || 0) > weeklyTargetFor(groupById("fleisch"))) ideas.push("1 Fleischgericht tauschen");
  return ideas.length ? ideas.slice(0, 4) : ["Gemüse variieren", "Hülsenfrüchte halten", "Vollkorn ergänzen"];
}

// ---------- Suche ----------
function searchTermsOf(query) {
  const terms = normalizeSearchText(query).split(/[^a-z0-9%]+/).filter(Boolean);
  const important = terms.filter(t => !["mit", "und", "oder", "in", "auf"].includes(t));
  return important.length ? important : terms;
}

function termMatches(hay, term) {
  // Kurze Wörter nur am Wortanfang: "ei" soll Eier finden, aber nicht "Reis" oder "Weiße Bohnen".
  if (term.length <= 3) return new RegExp(`(^|[^a-z0-9])${term.replace(/[^a-z0-9]/g, "")}`).test(hay);
  if (hay.includes(term)) return true;
  if (term.length < 5) return false;
  // einfache Mehrzahl-/Endungs-Toleranz: "tomaten" findet "tomate", "kartoffeln" findet "kartoffel"
  const stem = term.replace(/(en|n|e|s)$/, "");
  if (hay.includes(stem)) return true;
  // zusammengeschriebene Wörter: "bananenbluetencurry" findet "Bananenblüten-Curry"
  const compact = hay.replace(/[\s\-,()/]+/g, "");
  return compact.includes(term) || compact.includes(stem);
}

function searchScore(food, queryNorm, terms) {
  if (!terms.every(term => termMatches(food.hay, term))) return 0;
  let score = 20;
  if (food.nameNorm === queryNorm) score = 100;
  else if (food.nameNorm.startsWith(queryNorm)) score = 80;
  else if (food.nameNorm.split(/[^a-z0-9]+/).some(word => word.startsWith(terms[0]))) score = 60;
  else if (terms.every(term => termMatches(food.nameNorm, term))) score = 40;
  score += Math.min(10, (freqMap[food.n] || 0) * 2);
  if (food.saved) score += 5;
  return score;
}

function rankFoods(list, query) {
  const queryNorm = normalizeFoodName(query);
  const terms = searchTermsOf(query);
  if (!terms.length) return [];
  return list
    .map((food, index) => ({food, index, score: searchScore(food, queryNorm, terms)}))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.food);
}

function bestLocalMatch(text) {
  const pool = [...customFoods, ...FOODS];
  const ranked = rankFoods(pool, text);
  if (ranked.length) return ranked[0];
  // Bei längeren Beschreibungen („veganer Proteinshake mit Kollagen und Kreatin“) gewinnt das
  // Lebensmittel, das die meisten Wörter enthält; bei Gleichstand zählt ein Treffer im Namen mehr.
  const terms = searchTermsOf(text).filter(t => t.length >= 4);
  if (terms.length) {
    let best = null;
    let bestScore = 0;
    pool.forEach(food => {
      // Lange, genaue Wörter („linsensuppe“) zählen mehr als kurze, allgemeine („brot“).
      const matched = terms.filter(t => termMatches(food.hay, t));
      if (!matched.length) return;
      const inName = terms.filter(t => termMatches(food.nameNorm, t)).length;
      const score = matched.reduce((sum, t) => sum + t.length, 0) * 10 + inName;
      if (score > bestScore) { best = food; bestScore = score; }
    });
    if (best) return best;
  }
  const q = normalizeFoodName(text);
  return pool.find(f => {
    const first = f.nameNorm.split(/[ ,(]/)[0];
    return first.length >= 4 && q.includes(first);
  }) || null;
}

function categoryMatches(food) {
  if (activeCategory === "alle") return true;
  if (activeCategory === "meine") return !!food.saved;
  return food.group === activeCategory;
}

function renderCategoryChips() {
  const row = document.getElementById("catChips");
  if (!row) return;
  const cats = [{id: "alle", label: "Alle"}];
  if (customFoods.length) cats.push({id: "meine", label: "Meine"});
  cats.push(...[...OTHER_GROUPS.slice(0, 1), ...FOOD_GROUPS, ...OTHER_GROUPS.slice(1)]);
  if (!cats.some(c => c.id === activeCategory)) activeCategory = "alle";
  row.innerHTML = cats.map(c => `
    <button type="button" class="pref-chip ${c.id === activeCategory ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.label)}</button>`).join("");
}

function renderFoodList(query) {
  const q = String(query || "").trim();
  const localPool = [...customFoods, ...FOODS].filter(categoryMatches);
  let list;
  let frequentCount = 0;
  if (q) {
    let local = rankFoods(localPool, q);
    // Nichts in der gewählten Kategorie? Dann in allen Bereichen suchen – sonst wirkt es, als fehle das Lebensmittel.
    let widened = false;
    if (!local.length && activeCategory !== "alle") {
      local = rankFoods([...customFoods, ...FOODS], q);
      widened = local.length > 0;
    }
    const seen = new Set(local.map(f => f.nameNorm));
    const online = onlineFoods.filter(f => {
      if (seen.has(f.nameNorm) || (!widened && !categoryMatches(f))) return false;
      seen.add(f.nameNorm);
      return true;
    });
    list = [...local, ...online];
  } else {
    const frequent = localPool
      .filter(f => freqMap[f.n])
      .sort((a, b) => freqMap[b.n] - freqMap[a.n])
      .slice(0, 6);
    frequentCount = frequent.length;
    const rest = localPool.filter(f => !frequent.includes(f));
    list = [...frequent, ...rest];
  }
  currentList = list.slice(0, 80);
  const div = document.getElementById("foodList");
  if (!currentList.length) {
    div.innerHTML = '<div class="food-item none"><div><div class="name">Noch kein Treffer</div><div class="meta">Versuche einen anderen Begriff, wähle „Alle“ oder nutze „Frei eintragen“.</div></div></div>';
    return;
  }
  div.innerHTML = currentList.map((f, i) => {
    const conflicts = foodConflicts(f);
    const badges = [];
    if (!q && i < frequentCount) badges.push('<span class="food-source">oft</span>');
    if (f.src === "online") badges.push(`<span class="food-source">${f.saved ? "gemerkt" : "online"}</span>`);
    if (f.src === "eigen") badges.push('<span class="food-source">eigen</span>');
    if (f.src === "rezept") badges.push('<span class="food-source">mein Gericht</span>');
    return `
    <div class="food-item" data-i="${i}">
      <div>
        <div class="name">${escapeHtml(f.n)}${badges.join("")}</div>
        <div class="meta">${escapeHtml(f.u)} · ${Math.round(f.k100 * f.g / 100)} kcal · ${(f.p100 * f.g / 100).toFixed(1)} g P · ${f.co2est ? "≈ " : ""}${Math.round(f.co2 * f.g)} g CO₂</div>
        ${conflicts.length ? `<div class="meta warn">${escapeHtml(conflictText(conflicts))}</div>` : ""}
      </div>
      <div class="add">+</div>
    </div>`;
  }).join("");
}

function defaultFoodStatus() {
  const total = FOODS.length + customFoods.length;
  return `${total} Lebensmittel und Gerichte sind sofort verfügbar. Ab 3 Buchstaben suche ich zusätzlich online bei Open Food Facts.`;
}

function handleFoodSearch(value) {
  const query = value.trim();
  foodSearchRun += 1;
  const runId = foodSearchRun;
  onlineFoods = [];
  renderFoodList(query);
  const status = document.getElementById("foodStatus");
  clearTimeout(foodSearchTimer);
  if (query.length < 3) {
    status.textContent = defaultFoodStatus();
    return;
  }
  status.textContent = "Treffer aus der eigenen Liste werden angezeigt. Online-Suche läuft …";
  // Ohne eigenen Server etwas länger warten: Open Food Facts begrenzt die Zahl der Suchanfragen pro Minute.
  foodSearchTimer = setTimeout(() => fetchOnlineFoods(query, runId), STATIC_HOSTING ? 800 : 500);
}

// ---------- Online-Suche (Open Food Facts) ----------
const OFF_FIELDS = "product_name,product_name_de,brands,nutriments,categories_tags,allergens_tags,serving_quantity,ecoscore_data";
const OFF_ALLERGENS = {
  "en:gluten": "G", "en:milk": "M", "en:eggs": "E", "en:nuts": "N", "en:peanuts": "P", "en:soybeans": "S",
  "en:fish": "F", "en:crustaceans": "K", "en:molluscs": "K", "en:sesame-seeds": "X"
};

function offProductToFood(product) {
  const nutriments = product.nutriments || {};
  const name = String(product.product_name_de || product.product_name || "").trim();
  const kcal = Number(nutriments["energy-kcal_100g"]);
  if (!name || !Number.isFinite(kcal)) return null;
  const brand = Array.isArray(product.brands) ? product.brands[0] : String(product.brands || "").split(",")[0];
  const cats = (product.categories_tags || []).join(" ");
  const text = `${name} ${cats}`;
  const group = inferGroup(text);
  const known = Number((((product.ecoscore_data || {}).agribalyse) || {}).co2_total);
  const hasCo2 = Number.isFinite(known) && known > 0;
  let flags = (product.allergens_tags || []).map(tag => OFF_ALLERGENS[tag] || "").join("");
  if (group === "milch" && !flags.includes("M")) flags += "M";
  if (group === "ei" && !flags.includes("E")) flags += "E";
  if (group === "fisch" && !/[FK]/.test(flags)) flags += "F";
  if (group === "fleisch") flags += "T";
  const serving = Number(product.serving_quantity);
  const grams = Number.isFinite(serving) && serving >= 5 && serving <= 1000 ? Math.round(serving) : 100;
  const food = makeCustomFood({
    n: brand && brand.trim() ? `${name} · ${brand.trim()}` : name,
    group, k100: kcal, p100: num(nutriments.proteins_100g),
    co2: hasCo2 ? known : estimateCO2PerKg(text), co2est: !hasCo2, flags, g: grams, src: "online"
  });
  food.saved = false;
  food.hay += ` ${normalizeSearchText(cats)}`;
  return food;
}

// Weg 1 (mit eigenem Server, z. B. lokal): echte Textsuche über /api/suche.
// Weg 2 (ohne Server, z. B. GitHub Pages): Open Food Facts erlaubt aus dem Browser nur
// Kategorie-Abfragen. Darum erst die passende Kategorie (oder Marke) zum Suchwort holen,
// dann die in Deutschland bekanntesten Produkte dieser Kategorie.
// Übertragen wird in beiden Fällen nur der Suchbegriff, nie das Tagebuch.
const OFF_BASE = "https://world.openfoodfacts.org";

async function offSuggestions(tagtype, query) {
  const url = `${OFF_BASE}/api/v3/taxonomy_suggestions?tagtype=${tagtype}&string=${encodeURIComponent(query)}&lc=de&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open Food Facts nicht erreichbar");
  return (await res.json()).suggestions || [];
}

async function offProductsBy(param, value) {
  const tag = String(value).toLowerCase().trim().replace(/\s+/g, "-");
  const url = `${OFF_BASE}/api/v2/search?${param}=${encodeURIComponent(tag)}&countries_tags_en=germany` +
    `&sort_by=unique_scans_n&page_size=15&fields=${OFF_FIELDS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open Food Facts nicht erreichbar");
  return (await res.json()).products || [];
}

async function requestOnlineProducts(query) {
  if (proxyAvailable) {
    try {
      const res = await fetch(`./api/suche?q=${encodeURIComponent(query)}`);
      if (res.status === 404 || res.status === 501) proxyAvailable = false; // einfacher Dateiserver ohne Suche
      else if (res.ok) return {products: (await res.json()).products || [], via: "text"};
    } catch (e) { /* unten über Kategorien versuchen */ }
  }
  const categories = await offSuggestions("categories", query);
  if (categories.length) {
    const products = await offProductsBy("categories_tags_de", categories[0]);
    if (products.length) return {products, via: "kategorie", label: categories[0]};
  }
  const brands = await offSuggestions("brands", query);
  if (brands.length) {
    const products = await offProductsBy("brands_tags", brands[0]);
    if (products.length) return {products, via: "marke", label: brands[0]};
  }
  return {products: [], via: "kategorie"};
}

// Suchergebnisse für die Dauer der Sitzung merken: spart Anfragen bei Open Food Facts
// (dort sind nur wenige Suchen pro Minute erlaubt) und macht Wiederholungen sofort sichtbar.
const ONLINE_CACHE_KEY = "pt-online-suche";

function slimOffProduct(p) {
  const n = p.nutriments || {};
  const co2 = ((p.ecoscore_data || {}).agribalyse || {}).co2_total;
  return {
    product_name: p.product_name, product_name_de: p.product_name_de, brands: p.brands,
    nutriments: {"energy-kcal_100g": n["energy-kcal_100g"], proteins_100g: n.proteins_100g},
    categories_tags: (p.categories_tags || []).slice(0, 12), allergens_tags: p.allergens_tags || [],
    serving_quantity: p.serving_quantity, ecoscore_data: {agribalyse: {co2_total: co2}}
  };
}

function readOnlineCache(key) {
  if (onlineCache.has(key)) return onlineCache.get(key);
  try {
    const stored = JSON.parse(sessionStorage.getItem(ONLINE_CACHE_KEY) || "{}");
    if (stored[key]) onlineCache.set(key, stored[key]);
    return stored[key] || null;
  } catch (e) { return null; }
}

function writeOnlineCache(key, result) {
  const slim = {...result, products: result.products.map(slimOffProduct)};
  onlineCache.set(key, slim);
  try {
    const stored = JSON.parse(sessionStorage.getItem(ONLINE_CACHE_KEY) || "{}");
    stored[key] = slim;
    const keys = Object.keys(stored);
    keys.slice(0, Math.max(0, keys.length - 30)).forEach(k => delete stored[k]); // höchstens 30 Suchen
    sessionStorage.setItem(ONLINE_CACHE_KEY, JSON.stringify(stored));
  } catch (e) { /* ohne Zwischenspeicher weiter */ }
  return slim;
}

async function fetchOnlineFoods(query, runId) {
  const status = document.getElementById("foodStatus");
  const key = normalizeFoodName(query);
  try {
    let result = readOnlineCache(key);
    if (!result) result = writeOnlineCache(key, await requestOnlineProducts(query));
    if (runId !== foodSearchRun) return;
    const terms = searchTermsOf(query).filter(t => t.length >= 3 && !["mit", "und", "der", "die", "das"].includes(t));
    onlineFoods = result.products
      .map(offProductToFood)
      .filter(Boolean)
      // Bei Kategorie- und Markentreffern passt das Produkt schon über die Kategorie,
      // auch wenn der Name anders lautet (z. B. „Creamy Yogurt Strawberry“ bei Erdbeerjoghurt).
      .filter(food => result.via !== "text" || !terms.length || terms.some(term => termMatches(food.hay, term)))
      .slice(0, 15);
    renderFoodList(query);
    const where = result.via === "kategorie" ? ` aus der Kategorie „${result.label}“`
      : result.via === "marke" ? ` der Marke „${result.label}“` : "";
    status.textContent = onlineFoods.length
      ? `${onlineFoods.length} Produkte${where} aus Open Food Facts ergänzt. „≈“ heißt: CO₂ ist geschätzt.`
      : "Keine passenden Online-Treffer. Versuche ein allgemeineres Wort (z. B. „Joghurt“) oder trage frei ein.";
  } catch (e) {
    if (runId !== foodSearchRun) return;
    onlineFoods = [];
    renderFoodList(query);
    status.textContent = "Online-Suche gerade nicht erreichbar oder überlastet – versuche es in einer Minute noch einmal. Die eigene Liste bleibt nutzbar.";
  }
}

// ---------- Auswahl, Portionen, Tauschideen ----------
function alternativesFor(food) {
  if (!food || !food.alt || food.co2 < 2) return [];
  const names = ALT_ROLES[food.alt] || food.alt.split("|");
  return names
    .map(name => foodByName(name))
    .filter(alt => alt && alt.n !== food.n && alt.co2 <= food.co2 * 0.7 && foodConflicts(alt).length === 0)
    .slice(0, 3);
}

function selectFood(food) {
  selectedFood = food;
  const unit = food.liquid ? "ml" : "g";
  document.getElementById("portionPanel").classList.add("active");
  document.getElementById("portionName").textContent = food.n;
  document.getElementById("portionGrams").value = food.g;
  document.getElementById("portionUnit").textContent = food.liquid ? "ml getrunken" : "Gramm gegessen";
  const conflicts = foodConflicts(food);
  const warn = document.getElementById("portionWarn");
  warn.textContent = conflicts.length ? `Achtung: ${conflictText(conflicts)}. Bitte prüfe im Zweifel die Packung.` : "";
  warn.style.display = conflicts.length ? "" : "none";

  const chips = food.portions.map(p => `<button type="button" class="pref-chip" data-grams="${p.g}">${escapeHtml(p.short)}</button>`);
  chips.push('<button type="button" class="pref-chip" data-factor="0.5">halbe Menge</button>');
  chips.push('<button type="button" class="pref-chip" data-factor="2">doppelte Menge</button>');
  document.getElementById("portionChips").innerHTML = chips.join("");

  const alts = alternativesFor(food);
  const altBox = document.getElementById("portionAlt");
  if (alts.length) {
    altBox.style.display = "";
    altBox.innerHTML = `
      <div class="alt-title">Leichter für die Erde — ${escapeHtml(food.n)} liegt bei ${Math.round(food.co2 * 100)} g CO₂ je 100 ${unit}:</div>
      ${alts.map(a => `
        <button type="button" class="alt-item" data-alt="${escapeHtml(a.n)}">
          <span class="alt-name">${escapeHtml(a.n)}</span>
          <span class="alt-meta">${Math.round(a.co2 * 100)} g CO₂ je 100 ${a.liquid ? "ml" : "g"} · ${a.p100.toFixed(0)} g Protein</span>
        </button>`).join("")}`;
  } else {
    altBox.style.display = "none";
    altBox.innerHTML = "";
  }
  document.getElementById("forgetFood").style.display = food.saved ? "" : "none";
  document.getElementById("portionRecipe").innerHTML = recipeHtml(food.n);
  updatePortionPreview();
}

function updatePortionPreview() {
  if (!selectedFood) return;
  const grams = parseFloat(document.getElementById("portionGrams").value) || selectedFood.g;
  const unit = selectedFood.liquid ? "ml" : "g";
  const source = selectedFood.src === "online"
    ? (selectedFood.co2est ? " · Nährwerte laut Open Food Facts, CO₂ geschätzt" : " · Werte laut Open Food Facts")
    : selectedFood.src === "rezept"
      ? ` · mein Gericht aus ${selectedFood.zutaten.map(z => z.n).join(", ")}`
      : "";
  document.getElementById("portionPreview").textContent = `${Math.round(grams)} ${unit}: ${formatFoodValues(selectedFood, grams)}${source}`;
}

async function addEntry(entry) {
  entries.push(entry);
  await saveDay(currentDate, entries);
  render();
  showToast(`✓ ${entry.n} eingetragen (${entry.u.replace(/ · .*$/, "")})`);
}

// ---------- Schnellleiste und Bestätigung ----------
let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerHTML = `<span>${escapeHtml(text)}</span><button type="button" data-go="teller">Ansehen</button>`;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ---------- Menü: immer nur einen Bereich zeigen ----------
// Die Ringe und das Datum bleiben oben; darunter steht nur der gewählte Bereich.
const VIEW_KEY = "pt-bereich";
const VIEWS = ["heute", "kochen", "entdecken", "woche", "auswertung", "profil", "einstellungen"];
let currentView = "heute";

function showView(view, scroll) {
  if (!VIEWS.includes(view)) view = "heute";
  currentView = view;
  document.querySelectorAll("[data-bereich]").forEach(el => { el.style.display = el.dataset.bereich === view ? "" : "none"; });
  if (view === "einstellungen") document.querySelectorAll('details[data-bereich="einstellungen"]').forEach(d => { d.open = true; });
  document.querySelectorAll("#menuPanel [data-view-go]").forEach(b => b.classList.toggle("current", b.dataset.viewGo === view));
  document.querySelector('#quickbar [data-go="teller"]').classList.toggle("active-view", view === "heute");
  try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* ohne Merken weiter */ }
  if (view === "einstellungen") renderBackupInfo();
  if (scroll) {
    const rings = document.querySelector(".rings");
    const top = rings ? rings.getBoundingClientRect().bottom + window.scrollY - 70 : 0;
    window.scrollTo({top: Math.max(0, top), behavior: "smooth"});
  }
}

function toggleMenu(open) {
  const panel = document.getElementById("menuPanel");
  const button = document.getElementById("menuToggle");
  const show = open === undefined ? panel.hidden : open;
  panel.hidden = !show;
  button.setAttribute("aria-expanded", String(show));
}

function goTo(target) {
  const ids = {eintragen: "inputSection", gericht: "inputSection", teller: "tellerSection", woche: "weeklySection"};
  const section = document.getElementById(ids[target]);
  if (!section) return;
  toggleMenu(false);
  showView(target === "woche" ? "woche" : "heute");
  if (target === "eintragen") showTab("search");
  if (target === "gericht") showTab("dish");
  section.scrollIntoView({behavior: "smooth", block: "start"});
  section.classList.remove("flash");
  void section.offsetWidth; // Animation neu starten
  section.classList.add("flash");
  if (target === "eintragen") {
    // Suchfeld bereitmachen; die Tastatur öffnet sich erst beim Antippen des Feldes
    setTimeout(() => document.getElementById("search").focus({preventScroll: true}), 450);
  }
  document.getElementById("toast").classList.remove("show");
}

// ---------- Frei eintragen ----------
function updateFreePreview() {
  const name = document.getElementById("fName").value.trim();
  const grams = parseFloat(document.getElementById("fGrams").value) || 100;
  const match = name ? bestLocalMatch(name) : null;
  const preview = document.getElementById("freePreview");
  if (match) {
    preview.textContent = `Erkannt als ${match.n}. Bei ${Math.round(grams)} g: ${formatFoodValues(match, grams)}.`;
  } else if (name) {
    preview.textContent = `„${name}“ kenne ich noch nicht. CO₂ schätze ich grob; bitte trage kcal und Protein ein, sonst zählt der Eintrag mit 0. Mit eigenen Werten merke ich mir das Lebensmittel für die Suche.`;
  } else {
    preview.textContent = "Wenn der Name bekannt ist, rechne ich kcal, Protein und CO₂ aus der Grammzahl automatisch aus.";
  }
}

async function addFreeEntry() {
  const name = document.getElementById("fName").value.trim();
  if (!name) return;
  const grams = parseFloat(document.getElementById("fGrams").value) || 100;
  const match = bestLocalMatch(name);
  const scaled = match ? scaleFood(match, grams) : null;
  const kInput = parseFloat(document.getElementById("fKcal").value);
  const pInput = parseFloat(document.getElementById("fProt").value);
  const cInput = parseFloat(document.getElementById("fCO2").value);
  const manualCo2 = Number.isFinite(cInput);
  const group = match ? match.group : inferGroup(name);
  const sameName = match && normalizeFoodName(name) === match.nameNorm;
  const entry = {
    n: match && !sameName ? `${name} (${match.n})` : (match ? match.n : name),
    u: `${Math.round(grams)} g · frei eingegeben`,
    k: Number.isFinite(kInput) ? kInput : (scaled ? scaled.k : 0),
    p: Number.isFinite(pInput) ? pInput : (scaled ? scaled.p : 0),
    c: manualCo2 ? cInput : (scaled ? scaled.c : estimateCO2PerKg(name) * grams),
    group, grams, v: ENTRY_VERSION, src: "frei"
  };
  if (manualCo2) entry.man = 1;
  else if (!match) entry.est = 1;
  // Unbekanntes Lebensmittel mit eigenen Werten für die nächste Suche merken.
  if (!match && Number.isFinite(kInput) && grams > 0) {
    rememberFood(prepareFood({
      n: name, group, k100: kInput / grams * 100, p100: (Number.isFinite(pInput) ? pInput : 0) / grams * 100,
      co2: entry.c / grams, co2est: !manualCo2, flags: "", g: Math.round(grams), src: "eigen"
    }));
    renderCategoryChips();
    renderFoodList(document.getElementById("search").value);
  }
  ["fName", "fGrams", "fKcal", "fProt", "fCO2"].forEach(id => { document.getElementById(id).value = ""; });
  updateFreePreview();
  await addEntry(entry);
}

// ---------- Eigenes Gericht zusammenstellen ----------
// Ein Gericht ist ein gemerktes Lebensmittel (src "rezept") mit Zutatenliste.
// Seine Werte je 100 g ergeben sich aus den Zutaten; eine Portion = Gesamtmenge ÷ Portionen.
// Gespeichert wird es mit den übrigen eigenen Lebensmitteln (mein-tag-foods) und darum
// auch gesichert und zwischen den Geräten abgeglichen.
let dishItems = [];      // [{food, grams}]
let dishEditing = null;  // nameNorm des Gerichts, das gerade bearbeitet wird

function dishTotals(items) {
  return items.reduce((t, {food, grams}) => ({
    g: t.g + grams,
    k: t.k + food.k100 * grams / 100,
    p: t.p + food.p100 * grams / 100,
    c: t.c + food.co2 * grams,
    est: t.est || !!food.co2est
  }), {g: 0, k: 0, p: 0, c: 0, est: false});
}

function dishFlags(items) {
  const set = new Set();
  items.forEach(({food}) => String(food.flags || "").replace(/l/g, "").split("").forEach(f => set.add(f)));
  if (items.some(({food}) => food.group === "milch")) set.add("M");
  if (items.some(({food}) => food.group === "ei")) set.add("E");
  if (items.some(({food}) => food.group === "fleisch")) set.add("T");
  if (items.some(({food}) => food.group === "fisch")) set.add("F");
  return [...set].join("");
}

function buildDish(name, items, portionsCount) {
  const t = dishTotals(items);
  const total = Math.max(1, t.g);
  return makeCustomFood({
    n: name, src: "rezept",
    k100: t.k / total * 100, p100: t.p / total * 100, co2: t.c / total, co2est: t.est,
    flags: dishFlags(items), g: Math.round(total / portionsCount),
    zutaten: items.map(({food, grams}) => ({n: food.n, g: grams})), port: portionsCount
  });
}

function dishPortionsCount() {
  return Math.min(20, Math.max(1, parseInt(document.getElementById("dishPortions").value) || 1));
}

function renderDishBuilder() {
  const list = document.getElementById("dishItems");
  list.innerHTML = dishItems.map(({food, grams}, i) => `
    <div class="dish-item">
      <div>
        <div class="d-name">${escapeHtml(food.n)}</div>
        <div class="d-meta">${Math.round(food.k100 * grams / 100)} kcal · ${(food.p100 * grams / 100).toFixed(1)} g P · ${Math.round(food.co2 * grams)} g CO₂</div>
      </div>
      <input type="number" min="1" step="1" value="${Math.round(grams)}" data-dish-grams="${i}" aria-label="Menge ${escapeHtml(food.n)}">
      <span class="d-unit">${food.liquid ? "ml" : "g"}</span>
      <button type="button" class="del" data-dish-remove="${i}" title="Zutat entfernen">×</button>
    </div>`).join("");
  updateDishPreview();
  renderDishList();
}

function updateDishPreview() {
  const preview = document.getElementById("dishPreview");
  const warn = document.getElementById("dishWarn");
  if (!dishItems.length) {
    preview.textContent = "Noch keine Zutaten. Suche oben eine Zutat und tippe sie an.";
    warn.style.display = "none";
    return;
  }
  const t = dishTotals(dishItems);
  const n = dishPortionsCount();
  const est = t.est ? "≈ " : "";
  preview.textContent = `Ganzes Gericht: ${Math.round(t.g)} g · ${Math.round(t.k)} kcal · ${t.p.toFixed(1)} g Protein · ${est}${Math.round(t.c)} g CO₂. ` +
    `1 Portion (${Math.round(t.g / n)} g): ${Math.round(t.k / n)} kcal · ${(t.p / n).toFixed(1)} g Protein · ${est}${Math.round(t.c / n)} g CO₂.`;
  const conflicts = foodConflicts({group: "gericht", flags: dishFlags(dishItems)});
  warn.textContent = conflicts.length ? `Hinweis: ${conflictText(conflicts)}.` : "";
  warn.style.display = conflicts.length ? "" : "none";
}

function renderDishResults(query) {
  const box = document.getElementById("dishResults");
  const q = String(query || "").trim();
  if (q.length < 2) { box.style.display = "none"; box.innerHTML = ""; return; }
  const pool = [...customFoods.filter(f => f.nameNorm !== dishEditing), ...FOODS];
  const hits = rankFoods(pool, q).slice(0, 6);
  box.style.display = "";
  box.innerHTML = hits.length
    ? hits.map(f => `
      <div class="food-item" data-dish-add="${escapeHtml(f.n)}">
        <div>
          <div class="name">${escapeHtml(f.n)}</div>
          <div class="meta">je 100 ${f.liquid ? "ml" : "g"}: ${Math.round(f.k100)} kcal · ${f.p100.toFixed(1)} g P · ${Math.round(f.co2 * 100)} g CO₂</div>
        </div>
        <div class="add">+</div>
      </div>`).join("")
    : '<div class="food-item none"><div><div class="name">Keine passende Zutat</div><div class="meta">Lege sie zuerst unter „Frei eintragen“ mit Werten von der Packung an – dann steht sie hier zur Wahl.</div></div></div>';
}

function renderDishList() {
  const box = document.getElementById("dishList");
  const dishes = customFoods.filter(f => f.src === "rezept");
  if (!dishes.length) {
    box.className = "entries empty";
    box.innerHTML = '<div class="e-empty">Noch keine eigenen Gerichte gespeichert.</div>';
    return;
  }
  box.className = "entries";
  box.innerHTML = dishes.map(f => `
    <div class="entry dish-entry">
      <div>
        <div class="e-name">${escapeHtml(f.n)}</div>
        <div class="e-meta">${f.zutaten.length} Zutaten · 1 Portion ${f.g} g: ${Math.round(f.k100 * f.g / 100)} kcal · ${(f.p100 * f.g / 100).toFixed(1)} g P · ${Math.round(f.co2 * f.g)} g CO₂</div>
      </div>
      <div class="e-vals">
        <button type="button" class="btn" data-dish-use="${escapeHtml(f.n)}">Eintragen</button>
        <button type="button" class="btn ghost" data-dish-edit="${escapeHtml(f.n)}">Bearbeiten</button>
        <button type="button" class="del" data-dish-delete="${escapeHtml(f.n)}" title="Gericht löschen">×</button>
      </div>
    </div>`).join("");
}

function resetDish(message) {
  dishItems = [];
  dishEditing = null;
  document.getElementById("dishName").value = "";
  document.getElementById("dishSearch").value = "";
  document.getElementById("dishPortions").value = 2;
  document.getElementById("dishStatus").textContent = message || "";
  renderDishResults("");
  renderDishBuilder();
}

function editDish(food) {
  const missing = [];
  dishItems = food.zutaten.map(z => {
    const ingredient = foodByName(z.n);
    if (!ingredient) missing.push(z.n);
    return ingredient ? {food: ingredient, grams: z.g} : null;
  }).filter(Boolean);
  dishEditing = food.nameNorm;
  document.getElementById("dishName").value = food.n;
  document.getElementById("dishPortions").value = food.port || 1;
  document.getElementById("dishStatus").textContent = missing.length
    ? `„${food.n}“ wird bearbeitet. Nicht mehr gefunden: ${missing.join(", ")} – bitte neu hinzufügen.`
    : `„${food.n}“ wird bearbeitet. Ändere Zutaten oder Mengen und speichere dann.`;
  renderDishBuilder();
  document.getElementById("dishName").scrollIntoView({behavior: "smooth", block: "center"});
}

async function saveDish(addPortion) {
  const status = document.getElementById("dishStatus");
  let name = document.getElementById("dishName").value.trim();
  if (!name) { status.textContent = "Bitte gib dem Gericht einen Namen."; return; }
  if (!dishItems.length) { status.textContent = "Bitte füge mindestens eine Zutat hinzu."; return; }
  // Gleicher Name wie ein Eintrag der festen Liste? Dann eindeutig machen.
  if (FOOD_BY_NAME.has(normalizeFoodName(name))) name += " (mein Gericht)";
  const dish = buildDish(name, dishItems, dishPortionsCount());
  const replaced = customFoods.some(f => f.nameNorm === dish.nameNorm || f.nameNorm === dishEditing);
  customFoods = [dish, ...customFoods.filter(f => f.nameNorm !== dish.nameNorm && f.nameNorm !== dishEditing)];
  persistCustomFoods();
  renderCategoryChips();
  renderFoodList(document.getElementById("search").value);
  if (addPortion) await addEntry(scaleFood(dish, dish.g));
  resetDish(`„${dish.n}“ ${replaced ? "aktualisiert" : "gespeichert"}${addPortion ? ` und 1 Portion (${dish.g} g) eingetragen` : ""}. Du findest es unter „Aus Liste“.`);
}

// ---------- Rezepte zu den vorgeschlagenen Gerichten (Daten in recipes.js) ----------
function recipeFor(name) {
  return (typeof RECIPES !== "undefined" && RECIPES[name]) || null;
}

function recipeItems(recipe) {
  return recipe.zutaten
    .map(([n, grams, label]) => ({food: foodByName(n), grams, label}))
    .filter(item => item.food);
}

// Ein Rezept, in dem dieses Lebensmittel vorkommt und das zu Allergien/Ernährungsweise passt.
function recipeUsing(foodName) {
  if (typeof RECIPES === "undefined") return null;
  // Auch ähnliche Zutaten zählen: „Pasta, gekocht“ findet Rezepte mit „Pasta (trocken)“.
  const firstWord = name => normalizeFoodName(name).split(/[ ,(\/]/)[0];
  const key = firstWord(foodName);
  const hit = Object.entries(RECIPES).find(([dish, recipe]) =>
    recipe.zutaten.some(z => z[0] === foodName || (key.length >= 4 && firstWord(z[0]) === key)) &&
    foodConflicts({group: "gericht", flags: dishFlags(recipeItems(recipe))}).length === 0 &&
    !freqMap[dish]);
  return hit ? hit[0] : null;
}

function recipeHtml(name) {
  const recipe = recipeFor(name);
  if (!recipe) return "";
  const items = recipeItems(recipe);
  const t = dishTotals(items);
  const n = recipe.portionen;
  const conflicts = foodConflicts({group: "gericht", flags: dishFlags(items)});
  const line = ({food, grams, label}) => {
    const amount = `${Math.round(grams)} ${food.liquid ? "ml" : "g"}`;
    // Steht im Rezept nur eine Menge („1 Zehe“, „1½ EL“), den Namen der Zutat ergänzen.
    const onlyAmount = label && /^[\d½¼¾\s]+(EL|TL|Zehen?|Stück)?$/.test(label.trim());
    const shortName = food.n.replace(/\s*\(.*\)$/, "").replace(/,.*$/, "");
    const text = onlyAmount ? `${label} ${shortName}` : label;
    return label ? `${escapeHtml(text)} <span class="recipe-amount">(${amount})</span>` : `${amount} ${escapeHtml(food.n)}`;
  };
  return `
    <details class="recipe">
      <summary>Rezept ansehen · ${n} Portionen · ${escapeHtml(recipe.zeit)}</summary>
      ${recipe.art ? `<p class="recipe-note">${escapeHtml(recipe.art)}</p>` : ""}
      <div class="recipe-head">Zutaten</div>
      <ul class="recipe-ing">${items.map(item => `<li>${line(item)}</li>`).join("")}</ul>
      <div class="recipe-head">So geht's</div>
      <ol class="recipe-steps">${recipe.schritte.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      ${recipe.tipp ? `<p class="recipe-note">Tipp: ${escapeHtml(recipe.tipp)}</p>` : ""}
      <p class="recipe-values">1 Portion laut Rezept: ${Math.round(t.k / n)} kcal · ${(t.p / n).toFixed(0)} g Protein · ${Math.round(t.c / n)} g CO₂</p>
      ${conflicts.length ? `<p class="recipe-warn">Hinweis: ${escapeHtml(conflictText(conflicts))}.</p>` : ""}
      <button type="button" class="btn ghost" data-recipe-adopt="${escapeHtml(name)}">Als mein Gericht übernehmen</button>
    </details>`;
}

// Lädt ein Rezept in „Gericht“, damit man Zutaten und Mengen an die eigene Zubereitung anpassen kann.
function adoptRecipe(name) {
  const recipe = recipeFor(name);
  if (!recipe) return;
  dishItems = recipeItems(recipe).map(({food, grams}) => ({food, grams}));
  dishEditing = null;
  document.getElementById("dishName").value = name.replace(/ \(ohne Reis\)$/, "");
  document.getElementById("dishPortions").value = recipe.portionen;
  showTab("dish");
  document.getElementById("dishStatus").textContent =
    "Rezept übernommen. Passe Zutaten und Mengen an deine Zubereitung an und speichere es – danach findest du es unter „Aus Liste“.";
  document.getElementById("inputSection").scrollIntoView({behavior: "smooth", block: "start"});
}

// ---------- Was koche ich heute? (KI-Rezepte aus dem Vorrat) ----------
// Geschickt werden: Vorrat, Wunsch, offene Tageswerte, Ernährungsweise, Allergien, Vorlieben,
// Lücken der Wochenration und die Namen der zuletzt häufigsten Lebensmittel.
// Nicht geschickt werden: Gesundheitsnotiz, Körperdaten, einzelne Tagebucheinträge.
const PANTRY_KEY = "mein-tag-vorrat";
let cookRecipes = []; // [{titel, warum, zeit, portionen, items: [{food, grams, anzeige, vorhanden}], schritte, dish}]
let cookBusy = false;

function updateCookHint() {
  const hint = document.getElementById("cookHint");
  const button = document.getElementById("cookGo");
  if (!hint) return;
  const ready = window.PlanetSync && PlanetSync.client && PlanetSync.user;
  button.disabled = !ready || cookBusy;
  hint.textContent = ready
    ? "Dafür gehen dein Vorrat, dein Wunsch, deine offenen Tageswerte, Ernährungsweise, Allergien, Vorlieben und die Namen deiner häufigsten Lebensmittel an Anthropic (Claude) – nicht deine Gesundheitsnotiz oder Körperdaten. Kosten: etwa 2–4 Cent pro Vorschlag."
    : "Für die Rezeptvorschläge bitte im Menü unter „Einstellungen“ → „Mac & Handy abgleichen“ anmelden.";
}

function cookContext() {
  const t = dayTotals();
  const weekly = weeklyTotals();
  const dayOfWeek = (new Date(currentDate).getDay() + 6) % 7 + 1; // Montag = 1
  const gaps = FOOD_GROUPS
    // Fleisch und Fisch nicht als „Lücke“ melden – die App soll dazu nicht extra anregen.
    .filter(g => groupAllowed(g.id) && !["fleisch", "fisch"].includes(g.id) &&
      (weekly[g.id] || 0) < weeklyTargetFor(g) * dayOfWeek / 7 * 0.6)
    .map(g => g.label);
  const often = Object.entries(freqMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
  const diets = {alles: "isst alles", pescetarisch: "kein Fleisch, aber Fisch", vegetarisch: "vegetarisch", vegan: "vegan"};
  return {
    offen_kcal_heute: Math.max(0, Math.round(targets.kcal - t.k)),
    offen_protein_g_heute: Math.max(0, Math.round(targets.prot - t.p)),
    co2_rest_g_heute: Math.round(targets.co2 - t.c),
    tagesziele: {kcal: targets.kcal, protein_g: targets.prot, co2_g: targets.co2},
    ernaehrungsweise: diets[profile.diet] || "isst alles",
    meiden_allergien: (profile.avoid || []).map(id => (ALLERGENS.find(a => a.id === id) || {}).label).filter(Boolean),
    vorlieben: prefs.map(groupLabel),
    luecken_diese_woche: gaps,
    zuletzt_oft_gegessen: often
  };
}

async function suggestRecipes() {
  const box = document.getElementById("cookResults");
  const pantryText = document.getElementById("pantryIn").value.trim();
  if (pantryText.length < 3) {
    box.innerHTML = '<div class="cook-error">Bitte schreib kurz auf, was du zu Hause hast.</div>';
    return;
  }
  if (cookBusy || !(window.PlanetSync && PlanetSync.user)) return;
  writeStoredValue(PANTRY_KEY, JSON.stringify(pantryText));
  cookBusy = true;
  updateCookHint();
  box.innerHTML = '<div class="pr-head"><span class="spinner"></span>Die KI überlegt sich zwei Rezepte für dich … (dauert meist 20–40 Sekunden)</div>';
  try {
    const namen = [...new Set([...FOODS, ...customFoods.filter(f => f.src !== "rezept")].map(f => f.n))];
    const {data, error} = await PlanetSync.client.functions.invoke("rezept-vorschlag", {
      body: {vorrat: pantryText, wunsch: document.getElementById("cookWish").value.trim(), kontext: cookContext(), namen}
    });
    if (error) {
      let message = "Die Rezeptvorschläge sind gerade nicht erreichbar.";
      try { const detail = await error.context.json(); if (detail && detail.fehler) message = detail.fehler; } catch (e) { /* Standardtext */ }
      throw new Error(message);
    }
    cookRecipes = (data.rezepte || []).map(r => {
      const items = (r.zutaten || []).map(z => {
        const food = foodByName(z.name) || makeCustomFood({
          n: String(z.name || "Zutat"), group: inferGroup(z.name), k100: num(z.kcal_pro_100g), p100: num(z.protein_pro_100g),
          co2: estimateCO2PerKg(z.name), co2est: true, g: 100, src: "eigen"
        });
        return {food, grams: Math.max(1, Math.round(num(z.gramm) || 100)), anzeige: String(z.anzeige || ""), vorhanden: z.vorhanden !== false, neu: !foodByName(z.name)};
      });
      const portionen = Math.max(1, Math.round(num(r.portionen) || 2));
      return {titel: String(r.titel || "Rezept"), warum: String(r.warum || ""), zeit: Math.round(num(r.zeit_minuten)), portionen,
              items, schritte: (r.schritte || []).map(String), dish: buildDish(String(r.titel || "Rezept"), items, portionen)};
    });
    renderCookRecipes(data);
  } catch (err) {
    box.innerHTML = `<div class="cook-error">${escapeHtml(err.message || String(err))}</div>`;
  } finally {
    cookBusy = false;
    updateCookHint();
  }
}

function renderCookRecipes(data) {
  const box = document.getElementById("cookResults");
  if (!cookRecipes.length) {
    box.innerHTML = '<div class="cook-error">Dazu ist der KI nichts eingefallen. Ergänze deinen Vorrat oder versuche einen anderen Wunsch.</div>';
    return;
  }
  const cost = num(data.kosten_usd);
  box.innerHTML = cookRecipes.map((r, i) => {
    const d = r.dish;
    const conflicts = foodConflicts(d);
    const missing = r.items.filter(item => !item.vorhanden);
    return `
    <div class="cook-card">
      <h3>${escapeHtml(r.titel)}</h3>
      <div class="cook-meta">${r.zeit ? `ca. ${r.zeit} Min. · ` : ""}${r.portionen} ${r.portionen === 1 ? "Portion" : "Portionen"}${missing.length ? ` · ${missing.length} Zutat${missing.length === 1 ? "" : "en"} einkaufen` : " · alles im Vorrat"}</div>
      ${r.warum ? `<div>${escapeHtml(r.warum)}</div>` : ""}
      <div class="recipe-head">Zutaten</div>
      <ul>${r.items.map(item => `<li>${escapeHtml(item.anzeige || item.food.n)} <span class="recipe-amount">(${item.grams} ${item.food.liquid ? "ml" : "g"})</span>${item.vorhanden ? "" : ' <span class="buy">– einkaufen</span>'}</li>`).join("")}</ul>
      <div class="recipe-head">So geht's</div>
      <ol>${r.schritte.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      <div class="cook-values">1 Portion (${d.g} g): ${Math.round(d.k100 * d.g / 100)} kcal · ${(d.p100 * d.g / 100).toFixed(0)} g Protein · ${d.co2est ? "≈ " : ""}${Math.round(d.co2 * d.g)} g CO₂</div>
      ${conflicts.length ? `<div class="cook-warn">Achtung: ${escapeHtml(conflictText(conflicts))} – bitte prüfen.</div>` : ""}
      <div class="backup-row">
        <button type="button" class="btn" data-cook-add="${i}">1 Portion eintragen</button>
        <button type="button" class="btn ghost" data-cook-adopt="${i}">Als mein Gericht übernehmen</button>
      </div>
    </div>`;
  }).join("") +
  `<div class="pr-meta">${escapeHtml(data.hinweis || "")}${cost ? ` Dieser Vorschlag kostete etwa ${(cost * 100).toFixed(1).replace(".", ",")} US-Cent.` : ""} Werte sind aus den Zutaten berechnet; bei Zutaten außerhalb deiner Liste hat die KI geschätzt.</div>`;
}

async function addCookPortion(index) {
  const r = cookRecipes[index];
  if (!r) return;
  await addEntry({...scaleFood(r.dish, r.dish.g), src: "rezept-ki"});
}

// Lädt den KI-Vorschlag in „Gericht“; dort lässt er sich anpassen und speichern.
// Zutaten, die nicht in der Liste stehen, werden als eigene Lebensmittel gemerkt.
function adoptCookRecipe(index) {
  const r = cookRecipes[index];
  if (!r) return;
  r.items.filter(item => item.neu).forEach(item => rememberFood(item.food));
  dishItems = r.items.map(item => ({food: foodByName(item.food.n) || item.food, grams: item.grams}));
  dishEditing = null;
  document.getElementById("dishName").value = r.titel;
  document.getElementById("dishPortions").value = r.portionen;
  renderCategoryChips();
  showTab("dish");
  document.getElementById("dishStatus").textContent = "Rezept übernommen. Passe Mengen an und speichere es – danach findest du es unter „Aus Liste“.";
  document.getElementById("inputSection").scrollIntoView({behavior: "smooth", block: "start"});
}

// ---------- Foto mit KI-Erkennung ----------
// Ablauf: Foto wählen → verkleinern → an die Supabase-Funktion „foto-erkennung“ schicken
// (nur angemeldet) → Vorschläge prüfen → bestätigen. Eingetragen wird nur, was angehakt ist.
let photoFile = null;
let photoSuggestions = []; // [{name, food, grams, k100, p100, co2, est, on, sicherheit, hinweis}]
let photoBusy = false;

// Alles zurücksetzen: Foto, Notiz und Vorschläge verschwinden, nichts wird eingetragen.
function resetPhoto() {
  photoSuggestions = [];
  photoFile = null;
  document.getElementById("photoInput").value = "";
  document.getElementById("photoNote").value = "";
  document.getElementById("photoPreview").textContent = "Foto vom Teller";
  document.getElementById("photoResult").style.display = "none";
  document.getElementById("photoResult").innerHTML = "";
  updatePhotoButton();
}

function photoReady() {
  return !!(window.PlanetSync && PlanetSync.client && PlanetSync.user);
}

function updatePhotoButton() {
  const button = document.getElementById("photoRecognize");
  const hint = document.getElementById("photoHint");
  button.disabled = !photoFile || !photoReady() || photoBusy;
  document.getElementById("photoClear").style.display = photoFile && !photoBusy ? "" : "none";
  if (!photoReady()) {
    hint.textContent = "Für die KI-Erkennung bitte im Menü unter „Einstellungen“ → „Mac & Handy abgleichen“ anmelden. Bis dahin kannst du selbst aus der Liste wählen.";
  } else {
    hint.textContent = "Die KI schlägt Lebensmittel und Mengen vor – du prüfst und bestätigst. Dafür geht das Foto einmalig an Anthropic (Claude) und wird nicht gespeichert. Kosten: etwa 3–5 Cent pro Foto.";
  }
}

// Verkleinert das Foto auf höchstens 1280 px an der langen Seite (spart Daten und Kosten).
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
    };
    img.onerror = () => reject(new Error("Das Foto konnte nicht gelesen werden."));
    img.src = URL.createObjectURL(file);
  });
}

async function recognizePhoto() {
  const box = document.getElementById("photoResult");
  const button = document.getElementById("photoRecognize");
  if (!photoFile || !photoReady() || photoBusy) return;
  photoBusy = true;
  button.disabled = true;
  document.getElementById("photoClear").style.display = "none";
  box.style.display = "";
  box.innerHTML = '<div class="pr-head"><span class="spinner"></span>Die KI schaut sich dein Foto an … (dauert meist 10–30 Sekunden)</div>';
  try {
    const bild = await shrinkPhoto(photoFile);
    const namen = [...new Set([...FOODS, ...customFoods].map(f => f.n))];
    const {data, error} = await PlanetSync.client.functions.invoke("foto-erkennung", {
      body: {bild, media_type: "image/jpeg", notiz: document.getElementById("photoNote").value.trim(), namen}
    });
    if (error) {
      let message = "Die Fotoerkennung ist gerade nicht erreichbar.";
      try { const detail = await error.context.json(); if (detail && detail.fehler) message = detail.fehler; } catch (e) { /* Standardtext */ }
      throw new Error(message);
    }
    photoSuggestions = (data.lebensmittel || []).map(item => {
      const food = item.aus_liste ? foodByName(item.name) : null;
      return {
        name: food ? food.n : String(item.name || "Unbekannt"),
        food,
        grams: Math.max(1, Math.round(num(item.gramm) || (food ? food.g : 100))),
        k100: food ? food.k100 : num(item.kcal_pro_100g),
        p100: food ? food.p100 : num(item.protein_pro_100g),
        co2: food ? food.co2 : estimateCO2PerKg(item.name),
        est: !food || !!food.co2est,
        on: true,
        sicherheit: item.sicherheit || "mittel",
        hinweis: item.hinweis || ""
      };
    });
    renderPhotoSuggestions(data);
  } catch (err) {
    box.innerHTML = `<div class="pr-error">${escapeHtml(err.message || String(err))}</div><div class="backup-row"><button type="button" class="btn ghost" id="photoDiscard">Verwerfen</button></div>`;
  } finally {
    photoBusy = false;
    updatePhotoButton();
  }
}

function photoItemValues(item) {
  return {k: item.k100 * item.grams / 100, p: item.p100 * item.grams / 100, c: item.co2 * item.grams};
}

function renderPhotoSuggestions(data) {
  const box = document.getElementById("photoResult");
  if (!photoSuggestions.length) {
    box.innerHTML = `<div class="pr-head">${escapeHtml(data.beschreibung || "")}</div><div class="pr-error">Die KI hat auf dem Foto nichts Essbares erkannt. Bitte selbst eintragen.</div><div class="backup-row"><button type="button" class="btn ghost" id="photoDiscard">Verwerfen</button></div>`;
    return;
  }
  const cost = num(data.kosten_usd);
  box.innerHTML = `
    <div class="pr-head">${escapeHtml(data.beschreibung || "Das habe ich erkannt:")}</div>
    ${photoSuggestions.map((item, i) => {
      const v = photoItemValues(item);
      const source = item.food ? "aus deiner Liste" : "Werte von der KI geschätzt";
      const unsure = item.sicherheit !== "hoch" ? `<span class="pr-unsure"> · ${item.sicherheit === "niedrig" ? "unsicher" : "eher sicher"}</span>` : "";
      const conflicts = item.food ? foodConflicts(item.food) : [];
      return `
      <label class="pr-item">
        <input type="checkbox" data-pr-check="${i}" ${item.on ? "checked" : ""}>
        <div>
          <div class="pr-name">${escapeHtml(item.name)}</div>
          <div class="pr-info" data-pr-info="${i}">${Math.round(v.k)} kcal · ${v.p.toFixed(1)} g P · ${item.est ? "≈ " : ""}${Math.round(v.c)} g CO₂ · ${source}${unsure}</div>
          ${item.hinweis ? `<div class="pr-info">${escapeHtml(item.hinweis)}</div>` : ""}
          ${conflicts.length ? `<div class="pr-info pr-unsure">Achtung: ${escapeHtml(conflictText(conflicts))}</div>` : ""}
        </div>
        <input type="number" min="0" step="1" value="${item.grams}" data-pr-grams="${i}" aria-label="Gramm ${escapeHtml(item.name)}">
      </label>`;
    }).join("")}
    <div class="pr-meta" id="photoTotals"></div>
    <div class="backup-row">
      <button type="button" class="btn" id="photoAddAll">Ausgewählte eintragen</button>
      <button type="button" class="btn ghost" id="photoDiscard">Verwerfen</button>
    </div>
    <div class="pr-meta">Mengen sind Schätzungen – bitte anpassen, wenn du mehr oder weniger gegessen hast.${cost ? ` Diese Erkennung kostete etwa ${cost < 0.01 ? "unter 1 Cent" : (cost * 100).toFixed(1).replace(".", ",") + " US-Cent"}.` : ""}</div>`;
  updatePhotoTotals();
}

function updatePhotoTotals() {
  let k = 0, p = 0, c = 0, count = 0;
  photoSuggestions.forEach((item, i) => {
    const v = photoItemValues(item);
    const info = document.querySelector(`[data-pr-info="${i}"]`);
    if (info) {
      const rest = info.innerHTML.split(" · ").slice(3).join(" · ");
      info.innerHTML = `${Math.round(v.k)} kcal · ${v.p.toFixed(1)} g P · ${item.est ? "≈ " : ""}${Math.round(v.c)} g CO₂ · ${rest}`;
    }
    if (!item.on) return;
    k += v.k; p += v.p; c += v.c; count++;
  });
  const totals = document.getElementById("photoTotals");
  if (totals) totals.textContent = `Zusammen (${count} ausgewählt): ${Math.round(k)} kcal · ${p.toFixed(1)} g Protein · ${Math.round(c)} g CO₂`;
}

async function addPhotoSuggestions() {
  const chosen = photoSuggestions.filter(item => item.on && item.grams > 0);
  if (!chosen.length) return;
  chosen.forEach(item => {
    const entry = item.food
      ? scaleFood(item.food, item.grams)
      : {n: item.name, u: `${Math.round(item.grams)} g`, ...photoItemValues(item),
         group: inferGroup(item.name), grams: item.grams, est: 1};
    entries.push({...entry, n: `${entry.n} (Foto bestätigt)`, src: "foto"});
  });
  await saveDay(currentDate, entries);
  render();
  showToast(`✓ ${chosen.length} ${chosen.length === 1 ? "Lebensmittel" : "Lebensmittel"} vom Foto eingetragen`);
  resetPhoto();
}

// ---------- Foto: selbst aus der Liste wählen ----------
function renderPhotoOptions() {
  const select = document.getElementById("photoGuess");
  if (!select) return;
  const groups = [...OTHER_GROUPS.slice(0, 1), ...FOOD_GROUPS, ...OTHER_GROUPS.slice(1)];
  select.innerHTML = '<option value="">— bitte wählen —</option>' + groups.map(g => {
    const foods = FOODS.filter(f => f.group === g.id);
    return `<optgroup label="${escapeHtml(g.label)}">${foods.map(f => `<option value="${escapeHtml(f.n)}">${escapeHtml(f.n)} · ${escapeHtml(f.u)}</option>`).join("")}</optgroup>`;
  }).join("");
}

// ---------- Tagesvorschlag ausgleichen ----------
const BALANCE_MEALS = [
  {title: "Protein-Frühstück", note: "Gut, wenn dir Protein fehlt und du noch genug Kalorien offen hast.",
    items: [["Haferflocken", 70], ["Beeren (gemischt)", 150], ["Chia-Samen", 15], ["Hafermilch", 200], ["Skyr", 150]]},
  {title: "Linsen-Kartoffel-Teller", note: "Sättigend, pflanzlich und meistens sehr freundlich fürs CO₂-Budget.",
    items: [["Linsen, gekocht", 200], ["Kartoffeln, gekocht", 250], ["Gemüse gemischt, gekocht", 250], ["Olivenöl", 10]]},
  {title: "Tofu-Vollkorn-Abend", note: "Bringt viel Protein, Ballaststoffe und Gemüse in einem ruhigen CO₂-Rahmen.",
    items: [["Tofu, natur", 150], ["Vollkornbrot", 100], ["Gemüse gemischt, gekocht", 250], ["Walnüsse", 20]]},
  {title: "Hüttenkäse-Brot-Teller", note: "Ein schneller Ausgleich, wenn du eher leicht gegessen hast.",
    items: [["Hüttenkäse", 200], ["Vollkornbrot", 100], ["Tomaten", 150], ["Olivenöl", 5]]},
  {title: "Ei-Kartoffel-Gemüse", note: "Praktisch, wenn du etwas Warmes willst und noch moderat Protein brauchst.",
    items: [["Ei, gebraten mit Öl", 65], ["Kartoffeln, gekocht", 250], ["Gemüsepfanne mit Olivenöl", 250]]},
  {title: "Quark-Bananen-Boost", note: "Kompakt für fehlende Kalorien und Protein, ohne viel Kochen.",
    items: [["Magerquark", 150], ["Banane", 120], ["Mandeln", 20]]},
  {title: "Hafer-Frühstück pflanzlich", note: "Rein pflanzlich, schnell gemacht und lange sättigend.",
    items: [["Haferflocken", 60], ["Sojadrink", 200], ["Banane", 120], ["Walnüsse", 20]]},
  {title: "Kichererbsen-Quinoa-Schale", note: "Bunt, pflanzlich und mit vollwertigem Protein.",
    items: [["Kichererbsen, gekocht", 150], ["Quinoa, gekocht", 150], ["Gemüse gemischt, roh", 200], ["Tahin (Sesammus)", 15]]},
  {title: "Erdnuss-Brot mit Apfel", note: "Ein kleiner, schneller Ausgleich für zwischendurch.",
    items: [["Vollkornbrot", 100], ["Erdnussbutter", 30], ["Apfel", 180]]},
  {title: "Bohnen-Reis-Teller", note: "Bohnen und Reis ergänzen sich beim Protein besonders gut.",
    items: [["Kidneybohnen (Dose)", 150], ["Reis, gekocht", 180], ["Gemüsepfanne mit Olivenöl", 200]]},
  {title: "Linsen-Pasta", note: "Wie Bolognese, nur mit roten Linsen statt Hackfleisch.",
    items: [["Vollkornpasta, gekocht", 200], ["Linsen rot, gekocht", 150], ["Tomaten (Dose) / Passata", 150], ["Olivenöl", 10]]},
  {title: "Räuchertofu-Kartoffel-Pfanne", note: "Herzhaft und warm, mit viel Protein aus Soja.",
    items: [["Räuchertofu", 100], ["Kartoffeln, gekocht", 250], ["Brokkoli, gegart", 200], ["Olivenöl", 10]]}
];

function roundPortion(food, grams) {
  const piece = food.portions[0];
  if (/Stück|Scheibe/.test(piece.short)) return Math.max(1, Math.round(grams / piece.g)) * piece.g;
  if (food.g <= 20) return Math.max(5, Math.round(grams / 5) * 5);
  return Math.max(10, Math.round(grams / 10) * 10);
}

function buildMealSuggestion(meal, factor) {
  const foods = meal.items.map(([name, grams]) => ({food: foodByName(name), grams}));
  if (foods.some(item => !item.food || foodConflicts(item.food).length)) return null;
  const items = foods.map(({food, grams}) => scaleFood(food, roundPortion(food, grams * factor)));
  const totals = items.reduce((sum, item) => ({k: sum.k + item.k, p: sum.p + item.p, c: sum.c + item.c}), {k: 0, p: 0, c: 0});
  return {...meal, items, ...totals};
}

function buildBalanceSuggestions() {
  const current = dayTotals();
  const need = {
    k: Math.max(0, targets.kcal - current.k),
    p: Math.max(0, targets.prot - current.p),
    c: targets.co2 - current.c
  };
  if (need.k < 150 && need.p < 8) return {need, meals: [], done: true};
  const meals = BALANCE_MEALS.map(meal => {
    const base = buildMealSuggestion(meal, 1);
    if (!base) return null;
    // Portionen an den offenen Bedarf anpassen (halbe bis knapp anderthalbfache Menge);
    // eine einzelne Mahlzeit soll aber höchstens rund 40 % des Tagesziels füllen.
    const mealGoal = Math.min(need.k, targets.kcal * 0.4);
    const factor = need.k < 150 ? 0.5 : Math.min(1.4, Math.max(0.5, mealGoal / base.k));
    const scaled = buildMealSuggestion(meal, factor);
    const kFit = mealGoal ? 1 - Math.min(1, Math.abs(scaled.k - mealGoal) / mealGoal) : 0;
    const pFit = need.p ? Math.min(scaled.p / need.p, 1) : 0.5;
    const liked = scaled.items.filter(item => prefs.includes(item.group)).length / scaled.items.length;
    const fits = need.c > 0 && scaled.c <= need.c;
    const score = pFit * 3 + kFit * 2 + liked * 0.5 - scaled.c / 1500;
    return {...scaled, fits, over: Math.round(scaled.c - Math.max(0, need.c)), score};
  }).filter(Boolean);
  meals.sort((a, b) => (b.fits - a.fits) || (b.score - a.score));
  return {need, meals: meals.slice(0, 3), done: false};
}

function renderBalanceSuggestions() {
  const container = document.getElementById("balanceSuggestions");
  if (!container) return;
  const result = buildBalanceSuggestions();
  currentSuggestions = result.meals;
  if (result.done) {
    container.innerHTML = '<div class="suggestion-card"><strong>Heute sieht es schon rund aus</strong><p>Kalorien und Protein sind nah am Ziel. Wenn du noch Hunger hast, nimm etwas Kleines nach Gefühl.</p></div>';
    return;
  }
  if (!result.meals.length) {
    container.innerHTML = '<div class="suggestion-card"><strong>Kein passender Vorschlag</strong><p>Mit deinen Allergien und deiner Ernährungsweise passt gerade keine der hinterlegten Mahlzeiten. Unter „Neues entdecken“ findest du einzelne Lebensmittel, die passen.</p></div>';
    return;
  }
  const intro = result.need.c <= 0
    ? '<div class="balance-rest">Dein CO₂-Budget ist heute schon aufgebraucht. Das sind die leichtesten Möglichkeiten, Energie und Protein aufzufüllen.</div>'
    : "";
  container.innerHTML = intro + result.meals.map((meal, index) => `
    <div class="suggestion-card">
      <strong>${escapeHtml(meal.title)}</strong>
      <p>${escapeHtml(meal.items.map(item => `${item.n} ${item.u}`).join(" · "))}</p>
      <p>${escapeHtml(meal.note)}</p>
      ${BALANCE_HOWTO[meal.title] ? `<p class="recipe-note">So geht's: ${escapeHtml(BALANCE_HOWTO[meal.title])}</p>` : ""}
      <div class="suggestion-foot">
        <div class="suggestion-values">${Math.round(meal.k)} kcal · ${meal.p.toFixed(1)} g Protein · ${Math.round(meal.c)} g CO₂
          <span class="${meal.fits ? "fit-ok" : "fit-over"}">${meal.fits ? "· passt in dein CO₂-Budget" : `· ${meal.over} g über deinem CO₂-Rest`}</span></div>
        <button class="btn add-suggestion" data-i="${index}">Übernehmen</button>
      </div>
    </div>`).join("");
}

// ---------- Neues entdecken ----------
const DISCOVER_REASONS = {
  huelsen: "Pflanzliches Protein mit kleinem Fußabdruck.",
  gericht: "Ein ganzes Gericht mit wenig CO₂.",
  gemuese: "Bringt Farbe und Abwechslung auf den Teller.",
  obst: "Süß, einfach und leicht für die Erde.",
  getreide: "Sättigende Grundlage zur Abwechslung.",
  nuesse: "Kleine Menge, viele gute Fette."
};

function discoverPicks() {
  const candidates = FOODS.filter(f => {
    if (freqMap[f.n] || foodConflicts(f).length) return false;
    if (f.k100 >= 700 || /trocken|Proteinpulver/.test(f.n)) return false;
    if (f.group === "gericht") return f.co2 <= 1.5;
    return ["huelsen", "gemuese", "obst", "getreide", "nuesse"].includes(f.group) && f.co2 <= 2;
  });
  const dayNumber = Math.floor(new Date(currentDate).setHours(12, 0, 0, 0) / 86400000);
  const pick = (list, step) => list.length ? list[(dayNumber * step + discoverOffset) % list.length] : null;
  const proteins = candidates.filter(f => f.group === "huelsen");
  const dishes = candidates.filter(f => f.group === "gericht");
  const others = candidates.filter(f => !["huelsen", "gericht"].includes(f.group));
  return [pick(proteins, 1), pick(dishes, 3), pick(others, 7)].filter(Boolean);
}

function renderDiscover() {
  const grid = document.getElementById("discoverGrid");
  if (!grid) return;
  const picks = discoverPicks();
  if (!picks.length) {
    grid.innerHTML = '<div class="analysis-card"><strong>Alles schon probiert</strong><p>Du hast in den letzten Wochen sehr abwechslungsreich gegessen — oder deine Einschränkungen lassen gerade nichts Neues aus der Liste zu.</p></div>';
    return;
  }
  grid.innerHTML = picks.map(f => {
    // Für ein Gericht sein eigenes Rezept, für eine Zutat ein Rezept, in dem sie vorkommt.
    const idea = recipeFor(f.n) ? null : recipeUsing(f.n);
    const quick = typeof QUICK_IDEAS !== "undefined" ? QUICK_IDEAS[f.n] : "";
    return `
    <div class="analysis-card discover-card">
      <strong>${escapeHtml(f.n)}</strong>
      <p>${escapeHtml(DISCOVER_REASONS[f.group] || "")}</p>
      <p class="discover-values">${escapeHtml(f.u)}: ${formatFoodValues(f, f.g)}</p>
      ${quick ? `<p class="recipe-note">Schnelle Idee: ${escapeHtml(quick)}</p>` : ""}
      ${idea ? `<p class="recipe-note">Rezeptidee damit: ${escapeHtml(idea)}</p>` : ""}
      ${recipeHtml(idea || f.n)}
      <button type="button" class="btn ghost discover-open" data-food="${escapeHtml(f.n)}">In der Liste ansehen</button>
    </div>`;
  }).join("");
}

function openFoodInList(food) {
  activeCategory = "alle";
  renderCategoryChips();
  showTab("search");
  document.getElementById("search").value = food.n;
  onlineFoods = [];
  renderFoodList(food.n);
  selectFood(food);
  document.getElementById("inputSection").scrollIntoView({behavior: "smooth", block: "start"});
}

function showTab(tab) {
  if (currentView !== "heute") showView("heute");
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));
  document.getElementById("tabSearch").style.display = tab === "search" ? "" : "none";
  document.getElementById("tabFree").style.display = tab === "free" ? "" : "none";
  document.getElementById("tabDish").style.display = tab === "dish" ? "" : "none";
  document.getElementById("tabPhoto").style.display = tab === "photo" ? "" : "none";
  if (tab === "dish") renderDishBuilder();
  if (tab === "photo") updatePhotoButton();
}

// ---------- Sicherung: Daten als Datei speichern und wieder einlesen ----------
function collectBackup() {
  const data = {};
  allStoredKeys().forEach(key => {
    if (key === BACKUP_INFO_KEY) return;
    const raw = readStoredValue(key);
    try { data[key] = JSON.parse(raw); } catch (e) { data[key] = raw; }
  });
  return {app: "planet-teller", format: 1, exportedAt: new Date().toISOString(), data};
}

function backupSummary(data) {
  const keys = Object.keys(data || {});
  const days = keys.filter(k => k.startsWith(KEY_PREFIX));
  const entryCount = days.reduce((sum, k) => sum + (Array.isArray(data[k]) ? data[k].length : 0), 0);
  const sorted = days.map(k => k.slice(KEY_PREFIX.length)).sort();
  return {
    days: days.length, entryCount,
    first: sorted[0] || null, last: sorted[sorted.length - 1] || null,
    hasProfile: keys.includes(PROFILE_KEY), hasSettings: keys.includes(SETTINGS_KEY),
    customFoods: Array.isArray(data[CUSTOM_KEY]) ? data[CUSTOM_KEY].length : 0
  };
}

function formatDay(iso) {
  const [y, m, d] = String(iso).split("-");
  return `${d}.${m}.${y}`;
}

function summaryText(s) {
  if (!s.days && !s.hasProfile && !s.hasSettings && !s.customFoods) return "keine Daten";
  const parts = [];
  parts.push(s.days ? `${s.days} ${s.days === 1 ? "Tag" : "Tage"} mit ${s.entryCount} Einträgen (${formatDay(s.first)} bis ${formatDay(s.last)})` : "keine Tage");
  if (s.hasProfile) parts.push("Profil");
  if (s.hasSettings) parts.push("Tagesziele");
  if (s.customFoods) parts.push(`${s.customFoods} gemerkte Lebensmittel`);
  return parts.join(", ");
}

function renderBackupInfo() {
  const el = document.getElementById("backupStatus");
  if (!el) return;
  const info = readJson(BACKUP_INFO_KEY, null);
  const here = summaryText(backupSummary(collectBackup().data));
  const last = info && info.at ? ` Letzte Sicherung: ${new Date(info.at).toLocaleString("de-DE")}.` : " Noch keine Sicherung aus diesem Browser.";
  el.textContent = `In diesem Browser gespeichert: ${here}.${last}`;
}

function exportBackup() {
  const backup = collectBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
  const stamp = dateKey(new Date()).slice(KEY_PREFIX.length);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `planet-teller-sicherung-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  writeStoredValue(BACKUP_INFO_KEY, JSON.stringify({at: backup.exportedAt}));
  renderBackupInfo();
}

function parseBackup(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === "planet-teller" && obj.data ? obj.data : obj;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Datei hat nicht das erwartete Format.");
  const clean = {};
  Object.keys(data).forEach(key => {
    if (!key.startsWith(ALL_KEYS_PREFIX) || key === BACKUP_INFO_KEY) return;
    const value = data[key];
    if (key.startsWith(KEY_PREFIX)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key.slice(KEY_PREFIX.length)) && Array.isArray(value)) clean[key] = value;
    } else if (value && typeof value === "object") {
      clean[key] = value;
    }
  });
  if (!Object.keys(clean).length) throw new Error("In der Datei sind keine Planet-Teller-Daten.");
  return clean;
}

function showImportPanel(data, fileName) {
  pendingImport = data;
  const panel = document.getElementById("importPanel");
  panel.style.display = "";
  document.getElementById("importSummary").textContent = `„${fileName}“ enthält: ${summaryText(backupSummary(data))}.`;
}

async function applyImport(replace) {
  if (!pendingImport) return;
  let added = 0;
  let skipped = 0;
  if (replace) {
    if (!confirm("Wirklich alle Daten in diesem Browser durch die Sicherung ersetzen? Was hier gespeichert ist und nicht in der Datei steht, geht verloren.")) return;
    allStoredKeys().forEach(removeStoredValue);
  }
  Object.keys(pendingImport).forEach(key => {
    if (!replace && readStoredValue(key) !== null) { skipped++; return; }
    writeStoredValue(key, JSON.stringify(pendingImport[key]));
    added++;
  });
  pendingImport = null;
  document.getElementById("importPanel").style.display = "none";
  document.getElementById("importFile").value = "";
  await loadState();
  renderAll();
  document.getElementById("importResult").textContent = replace
    ? `Sicherung eingelesen: ${added} Datensätze übernommen.`
    : `Sicherung eingelesen: ${added} Datensätze ergänzt, ${skipped} schon vorhandene unverändert gelassen.`;
}

// ---------- Bedienung ----------
function setupListeners() {
  document.getElementById("search").addEventListener("input", e => handleFoodSearch(e.target.value));
  document.getElementById("runAnalysis").addEventListener("click", renderLongTermAnalysis);

  document.getElementById("catChips").addEventListener("click", e => {
    const chip = e.target.closest("[data-cat]");
    if (!chip) return;
    activeCategory = chip.dataset.cat;
    renderCategoryChips();
    renderFoodList(document.getElementById("search").value);
  });

  document.getElementById("foodList").addEventListener("click", e => {
    const item = e.target.closest(".food-item[data-i]");
    if (!item) return;
    const food = currentList[parseInt(item.dataset.i)];
    if (food) selectFood(food);
  });

  document.getElementById("portionGrams").addEventListener("input", updatePortionPreview);
  document.getElementById("portionChips").addEventListener("click", e => {
    const chip = e.target.closest(".pref-chip");
    if (!chip || !selectedFood) return;
    const input = document.getElementById("portionGrams");
    if (chip.dataset.grams) input.value = chip.dataset.grams;
    else input.value = Math.max(1, Math.round((parseFloat(input.value) || selectedFood.g) * parseFloat(chip.dataset.factor)));
    updatePortionPreview();
  });
  document.getElementById("portionAlt").addEventListener("click", e => {
    const button = e.target.closest("[data-alt]");
    const food = button ? foodByName(button.dataset.alt) : null;
    if (food) selectFood(food);
  });
  document.getElementById("addPortion").addEventListener("click", async () => {
    if (!selectedFood) return;
    const grams = parseFloat(document.getElementById("portionGrams").value) || selectedFood.g;
    if (selectedFood.src === "online" && !selectedFood.saved) {
      rememberFood(selectedFood); // beim nächsten Mal sofort in der eigenen Liste
      renderCategoryChips();
    }
    await addEntry(scaleFood(selectedFood, grams));
  });
  document.getElementById("forgetFood").addEventListener("click", () => {
    if (!selectedFood || !selectedFood.saved) return;
    forgetFood(selectedFood);
    selectedFood = null;
    document.getElementById("portionPanel").classList.remove("active");
    renderCategoryChips();
    renderFoodList(document.getElementById("search").value);
  });

  ["fName", "fGrams"].forEach(id => document.getElementById(id).addEventListener("input", updateFreePreview));
  document.getElementById("addFree").addEventListener("click", addFreeEntry);

  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

  document.getElementById("entries").addEventListener("click", async e => {
    const button = e.target.closest(".del");
    if (!button) return;
    const [removed] = entries.splice(parseInt(button.dataset.i), 1);
    rememberDeleted(removed); // damit der Eintrag auch auf dem anderen Gerät verschwindet
    await saveDay(currentDate, entries);
    render();
  });

  // Profil
  const profileChanged = async () => {
    profile = readProfileForm();
    updateCalculatedPreview(calculateTargetsFromProfile(profile));
    await saveProfile(profile);
  };
  ["ageIn", "weightIn", "heightIn", "activityIn", "proteinFactorIn", "planetModeIn", "sexIn", "healthNoteIn"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", profileChanged);
    el.addEventListener("change", profileChanged);
  });
  const restrictionsChanged = async () => {
    await saveProfile(profile);
    renderAvoidChips();
    render();
    renderFoodList(document.getElementById("search").value);
    if (selectedFood) selectFood(selectedFood);
  };
  document.getElementById("dietIn").addEventListener("change", async () => {
    profile = readProfileForm();
    await restrictionsChanged();
  });
  document.getElementById("avoidGrid").addEventListener("click", async e => {
    const chip = e.target.closest("[data-avoid]");
    if (!chip) return;
    const id = chip.dataset.avoid;
    profile.avoid = profile.avoid.includes(id) ? profile.avoid.filter(x => x !== id) : [...profile.avoid, id];
    await restrictionsChanged();
  });

  document.getElementById("calcProfile").addEventListener("click", async () => {
    profile = readProfileForm();
    targets = calculateTargetsFromProfile(profile);
    document.getElementById("tKcalIn").value = targets.kcal;
    document.getElementById("tProtIn").value = targets.prot;
    document.getElementById("tCO2In").value = targets.co2;
    await saveProfile(profile);
    await saveSettings(targets);
    document.getElementById("calcNote").textContent = explainProfileCalculation(profile, targets);
    render();
  });

  document.getElementById("prefGrid").addEventListener("click", async e => {
    const chip = e.target.closest("[data-group]");
    if (!chip) return;
    const group = chip.dataset.group;
    prefs = prefs.includes(group) ? prefs.filter(x => x !== group) : [...prefs, group];
    await savePrefs(prefs);
    renderPrefs();
    render();
  });

  // Menü
  document.getElementById("menuToggle").addEventListener("click", () => toggleMenu());
  document.getElementById("menuPanel").addEventListener("click", e => {
    const item = e.target.closest("[data-view-go]");
    if (!item) return;
    toggleMenu(false);
    showView(item.dataset.viewGo, true);
  });
  document.addEventListener("click", e => {
    if (!e.target.closest("#quickbar")) toggleMenu(false);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") toggleMenu(false); });
  let savedView = "heute";
  try { savedView = localStorage.getItem(VIEW_KEY) || "heute"; } catch (e) { /* Standard */ }
  showView(savedView);

  // Schnellleiste oben und „Ansehen“ in der Bestätigung
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-go]");
    if (button) goTo(button.dataset.go);
  });

  // Was koche ich heute?
  const pantry = document.getElementById("pantryIn");
  pantry.value = readJson(PANTRY_KEY, "") || "";
  pantry.addEventListener("change", () => writeStoredValue(PANTRY_KEY, JSON.stringify(pantry.value.trim())));
  document.getElementById("cookGo").addEventListener("click", suggestRecipes);
  document.getElementById("cookResults").addEventListener("click", async e => {
    const add = e.target.closest("[data-cook-add]");
    const adopt = e.target.closest("[data-cook-adopt]");
    if (add) await addCookPortion(parseInt(add.dataset.cookAdd));
    if (adopt) adoptCookRecipe(parseInt(adopt.dataset.cookAdopt));
  });
  updateCookHint();

  // Rezept als eigenes Gericht übernehmen (Knopf steht in mehreren Bereichen)
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-recipe-adopt]");
    if (button) adoptRecipe(button.dataset.recipeAdopt);
  });

  // Eigenes Gericht
  document.getElementById("dishSearch").addEventListener("input", e => renderDishResults(e.target.value));
  document.getElementById("dishResults").addEventListener("click", e => {
    const item = e.target.closest("[data-dish-add]");
    const food = item ? foodByName(item.dataset.dishAdd) : null;
    if (!food) return;
    const existing = dishItems.find(x => x.food.nameNorm === food.nameNorm);
    if (existing) existing.grams += food.g;
    else dishItems.push({food, grams: food.g});
    if (!dishEditing) document.getElementById("dishStatus").textContent = ""; // alte Meldung ausblenden
    document.getElementById("dishSearch").value = "";
    renderDishResults("");
    renderDishBuilder();
    document.getElementById("dishSearch").focus();
  });
  document.getElementById("dishItems").addEventListener("input", e => {
    const input = e.target.closest("[data-dish-grams]");
    if (!input) return;
    const item = dishItems[parseInt(input.dataset.dishGrams)];
    if (item) item.grams = Math.max(0, parseFloat(input.value) || 0);
    updateDishPreview();
  });
  document.getElementById("dishItems").addEventListener("change", e => {
    if (e.target.closest("[data-dish-grams]")) renderDishBuilder();
  });
  document.getElementById("dishItems").addEventListener("click", e => {
    const button = e.target.closest("[data-dish-remove]");
    if (!button) return;
    dishItems.splice(parseInt(button.dataset.dishRemove), 1);
    renderDishBuilder();
  });
  document.getElementById("dishPortions").addEventListener("input", updateDishPreview);
  document.getElementById("dishSave").addEventListener("click", () => saveDish(false));
  document.getElementById("dishSaveAdd").addEventListener("click", () => saveDish(true));
  document.getElementById("dishReset").addEventListener("click", () => resetDish(""));
  document.getElementById("dishList").addEventListener("click", e => {
    const use = e.target.closest("[data-dish-use]");
    const edit = e.target.closest("[data-dish-edit]");
    const del = e.target.closest("[data-dish-delete]");
    if (use) { const f = foodByName(use.dataset.dishUse); if (f) openFoodInList(f); }
    if (edit) { const f = foodByName(edit.dataset.dishEdit); if (f) editDish(f); }
    if (del) {
      const f = foodByName(del.dataset.dishDelete);
      if (!f || !confirm(`„${f.n}“ aus deinen Gerichten löschen? Bereits eingetragene Portionen bleiben im Tagebuch.`)) return;
      forgetFood(f);
      if (dishEditing === f.nameNorm) resetDish("");
      document.getElementById("dishStatus").textContent = `„${f.n}“ gelöscht.`;
      renderCategoryChips();
      renderFoodList(document.getElementById("search").value);
      renderDishList();
    }
  });

  // Foto
  document.getElementById("photoInput").addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    photoFile = file;
    photoSuggestions = [];
    document.getElementById("photoResult").style.display = "none";
    updatePhotoButton();
    const url = URL.createObjectURL(file);
    document.getElementById("photoPreview").innerHTML = `<img src="${url}" alt="Ausgewähltes Essen">`;
    const guess = rankFoods(FOODS, file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "))[0];
    document.getElementById("photoGuess").value = guess ? guess.n : "";
    if (guess) document.getElementById("photoPortions").value = guess.g;
  });
  document.getElementById("photoGuess").addEventListener("change", e => {
    const food = foodByName(e.target.value);
    if (food) document.getElementById("photoPortions").value = food.g;
  });
  document.getElementById("photoRecognize").addEventListener("click", recognizePhoto);
  document.getElementById("photoClear").addEventListener("click", resetPhoto);
  document.getElementById("photoResult").addEventListener("input", e => {
    const input = e.target.closest("[data-pr-grams]");
    if (!input) return;
    const item = photoSuggestions[parseInt(input.dataset.prGrams)];
    if (item) item.grams = Math.max(0, parseFloat(input.value) || 0);
    updatePhotoTotals();
  });
  document.getElementById("photoResult").addEventListener("change", e => {
    const box = e.target.closest("[data-pr-check]");
    if (!box) return;
    const item = photoSuggestions[parseInt(box.dataset.prCheck)];
    if (item) item.on = box.checked;
    box.closest(".pr-item").classList.toggle("off", !box.checked);
    updatePhotoTotals();
  });
  document.getElementById("photoResult").addEventListener("click", e => {
    if (e.target.closest("#photoAddAll")) addPhotoSuggestions();
    if (e.target.closest("#photoDiscard")) {
      resetPhoto();
      showToast("Foto verworfen – nichts eingetragen");
    }
  });
  document.getElementById("addPhotoGuess").addEventListener("click", async () => {
    const food = foodByName(document.getElementById("photoGuess").value);
    if (!food) return;
    const grams = parseFloat(document.getElementById("photoPortions").value) || food.g;
    await addEntry({...scaleFood(food, grams), n: food.n + " (Foto bestätigt)", src: "foto"});
  });

  // Tagesvorschläge
  document.getElementById("balanceDay").addEventListener("click", () => {
    balanceShown = true;
    renderBalanceSuggestions();
  });
  document.getElementById("balanceSuggestions").addEventListener("click", async e => {
    const button = e.target.closest(".add-suggestion");
    if (!button) return;
    const meal = currentSuggestions[parseInt(button.dataset.i)];
    if (!meal) return;
    entries.push(...meal.items.map(item => ({...item, n: `${item.n} (Vorschlag)`, src: "vorschlag"})));
    await saveDay(currentDate, entries);
    render();
    showToast(`✓ ${meal.title} eingetragen (${meal.items.length} Lebensmittel)`);
  });

  // Neues entdecken
  document.getElementById("discoverMore").addEventListener("click", () => {
    discoverOffset += 1;
    renderDiscover();
  });
  document.getElementById("discoverGrid").addEventListener("click", e => {
    const button = e.target.closest(".discover-open");
    const food = button ? foodByName(button.dataset.food) : null;
    if (food) openFoodInList(food);
  });

  // Tageswechsel
  document.getElementById("prevDay").addEventListener("click", async () => {
    currentDate.setDate(currentDate.getDate() - 1);
    await refreshDay();
  });
  document.getElementById("nextDay").addEventListener("click", async () => {
    currentDate.setDate(currentDate.getDate() + 1);
    await refreshDay();
  });

  // Tagesziele von Hand
  ["tKcalIn", "tProtIn", "tCO2In"].forEach(id => {
    document.getElementById(id).addEventListener("change", async () => {
      targets = {
        kcal: parseInt(document.getElementById("tKcalIn").value) || DEFAULT_TARGETS.kcal,
        prot: parseInt(document.getElementById("tProtIn").value) || DEFAULT_TARGETS.prot,
        co2: parseInt(document.getElementById("tCO2In").value) || DEFAULT_TARGETS.co2
      };
      await saveSettings(targets);
      render();
    });
  });

  // Sicherung
  document.getElementById("exportData").addEventListener("click", exportBackup);
  document.getElementById("importFile").addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    const result = document.getElementById("importResult");
    result.textContent = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        showImportPanel(parseBackup(String(reader.result)), file.name);
      } catch (err) {
        pendingImport = null;
        document.getElementById("importPanel").style.display = "none";
        result.textContent = `Diese Datei konnte ich nicht einlesen: ${err.message}`;
      }
    };
    reader.onerror = () => { result.textContent = "Die Datei konnte nicht gelesen werden."; };
    reader.readAsText(file);
  });
  document.getElementById("backupDetails").addEventListener("toggle", renderBackupInfo);
  document.getElementById("importMerge").addEventListener("click", () => applyImport(false));
  document.getElementById("importReplace").addEventListener("click", () => applyImport(true));

  document.getElementById("foodStatus").textContent = defaultFoodStatus();
  document.getElementById("updateNow").addEventListener("click", () => location.reload());
}

// ---------- Neue Fassung erkennen ----------
// Eine geöffnete App (vor allem auf dem Handy-Startbildschirm) lädt Neuerungen nicht von selbst.
// Darum regelmäßig nachsehen, ob index.html auf eine neuere app.js verweist, und dann einen Knopf anbieten.
const LOADED_VERSION = (() => {
  const script = [...document.scripts].find(s => /app\.js\?v=/.test(s.src));
  return script ? script.src.match(/app\.js\?v=(\d+)/)[1] : "";
})();
let lastUpdateCheck = 0;

async function checkForUpdate() {
  if (location.protocol === "file:" || Date.now() - lastUpdateCheck < 60000) return;
  lastUpdateCheck = Date.now();
  try {
    const html = await (await fetch("./index.html", {cache: "no-store"})).text();
    const match = html.match(/app\.js\?v=(\d+)/);
    if (match && LOADED_VERSION && match[1] !== LOADED_VERSION) {
      document.getElementById("updateBanner").style.display = "";
    }
  } catch (e) { /* offline – später erneut */ }
}

function showVersion() {
  const el = document.getElementById("appVersion");
  if (el) el.textContent = `Fassung ${LOADED_VERSION || "?"}`;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkForUpdate();
});

init();
showVersion();
setTimeout(checkForUpdate, 3000);

// Offline-Unterstützung nur dort, wo der Browser sie erlaubt (https oder localhost).
if ("serviceWorker" in navigator && window.isSecureContext && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(error => {
    console.warn("Service Worker konnte nicht registriert werden.", error);
  });
}
