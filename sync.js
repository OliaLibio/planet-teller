// Planet Teller – Abgleich zwischen Mac und Handy über Supabase.
// -----------------------------------------------------------------------------
// Jeder Speicherwert der App („mein-tag:2026-11-23“, Profil, Ziele …) wird als eine Zeile
// in der Tabelle planet_daten gespeichert. Nur die angemeldete Person kann ihre Zeilen
// lesen und schreiben (Row Level Security in Supabase, siehe supabase-einrichtung.sql).
//
// Regeln beim Zusammenführen:
//  - Tage: Einträge beider Geräte werden vereinigt (über die Kennung „id“);
//    gelöschte Einträge (mein-tag-deleted) bleiben gelöscht.
//  - Gelöscht-Liste: wird vereinigt.
//  - Profil, Ziele, Vorlieben, gemerkte Lebensmittel: die zuletzt gespeicherte Fassung gilt.
//    Beim allerersten Abgleich eines Geräts gilt die Fassung, die schon online liegt.
//  - Die Gesundheitsnotiz verlässt das Gerät nie.
//
// Ohne Einrichtung (leere SYNC_CONFIG) oder ohne Internet läuft die App normal weiter.

const SYNC_CONFIG = {
  url: "",   // z. B. https://abcdefgh.supabase.co
  key: ""    // „Publishable key“ bzw. „anon public“ – darf öffentlich sein, Schutz übernimmt die Tabellen-Regel
};
const SYNC_LIB = {
  src: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js",
  integrity: "sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R"
};
const SYNC_TABLE = "planet_daten";
const SYNC_DIRTY_KEY = "pt-sync-offen";      // noch nicht hochgeladene Änderungen
const SYNC_PULL_KEY = "pt-sync-stand";       // Zeitstempel der zuletzt geholten Online-Änderung
const SYNC_OK_KEY = "pt-sync-zuletzt";       // wann zuletzt erfolgreich abgeglichen

function syncableKey(key) {
  return typeof key === "string" && key.startsWith(ALL_KEYS_PREFIX) && key !== BACKUP_INFO_KEY;
}

function rawJson(key) {
  try {
    const value = readStoredValue(key);
    return value === null ? undefined : JSON.parse(value);
  } catch (e) { return undefined; }
}

function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Tage zusammenführen: Vereinigung über die Kennung, Gelöschtes raus, sortiert nach Zeitpunkt.
function mergeDayLists(storageKey, local, remote, tombs) {
  const result = [];
  const seen = new Set();
  const add = list => ensureEntryIds(storageKey, Array.isArray(list) ? list : []).forEach((e, i) => {
    if (!e || !e.id || seen.has(e.id) || tombs[e.id]) return;
    seen.add(e.id);
    result.push({e, order: result.length});
  });
  add(local);
  add(remote);
  result.sort((a, b) => ((a.e.t || 0) - (b.e.t || 0)) || (a.order - b.order));
  return result.map(x => x.e);
}

function stripPrivate(key, value) {
  if (key === PROFILE_KEY && value && typeof value === "object") {
    const copy = {...value};
    delete copy.healthNote;
    return copy;
  }
  return value;
}

const PlanetSync = {
  client: null,
  user: null,
  busy: false,
  again: false,
  timer: null,
  state: "aus",   // aus | laden | offline | abgemeldet | bereit | laeuft | fehler
  message: "",

  configured() { return !!(SYNC_CONFIG.url && SYNC_CONFIG.key); },

  // ---- Merken, was sich geändert hat ----
  readDirty() {
    try { return JSON.parse(localStorage.getItem(SYNC_DIRTY_KEY) || "{}") || {}; } catch (e) { return {}; }
  },
  writeDirty(dirty) {
    try { localStorage.setItem(SYNC_DIRTY_KEY, JSON.stringify(dirty)); } catch (e) { /* ignorieren */ }
  },
  markDirty(key) {
    if (!syncableKey(key)) return;
    const dirty = this.readDirty();
    dirty[key] = (dirty[key] || 0) + 1;
    this.writeDirty(dirty);
    if (this.user && !this.busy) { // während eines laufenden Abgleichs nicht neu planen

      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.syncNow(), 2000);
    }
    this.render();
  },

  // ---- Start ----
  start() {
    this.render();
    if (!this.configured()) return;
    this.state = "laden";
    this.render();
    const script = document.createElement("script");
    script.src = SYNC_LIB.src;
    script.integrity = SYNC_LIB.integrity;
    script.crossOrigin = "anonymous";
    script.onload = () => this.connect();
    script.onerror = () => { this.state = "offline"; this.render(); };
    document.head.appendChild(script);
    window.addEventListener("online", () => { if (!this.client) this.start(); else this.syncNow(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.user) this.syncNow();
    });
  },

  connect() {
    if (this.client || !window.supabase) return;
    this.client = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.key, {
      auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "pt-anmeldung"}
    });
    this.client.auth.onAuthStateChange((event, session) => {
      const before = this.user && this.user.id;
      this.user = session ? session.user : null;
      this.state = this.user ? "bereit" : "abgemeldet";
      this.render();
      if (this.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION") && before !== this.user.id) {
        setTimeout(() => this.syncNow(), 0);
      }
    });
  },

  // ---- Abgleich ----
  async syncNow() {
    if (!this.client || !this.user) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    this.state = "laeuft";
    this.render();
    try {
      const changed = await this.pull();
      await this.push();
      localStorage.setItem(SYNC_OK_KEY, new Date().toISOString());
      this.state = "bereit";
      this.message = "";
      if (changed && typeof reloadFromStorage === "function") await reloadFromStorage();
    } catch (e) {
      console.warn("Abgleich fehlgeschlagen", e);
      this.state = "fehler";
      this.message = navigator.onLine === false
        ? "Keine Internetverbindung. Deine Einträge sind auf diesem Gerät gespeichert und werden später abgeglichen."
        : "Der Abgleich hat gerade nicht geklappt. Deine Einträge sind auf diesem Gerät sicher; ich versuche es beim nächsten Öffnen erneut.";
    } finally {
      this.busy = false;
      this.render();
      if (this.again) { this.again = false; setTimeout(() => this.syncNow(), 500); }
    }
  },

  async fetchRemote(since) {
    const rows = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      let query = this.client.from(SYNC_TABLE).select("key,value,updated_at").order("updated_at", {ascending: true}).range(from, from + pageSize - 1);
      if (since) query = query.gt("updated_at", since);
      const {data, error} = await query;
      if (error) throw error;
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    return rows;
  },

  async pull() {
    const since = localStorage.getItem(SYNC_PULL_KEY);
    const firstSync = !since;
    const rows = await this.fetchRemote(since);
    const dirty = this.readDirty();
    let changed = false;
    let newest = since || "";

    // Gelöscht-Liste zuerst, damit sie beim Zusammenführen der Tage schon gilt.
    rows.sort((a, b) => (b.key === TOMBSTONE_KEY) - (a.key === TOMBSTONE_KEY));
    const remoteKeys = new Set();

    for (const row of rows) {
      if (row.updated_at > newest) newest = row.updated_at;
      if (!syncableKey(row.key)) continue;
      remoteKeys.add(row.key);
      const local = rawJson(row.key);
      let next;

      if (row.key === TOMBSTONE_KEY) {
        next = {...(row.value || {}), ...(local || {})};
      } else if (row.key.startsWith(KEY_PREFIX)) {
        next = mergeDayLists(row.key, local, row.value, readTombstones());
      } else if (!firstSync && dirty[row.key]) {
        continue; // hier auf dem Gerät neuer geändert – wird gleich hochgeladen
      } else {
        next = row.value;
        if (row.key === PROFILE_KEY && local && local.healthNote) next = {...next, healthNote: local.healthNote};
      }

      if (!sameJson(next, local)) {
        writeStoredValue(row.key, JSON.stringify(next), true);
        changed = true;
      }
      if (!sameJson(stripPrivate(row.key, next), row.value)) this.markDirty(row.key);
      else if (!row.key.startsWith(KEY_PREFIX) && row.key !== TOMBSTONE_KEY && firstSync) {
        const d = this.readDirty(); delete d[row.key]; this.writeDirty(d); // Online-Fassung übernommen
      }
    }

    // Beim ersten Abgleich alles hochladen, was online noch fehlt (z. B. alte Tage von diesem Gerät).
    if (firstSync) {
      allStoredKeys().filter(syncableKey).forEach(key => {
        if (!remoteKeys.has(key)) this.markDirty(key);
      });
    }
    if (newest) localStorage.setItem(SYNC_PULL_KEY, newest);
    return changed;
  },

  async push() {
    const snapshot = this.readDirty();
    const keys = Object.keys(snapshot).filter(syncableKey);
    if (!keys.length) return;
    const rows = keys
      .map(key => ({user_id: this.user.id, key, value: stripPrivate(key, rawJson(key))}))
      .filter(row => row.value !== undefined);
    for (let i = 0; i < rows.length; i += 200) {
      const {error} = await this.client.from(SYNC_TABLE).upsert(rows.slice(i, i + 200), {onConflict: "user_id,key"});
      if (error) throw error;
    }
    const dirty = this.readDirty();
    keys.forEach(key => { if (dirty[key] === snapshot[key]) delete dirty[key]; });
    this.writeDirty(dirty);
  },

  // ---- Anmeldung ----
  async signIn(email, password) {
    const {error} = await this.client.auth.signInWithPassword({email, password});
    return error ? this.explain(error) : "";
  },
  async signUp(email, password) {
    const {data, error} = await this.client.auth.signUp({
      email, password, options: {emailRedirectTo: location.origin + location.pathname}
    });
    if (error) return this.explain(error);
    return data.session ? "" : "Fast geschafft: Öffne den Link in der E-Mail, die gerade an dich unterwegs ist. Danach meldest du dich hier mit E-Mail und Passwort an.";
  },
  async signOut() {
    await this.client.auth.signOut();
    localStorage.removeItem(SYNC_PULL_KEY);
    localStorage.removeItem(SYNC_OK_KEY);
  },
  explain(error) {
    const text = String(error && error.message || error);
    if (/invalid login credentials/i.test(text)) return "E-Mail oder Passwort stimmt nicht.";
    if (/email not confirmed/i.test(text)) return "Bitte öffne zuerst den Link in der Bestätigungs-E-Mail.";
    if (/already registered|already exists/i.test(text)) return "Für diese E-Mail gibt es schon ein Konto – bitte „Anmelden“ nutzen.";
    if (/password should be|weak password/i.test(text)) return "Das Passwort ist zu kurz oder zu einfach (mindestens 8 Zeichen).";
    if (/signups not allowed|signup.*disabled/i.test(text)) return "Neue Konten sind abgeschaltet. Bitte mit dem bestehenden Konto anmelden.";
    if (/rate limit/i.test(text)) return "Zu viele Versuche – bitte kurz warten.";
    return "Das hat nicht geklappt: " + text;
  },

  // ---- Anzeige ----
  render() {
    const box = document.getElementById("syncBox");
    const badge = document.getElementById("syncBadge");
    if (!box) return;
    const pending = Object.keys(this.readDirty()).length;
    const last = localStorage.getItem(SYNC_OK_KEY);
    const lastText = last ? new Date(last).toLocaleString("de-DE", {day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit"}) : "";

    if (badge) {
      const labels = {
        laeuft: "Gleiche ab …",
        bereit: pending ? "Änderungen warten auf Abgleich" : (lastText ? `Mit allen Geräten abgeglichen · ${lastText}` : "Angemeldet"),
        fehler: "Abgleich gerade nicht möglich – Daten sind auf diesem Gerät sicher",
        offline: "Offline – Daten sind auf diesem Gerät sicher"
      };
      badge.textContent = labels[this.state] || "";
      badge.style.display = labels[this.state] ? "" : "none";
    }

    if (!this.configured()) {
      box.dataset.view = "";
      box.innerHTML = '<div>Der Abgleich ist noch nicht eingerichtet. Bis dahin bleiben deine Einträge nur auf diesem Gerät.</div>';
      return;
    }
    if (this.state === "laden") { box.dataset.view = ""; box.innerHTML = "<div>Verbinde …</div>"; return; }
    if (this.state === "offline" || !this.client) {
      box.dataset.view = "";
      box.innerHTML = "<div>Der Abgleich ist gerade nicht erreichbar (keine Internetverbindung?). Deine Einträge bleiben auf diesem Gerät gespeichert.</div>";
      return;
    }
    if (!this.user) {
      if (box.dataset.view === "login") return; // Formular nicht beim Tippen neu aufbauen
      box.dataset.view = "login";
      box.innerHTML = `
        <div>Melde dich auf jedem Gerät einmal an. Danach siehst du überall dieselben Einträge. Deine Gesundheitsnotiz bleibt nur auf dem jeweiligen Gerät.</div>
        <form id="syncForm" class="sync-form" autocomplete="on">
          <input type="email" id="syncEmail" autocomplete="username" placeholder="E-Mail" required>
          <input type="password" id="syncPassword" autocomplete="current-password" placeholder="Passwort (mind. 8 Zeichen)" minlength="8" required>
          <div class="backup-row">
            <button class="btn" type="submit" data-action="login">Anmelden</button>
            <button class="btn ghost" type="button" data-action="signup">Konto anlegen</button>
          </div>
        </form>
        <div id="syncMessage" class="sync-message"></div>`;
      return;
    }
    box.dataset.view = "user";
    box.innerHTML = `
      <div>Angemeldet als <strong>${escapeHtml(this.user.email || "")}</strong>. Einträge, Ziele, Profil und Vorlieben werden automatisch mit deinen anderen Geräten abgeglichen.</div>
      <div>${lastText ? `Zuletzt abgeglichen: ${escapeHtml(lastText)}` : "Noch nicht abgeglichen."}${pending ? ` · ${pending} Änderung(en) warten` : ""}</div>
      ${this.message ? `<div class="sync-message">${escapeHtml(this.message)}</div>` : ""}
      <div class="backup-row">
        <button class="btn" type="button" data-action="sync" ${this.state === "laeuft" ? "disabled" : ""}>${this.state === "laeuft" ? "Gleiche ab …" : "Jetzt abgleichen"}</button>
        <button class="btn ghost" type="button" data-action="logout">Abmelden</button>
      </div>`;
  },

  bindUi() {
    const box = document.getElementById("syncBox");
    if (!box) return;
    const say = text => { const m = document.getElementById("syncMessage"); if (m) m.textContent = text; };
    const credentials = () => ({
      email: (document.getElementById("syncEmail") || {}).value || "",
      password: (document.getElementById("syncPassword") || {}).value || ""
    });
    box.addEventListener("submit", async e => {
      e.preventDefault();
      const {email, password} = credentials();
      say("Melde an …");
      say(await this.signIn(email.trim(), password));
    });
    box.addEventListener("click", async e => {
      const button = e.target.closest("[data-action]");
      if (!button || !this.client) return;
      const action = button.dataset.action;
      if (action === "signup") {
        const {email, password} = credentials();
        if (!email.includes("@") || password.length < 8) { say("Bitte E-Mail und ein Passwort mit mindestens 8 Zeichen eingeben."); return; }
        say("Lege Konto an …");
        say(await this.signUp(email.trim(), password));
      } else if (action === "sync") {
        this.syncNow();
      } else if (action === "logout") {
        if (!confirm("Abmelden? Deine Einträge bleiben auf diesem Gerät, werden aber nicht mehr abgeglichen, bis du dich wieder anmeldest.")) return;
        await this.signOut();
      }
    });
  }
};

window.PlanetSync = PlanetSync;
PlanetSync.bindUi();
PlanetSync.start();
