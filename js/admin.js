// ============================================================================
// PAINEL ADMIN
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, push, remove
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

import { firebaseConfig, TOURNAMENT_CONFIG } from "./firebase-config.js";
import {
  hashPassword, verifyPassword, randomSalt,
  getAdminSession, saveAdminSession, clearAdminSession, validateUsername, validatePassword
} from "./auth.js";
import { STAGES, DEFAULT_TEAMS, fmtDateShort, fmtDateTime } from "./fixture.js";
import { DEFAULT_SCORING } from "./scoring.js";
import { fetchFifaMatches, fetchFifaResults, fifaMatchKey } from "./fifa-sync.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const state = {
  session: null,
  config: { ...TOURNAMENT_CONFIG },
  matches: {},
  results: {},
  users: {},
  teams: {},
  scoringRules: { ...DEFAULT_SCORING },
  tournamentResult: {},
  resultsStageFilter: "all"
};

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function showView(id) {
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function showTab(name) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $$(".tab-panel").forEach(p => p.classList.toggle("active", p.id === `tab-${name}`));
}

function toast(msg, type = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2800);
}

// ---------- Auth admin ----------
async function tryAdminLogin(username, password) {
  const snap = await get(ref(db, `users/${username}`));
  if (!snap.exists()) throw new Error("Credenciais inválidas");
  const u = snap.val();
  if (!u.isAdmin) throw new Error("Esta conta não é admin");
  const ok = await verifyPassword(password, u.salt, u.passwordHash);
  if (!ok) throw new Error("Credenciais inválidas");
  saveAdminSession({ username: u.username, name: u.name });
  state.session = { username: u.username, name: u.name };
}

function adminLogout() {
  clearAdminSession();
  location.reload();
}

// ---------- Listeners ----------
function startListeners() {
  onValue(ref(db, "config"),         s => { state.config = { ...TOURNAMENT_CONFIG, ...(s.val() || {}) }; fillConfigForm(); });
  onValue(ref(db, "users"),          s => { state.users = s.val() || {}; renderUsers(); });
  onValue(ref(db, "matches"),        s => { state.matches = s.val() || {}; renderMatches(); renderResults(); });
  onValue(ref(db, "results"),        s => { state.results = s.val() || {}; renderResults(); });
  onValue(ref(db, "teams"),          s => { state.teams = s.val() || {}; populateChampionDropdowns(); });
  onValue(ref(db, "scoringRules"),   s => { state.scoringRules = s.exists() ? { ...DEFAULT_SCORING, ...s.val() } : { ...DEFAULT_SCORING }; fillScoringForm(); });
  onValue(ref(db, "tournamentResult"), s => { state.tournamentResult = s.val() || {}; fillTournamentResult(); });
}

// ---------- USUÁRIOS ----------
function renderUsers() {
  const list = $("#users-list");
  const arr = Object.values(state.users).sort((a, b) => a.username.localeCompare(b.username));
  if (arr.length === 0) {
    list.innerHTML = `<p class="empty">Nenhum usuário cadastrado.</p>`;
    return;
  }
  list.innerHTML = arr.map(u => `
    <article class="user-card">
      <div class="user-info">
        <strong>${u.name}</strong>
        <span class="muted">@${u.username} · ${u.email || "(sem e-mail)"}</span>
        ${u.isAdmin ? `<span class="badge badge-admin">admin</span>` : ""}
      </div>
      <div class="user-actions">
        <button class="btn btn-small" data-action="rename" data-user="${u.username}">Renomear</button>
        <button class="btn btn-small" data-action="passwd" data-user="${u.username}">Trocar senha</button>
        <button class="btn btn-small btn-danger" data-action="delete" data-user="${u.username}">Excluir</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => userAction(btn.dataset.action, btn.dataset.user));
  });
}

async function userAction(action, username) {
  const u = state.users[username];
  if (!u) return;

  if (action === "rename") {
    const novo = prompt(`Novo usuário para ${u.name}:`, u.username);
    if (!novo || novo === username) return;
    const v = validateUsername(novo); if (!v.ok) { toast(v.msg, "error"); return; }
    if (state.users[novo]) { toast("Usuário já existe", "error"); return; }

    // Copia tudo (incluindo palpites e championGuess) para o novo username
    const updates = {};
    updates[`users/${novo}`]   = { ...u, username: novo };
    updates[`users/${username}`] = null;

    const p = await get(ref(db, `palpites/${username}`));
    if (p.exists()) {
      updates[`palpites/${novo}`] = p.val();
      updates[`palpites/${username}`] = null;
    }
    const cg = await get(ref(db, `championGuesses/${username}`));
    if (cg.exists()) {
      updates[`championGuesses/${novo}`] = cg.val();
      updates[`championGuesses/${username}`] = null;
    }
    await update(ref(db), updates);
    toast("Usuário renomeado ✓", "success");
  }

  if (action === "passwd") {
    const nova = prompt(`Nova senha para @${username}:`);
    if (!nova) return;
    const v = validatePassword(nova); if (!v.ok) { toast(v.msg, "error"); return; }
    const salt = randomSalt();
    const passwordHash = await hashPassword(nova, salt);
    await update(ref(db, `users/${username}`), { salt, passwordHash });
    toast("Senha alterada ✓", "success");
  }

  if (action === "delete") {
    if (!confirm(`Excluir @${username}? Os palpites também serão removidos.`)) return;
    const updates = {};
    updates[`users/${username}`] = null;
    updates[`palpites/${username}`] = null;
    updates[`championGuesses/${username}`] = null;
    await update(ref(db), updates);
    toast("Usuário excluído ✓", "success");
  }
}

// ---------- JOGOS ----------
function renderMatches() {
  const list = $("#matches-list");
  const arr = Object.entries(state.matches)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => {
      const dA = a.datetime ? new Date(a.datetime).getTime() : Infinity;
      const dB = b.datetime ? new Date(b.datetime).getTime() : Infinity;
      return dA - dB;
    });

  if (arr.length === 0) {
    list.innerHTML = `<p class="empty">Nenhum jogo. Adicione ou importe acima.</p>`;
    return;
  }

  list.innerHTML = arr.map(m => `
    <article class="match-card">
      <div class="match-head">
        <span class="match-stage">${STAGES[m.stage]?.short || m.stage}${m.group ? " · Grupo " + m.group : ""}</span>
        <span class="match-date">${fmtDateTime(m.datetime)}</span>
      </div>
      <div class="match-row">
        <div class="team team-left"><span class="flag">${m.team1Flag || ""}</span><span class="team-name">${m.team1Name || m.team1}</span></div>
        <div class="result-display"><span class="vs muted">vs</span></div>
        <div class="team team-right"><span class="team-name">${m.team2Name || m.team2}</span><span class="flag">${m.team2Flag || ""}</span></div>
      </div>
      <div class="match-foot">
        <span class="muted">${m.venue || ""}</span>
        <button class="btn btn-small btn-danger" data-del="${m.id}">Excluir</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este jogo? Resultado e palpites associados continuam, mas deixam de pontuar.")) return;
      await update(ref(db), {
        [`matches/${btn.dataset.del}`]: null,
        [`results/${btn.dataset.del}`]: null
      });
      toast("Jogo excluído ✓", "success");
    });
  });
}

async function addMatch(formData) {
  const m = {
    stage: formData.get("stage"),
    group: (formData.get("group") || "").toUpperCase() || null,
    team1: formData.get("team1").toUpperCase(),
    team1Name: formData.get("team1Name"),
    team1Flag: formData.get("team1Flag") || "",
    team2: formData.get("team2").toUpperCase(),
    team2Name: formData.get("team2Name"),
    team2Flag: formData.get("team2Flag") || "",
    datetime: localDatetimeToISO(formData.get("datetime")),
    venue: formData.get("venue") || ""
  };
  const node = push(ref(db, "matches"));
  await set(node, m);
  // Garante que os times estão no /teams
  const updates = {};
  if (!state.teams[m.team1]) updates[`teams/${m.team1}`] = { name: m.team1Name, flag: m.team1Flag };
  if (!state.teams[m.team2]) updates[`teams/${m.team2}`] = { name: m.team2Name, flag: m.team2Flag };
  if (Object.keys(updates).length) await update(ref(db), updates);
  toast("Jogo adicionado ✓", "success");
}

// converte do input datetime-local (sem timezone) para ISO em -03:00
function localDatetimeToISO(local) {
  if (!local) return null;
  return `${local}:00-03:00`;
}

async function bulkImport(jsonText) {
  let arr;
  try {
    arr = JSON.parse(jsonText);
  } catch (e) {
    toast("JSON inválido", "error"); return;
  }
  if (!Array.isArray(arr)) { toast("Esperava um array", "error"); return; }
  let count = 0;
  const teamUpdates = {};
  const matchUpdates = {};
  for (const m of arr) {
    if (!m.stage || !m.team1 || !m.team2 || !m.datetime) continue;
    const key = push(ref(db, "matches")).key;
    matchUpdates[`matches/${key}`] = {
      stage: m.stage,
      group: m.group || null,
      team1: String(m.team1).toUpperCase(),
      team1Name: m.team1Name || m.team1,
      team1Flag: m.team1Flag || "",
      team2: String(m.team2).toUpperCase(),
      team2Name: m.team2Name || m.team2,
      team2Flag: m.team2Flag || "",
      datetime: m.datetime,
      venue: m.venue || ""
    };
    if (!state.teams[m.team1]) teamUpdates[`teams/${String(m.team1).toUpperCase()}`] = { name: m.team1Name || m.team1, flag: m.team1Flag || "" };
    if (!state.teams[m.team2]) teamUpdates[`teams/${String(m.team2).toUpperCase()}`] = { name: m.team2Name || m.team2, flag: m.team2Flag || "" };
    count++;
  }
  await update(ref(db), { ...matchUpdates, ...teamUpdates });
  toast(`${count} jogo(s) importado(s) ✓`, "success");
}

// ---------- SINCRONIZAÇÃO COM A FIFA ----------
async function importFromFifa() {
  const btn = $("#fifa-import-btn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando na FIFA…";
  try {
    const matches = await fetchFifaMatches();
    const matchUpdates = {};
    const teamUpdates = {};
    let novos = 0, atualizados = 0;

    for (const m of matches) {
      const key = fifaMatchKey(m.fifaId); // chave estável → re-sync não duplica
      if (state.matches[key]) atualizados++; else novos++;

      matchUpdates[`matches/${key}`] = {
        fifaId: m.fifaId,
        matchNumber: m.matchNumber,
        stage: m.stage,
        group: m.group || null,
        team1: m.team1,
        team1Name: m.team1Name,
        team1Flag: m.team1Flag,
        team2: m.team2,
        team2Name: m.team2Name,
        team2Flag: m.team2Flag,
        datetime: m.datetime,
        venue: m.venue || ""
      };
      // Cadastra seleções definidas no /teams (para o dropdown de campeão)
      if (m.teamsDefined) {
        if (m.team1Flag || !state.teams[m.team1])
          teamUpdates[`teams/${m.team1}`] = { name: m.team1Name, flag: m.team1Flag };
        if (m.team2Flag || !state.teams[m.team2])
          teamUpdates[`teams/${m.team2}`] = { name: m.team2Name, flag: m.team2Flag };
      }
    }
    await update(ref(db), { ...matchUpdates, ...teamUpdates });
    toast(`FIFA: ${novos} novo(s), ${atualizados} atualizado(s) ✓`, "success");
  } catch (e) {
    console.error(e);
    toast(`Falha ao importar da FIFA: ${e.message}. Use o lançamento manual.`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function syncFifaResults() {
  const btn = $("#fifa-results-btn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando placares…";
  try {
    const fifaResults = await fetchFifaResults(); // { fifaId: {score1,score2,...} }
    const updates = {};
    let count = 0;

    for (const [matchKey, match] of Object.entries(state.matches)) {
      if (!match.fifaId) continue; // só jogos vindos da FIFA
      const r = fifaResults[match.fifaId];
      if (!r) continue;
      const existing = state.results[matchKey];
      // Não sobrescreve um placar que o admin já corrigiu para outro valor,
      // a menos que ainda não exista resultado.
      if (existing && existing.manualOverride) continue;
      updates[`results/${matchKey}`] = {
        score1: r.score1,
        score2: r.score2,
        pen1: r.pen1 ?? null,
        pen2: r.pen2 ?? null,
        source: "fifa",
        enteredAt: Date.now()
      };
      count++;
    }

    if (count === 0) {
      toast("Nenhum placar novo encerrado na FIFA ainda", "info");
    } else {
      await update(ref(db), updates);
      toast(`${count} resultado(s) sincronizado(s) da FIFA ✓`, "success");
    }
  } catch (e) {
    console.error(e);
    toast(`Falha ao sincronizar: ${e.message}. Lance manualmente.`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------- RESULTADOS ----------
function renderResults() {
  const list = $("#results-list");
  const arr = Object.entries(state.matches)
    .map(([id, m]) => ({ id, ...m }))
    .filter(m => state.resultsStageFilter === "all" || m.stage === state.resultsStageFilter)
    .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

  renderResultsStageFilter();

  if (arr.length === 0) {
    list.innerHTML = `<p class="empty">Sem jogos.</p>`;
    return;
  }
  list.innerHTML = arr.map(m => {
    const r = state.results[m.id] || {};
    return `
      <article class="match-card">
        <div class="match-head">
          <span class="match-stage">${STAGES[m.stage]?.short || m.stage}${m.group ? " · Grupo " + m.group : ""}</span>
          <span class="match-date">${fmtDateShort(m.datetime)}</span>
        </div>
        <div class="match-row">
          <div class="team team-left"><span class="flag">${m.team1Flag || ""}</span><span class="team-name">${m.team1Name || m.team1}</span></div>
          <div class="score-input">
            <input type="number" min="0" data-result="${m.id}" data-side="1" value="${r.score1 ?? ""}">
            <span class="vs">×</span>
            <input type="number" min="0" data-result="${m.id}" data-side="2" value="${r.score2 ?? ""}">
          </div>
          <div class="team team-right"><span class="team-name">${m.team2Name || m.team2}</span><span class="flag">${m.team2Flag || ""}</span></div>
        </div>
        <div class="match-foot">
          <button class="btn btn-small btn-primary" data-save-result="${m.id}">Salvar resultado</button>
          ${r.score1 != null ? `<button class="btn btn-small btn-danger" data-clear-result="${m.id}">Limpar</button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("button[data-save-result]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.saveResult;
      const s1 = list.querySelector(`input[data-result="${id}"][data-side="1"]`).value;
      const s2 = list.querySelector(`input[data-result="${id}"][data-side="2"]`).value;
      if (s1 === "" || s2 === "") { toast("Preencha os dois placares", "error"); return; }
      set(ref(db, `results/${id}`), {
        score1: Number(s1), score2: Number(s2),
        source: "manual",
        manualOverride: true,
        enteredAt: Date.now()
      });
      toast("Resultado salvo ✓", "success");
    });
  });
  list.querySelectorAll("button[data-clear-result]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("Limpar este resultado?")) return;
      set(ref(db, `results/${btn.dataset.clearResult}`), null);
      toast("Resultado removido", "info");
    });
  });
}

function renderResultsStageFilter() {
  const el = $("#results-stage-filter");
  if (!el) return;
  const present = new Set(Object.values(state.matches).map(m => m.stage));
  const ordered = Array.from(present).sort((a, b) => (STAGES[a]?.order || 99) - (STAGES[b]?.order || 99));
  el.innerHTML = "";
  const mk = (val, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "chip" + (state.resultsStageFilter === val ? " active" : "");
    b.onclick = () => { state.resultsStageFilter = val; renderResults(); };
    return b;
  };
  el.appendChild(mk("all", "Todos"));
  ordered.forEach(s => el.appendChild(mk(s, STAGES[s]?.short || s)));
}

function populateChampionDropdowns() {
  const teams = Object.keys(state.teams).length
    ? Object.entries(state.teams).map(([code, t]) => ({ code, ...t }))
    : DEFAULT_TEAMS;
  const opts = teams
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(t => `<option value="${t.code}">${t.flag || ""} ${t.name}</option>`).join("");
  const form = $("#form-tournament-result");
  if (!form) return;
  form.champion.innerHTML = `<option value="">—</option>${opts}`;
  form.runnerUp.innerHTML = `<option value="">—</option>${opts}`;
  fillTournamentResult();
}

function fillTournamentResult() {
  const form = $("#form-tournament-result");
  if (!form) return;
  form.champion.value = state.tournamentResult.champion || "";
  form.runnerUp.value = state.tournamentResult.runnerUp || "";
}

// ---------- PONTUAÇÃO ----------
function fillScoringForm() {
  const form = $("#form-scoring");
  if (!form) return;
  for (const k of Object.keys(state.scoringRules)) {
    if (form[k]) form[k].value = state.scoringRules[k];
  }
}

// ---------- CONFIG ----------
function fillConfigForm() {
  const form = $("#form-config");
  if (!form) return;
  form.tournamentStart.value = isoToLocalDatetime(state.config.tournamentStart);
  form.r32Start.value        = isoToLocalDatetime(state.config.r32Start);
  form.quartersStart.value   = isoToLocalDatetime(state.config.quartersStart);
  form.corporateEmailDomains.value = (state.config.corporateEmailDomains || []).join(", ");
}

function isoToLocalDatetime(iso) {
  if (!iso) return "";
  // Remove timezone offset, mantém data/hora
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Boot ----------
function boot() {
  $$(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

  $("#form-admin-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#admin-login-error"); err.textContent = "";
    const fd = new FormData(e.target);
    try {
      await tryAdminLogin(fd.get("username").trim(), fd.get("password"));
      enterAdmin();
    } catch (ex) { err.textContent = ex.message; }
  });

  $("#admin-logout-btn").addEventListener("click", adminLogout);

  $("#form-add-match").addEventListener("submit", async (e) => {
    e.preventDefault();
    await addMatch(new FormData(e.target));
    e.target.reset();
  });

  $("#bulk-import-btn").addEventListener("click", () => bulkImport($("#bulk-json").value));

  $("#fifa-import-btn").addEventListener("click", importFromFifa);
  $("#fifa-results-btn").addEventListener("click", syncFifaResults);

  $("#form-tournament-result").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await set(ref(db, "tournamentResult"), {
      champion: fd.get("champion") || null,
      runnerUp: fd.get("runnerUp") || null
    });
    toast("Resultado do torneio salvo ✓", "success");
  });

  $("#form-scoring").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rules = {};
    for (const k of Object.keys(DEFAULT_SCORING)) rules[k] = Number(fd.get(k));
    await set(ref(db, "scoringRules"), rules);
    toast("Regras atualizadas ✓", "success");
  });

  $("#form-config").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const domains = (fd.get("corporateEmailDomains") || "")
      .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    await set(ref(db, "config"), {
      tournamentStart: `${fd.get("tournamentStart")}:00-03:00`,
      r32Start:        `${fd.get("r32Start")}:00-03:00`,
      quartersStart:   `${fd.get("quartersStart")}:00-03:00`,
      corporateEmailDomains: domains
    });
    toast("Configurações salvas ✓", "success");
  });

  const s = getAdminSession();
  if (s) { state.session = s; enterAdmin(); }
  else   { showView("view-admin-login"); }
}

function enterAdmin() {
  showView("view-admin-app");
  $("#admin-display").textContent = state.session.name + " · @" + state.session.username;
  startListeners();
}

boot();
