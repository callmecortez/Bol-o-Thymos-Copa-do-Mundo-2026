// ============================================================================
// APP PRINCIPAL (usuário)
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getDatabase, ref, set, get, update, onValue, serverTimestamp, child
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

import { firebaseConfig, TOURNAMENT_CONFIG } from "./firebase-config.js";
import {
  hashPassword, verifyPassword, randomSalt,
  getSession, saveSession, clearSession,
  validateCorporateEmail, validateUsername, validatePassword
} from "./auth.js";
import {
  STAGES, DEFAULT_TEAMS, currentPhase, fmtDateTime, fmtDateShort, isMatchLocked
} from "./fixture.js";
import {
  scoreMatch, buildRanking, DEFAULT_SCORING
} from "./scoring.js";

// ---------- Firebase init ----------
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ---------- Estado global ----------
const state = {
  session: null,           // { username, name }
  config: TOURNAMENT_CONFIG,
  matches: {},             // { matchId: match }
  results: {},             // { matchId: result }
  palpites: {},             // palpites do usuário atual: { matchId: palpite }
  palpitesAll: {},          // todos os palpites (para revelar pós-deadline)
  users: {},
  championGuesses: {},
  championGuess: null,      // do usuário atual
  tournamentResult: {},
  scoringRules: { ...DEFAULT_SCORING },
  teams: {},
  activeTab: "palpites",
  stageFilter: "all"
};

// ---------- Utilidades de UI ----------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function showView(id) {
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#${id}`).classList.add("active");
}

function showTab(name) {
  state.activeTab = name;
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

// ---------- Fluxo de auth ----------
async function tryLogin(username, password) {
  const snap = await get(ref(db, `users/${username}`));
  if (!snap.exists()) throw new Error("Usuário ou senha inválidos");
  const u = snap.val();
  const ok = await verifyPassword(password, u.salt, u.passwordHash);
  if (!ok) throw new Error("Usuário ou senha inválidos");
  if (u.isAdmin) throw new Error("Conta de admin — use o painel admin");
  saveSession({ username: u.username, name: u.name });
  state.session = { username: u.username, name: u.name };
  return u;
}

async function tryRegister({ name, username, email, password }) {
  const vU = validateUsername(username); if (!vU.ok) throw new Error(vU.msg);
  const vP = validatePassword(password); if (!vP.ok) throw new Error(vP.msg);

  // Carrega config para validar domínio
  const cfgSnap = await get(ref(db, "config"));
  const cfg = cfgSnap.exists() ? cfgSnap.val() : TOURNAMENT_CONFIG;
  const domains = cfg.corporateEmailDomains || TOURNAMENT_CONFIG.corporateEmailDomains;
  const vE = validateCorporateEmail(email, domains);
  if (!vE.ok) throw new Error(vE.msg);

  // Checa duplicidade
  const exists = await get(ref(db, `users/${username}`));
  if (exists.exists()) throw new Error("Esse usuário já existe");

  const salt = randomSalt();
  const passwordHash = await hashPassword(password, salt);
  await set(ref(db, `users/${username}`), {
    username, name, email, salt, passwordHash,
    isAdmin: false,
    createdAt: Date.now()
  });

  saveSession({ username, name });
  state.session = { username, name };
}

function logout() {
  clearSession();
  state.session = null;
  location.reload();
}

// ---------- Carregamento de dados (real-time) ----------
function startListeners() {
  onValue(ref(db, "config"), s => {
    if (s.exists()) state.config = { ...TOURNAMENT_CONFIG, ...s.val() };
    renderActiveTab();
  });
  onValue(ref(db, "matches"), s => {
    state.matches = s.val() || {};
    renderActiveTab();
  });
  onValue(ref(db, "results"), s => {
    state.results = s.val() || {};
    renderActiveTab();
  });
  onValue(ref(db, "users"), s => {
    state.users = s.val() || {};
    renderActiveTab();
  });
  onValue(ref(db, "palpites"), s => {
    state.palpitesAll = s.val() || {};
    state.palpites = state.palpitesAll[state.session.username] || {};
    renderActiveTab();
  });
  onValue(ref(db, "championGuesses"), s => {
    state.championGuesses = s.val() || {};
    state.championGuess = state.championGuesses[state.session.username] || null;
    renderActiveTab();
  });
  onValue(ref(db, "tournamentResult"), s => {
    state.tournamentResult = s.val() || {};
    renderActiveTab();
  });
  onValue(ref(db, "scoringRules"), s => {
    state.scoringRules = s.exists() ? { ...DEFAULT_SCORING, ...s.val() } : { ...DEFAULT_SCORING };
    renderActiveTab();
  });
  onValue(ref(db, "teams"), s => {
    state.teams = s.val() || {};
    populateChampionDropdowns();
  });
}

// ---------- Render ----------
function renderActiveTab() {
  if (state.activeTab === "palpites")    renderPalpites();
  if (state.activeTab === "calendario")  renderCalendario();
  if (state.activeTab === "ranking")     renderRanking();
  if (state.activeTab === "campeao")     renderCampeao();
}

// ----- Palpites -----
function renderStageFilter() {
  const stagesPresent = new Set();
  Object.values(state.matches).forEach(m => stagesPresent.add(m.stage));
  const ordered = Array.from(stagesPresent)
    .sort((a, b) => (STAGES[a]?.order || 99) - (STAGES[b]?.order || 99));

  const el = $("#stage-filter");
  el.innerHTML = "";
  const mkBtn = (val, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "chip" + (state.stageFilter === val ? " active" : "");
    b.onclick = () => { state.stageFilter = val; renderPalpites(); renderCalendario(); };
    return b;
  };
  el.appendChild(mkBtn("all", "Todos"));
  ordered.forEach(s => el.appendChild(mkBtn(s, STAGES[s]?.short || s)));
}

function sortedMatches() {
  return Object.entries(state.matches)
    .map(([id, m]) => ({ id, ...m }))
    .filter(m => state.stageFilter === "all" || m.stage === state.stageFilter)
    .sort((a, b) => {
      const dA = a.datetime ? new Date(a.datetime).getTime() : Infinity;
      const dB = b.datetime ? new Date(b.datetime).getTime() : Infinity;
      return dA - dB;
    });
}

function renderPalpites() {
  // Guarda: se o usuário está digitando num input de palpite, não recria os
  // elementos (evita perda de digitação quando o listener do DB dispara).
  const active = document.activeElement;
  if (active && active.matches && active.matches("input[data-match]")) return;

  renderStageFilter();
  const list = $("#palpites-list");

  const matches = sortedMatches();
  if (matches.length === 0) {
    list.innerHTML = `<p class="empty">Nenhum jogo cadastrado ainda. O admin precisa adicionar os jogos.</p>`;
    return;
  }

  list.innerHTML = "";
  matches.forEach(m => {
    const palpite = state.palpites[m.id] || {};
    const locked = isMatchLocked(m) || palpite.submitted;
    const result = state.results[m.id];
    const card = document.createElement("article");
    card.className = "match-card" + (locked ? " locked" : "");

    const myScore = result ? scoreMatch(palpite, result, state.scoringRules) : null;

    card.innerHTML = `
      <div class="match-head">
        <span class="match-stage">${STAGES[m.stage]?.short || m.stage}${m.group ? " · Grupo " + m.group : ""}</span>
        <span class="match-date">${fmtDateShort(m.datetime)}</span>
      </div>
      <div class="match-row">
        <div class="team team-left">
          <span class="flag">${m.team1Flag || ""}</span>
          <span class="team-name">${m.team1Name || m.team1}</span>
        </div>
        <div class="score-input">
          <input type="number" min="0" max="20" data-match="${m.id}" data-side="1" value="${palpite.score1 ?? ""}" ${locked ? "disabled" : ""}>
          <span class="vs">×</span>
          <input type="number" min="0" max="20" data-match="${m.id}" data-side="2" value="${palpite.score2 ?? ""}" ${locked ? "disabled" : ""}>
        </div>
        <div class="team team-right">
          <span class="team-name">${m.team2Name || m.team2}</span>
          <span class="flag">${m.team2Flag || ""}</span>
        </div>
      </div>
      <div class="match-foot">
        ${result ? `
          <span class="result-pill">Resultado: ${result.score1} × ${result.score2}</span>
          ${myScore?.total ? `<span class="pts-pill">+${myScore.total} pts</span>` : `<span class="pts-pill pts-zero">0 pts</span>`}
        ` : ""}
        ${locked
          ? `<span class="lock-badge">${palpite.submitted ? "Enviado" : "Trancado"}</span>`
          : `<button class="btn btn-small btn-primary" data-submit="${m.id}">Enviar palpite</button>`}
      </div>
    `;
    list.appendChild(card);
  });

  // Edição (debounce)
  list.querySelectorAll("input[data-match]").forEach(inp => {
    inp.addEventListener("input", onPalpiteInput);
  });
  // Botão enviar
  list.querySelectorAll("button[data-submit]").forEach(btn => {
    btn.addEventListener("click", () => submitPalpite(btn.dataset.submit));
  });
}

const _saveTimers = {};
function onPalpiteInput(e) {
  const matchId = e.target.dataset.match;
  const side = e.target.dataset.side;
  const v = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0);

  // Atualiza estado local
  state.palpites[matchId] = state.palpites[matchId] || {};
  state.palpites[matchId][`score${side}`] = v;

  // Debounce de 400ms para salvar como rascunho
  clearTimeout(_saveTimers[matchId]);
  _saveTimers[matchId] = setTimeout(() => savePalpiteDraft(matchId), 400);
}

async function savePalpiteDraft(matchId) {
  const p = state.palpites[matchId] || {};
  if (p.submitted) return;
  if (isMatchLocked(state.matches[matchId])) return;
  await update(ref(db, `palpites/${state.session.username}/${matchId}`), {
    score1: p.score1 ?? null,
    score2: p.score2 ?? null,
    submitted: false,
    updatedAt: Date.now()
  });
}

async function submitPalpite(matchId) {
  const p = state.palpites[matchId];
  if (!p || p.score1 == null || p.score2 == null) {
    toast("Preencha os dois placares antes de enviar", "error");
    return;
  }
  if (isMatchLocked(state.matches[matchId])) {
    toast("Esse jogo já começou", "error");
    return;
  }
  await update(ref(db, `palpites/${state.session.username}/${matchId}`), {
    score1: Number(p.score1),
    score2: Number(p.score2),
    submitted: true,
    submittedAt: Date.now(),
    updatedAt: Date.now()
  });
  toast("Palpite enviado ✓", "success");
}

// ----- Calendário -----
function renderCalendario() {
  renderStageFilter();
  const list = $("#calendario-list");
  const matches = sortedMatches();

  if (matches.length === 0) {
    list.innerHTML = `<p class="empty">Nenhum jogo cadastrado ainda.</p>`;
    return;
  }

  list.innerHTML = "";
  matches.forEach(m => {
    const result = state.results[m.id];
    const card = document.createElement("article");
    card.className = "match-card cal-card" + (result ? " has-result" : "");
    card.innerHTML = `
      <div class="match-head">
        <span class="match-stage">${STAGES[m.stage]?.short || m.stage}${m.group ? " · Grupo " + m.group : ""}</span>
        <span class="match-date">${fmtDateTime(m.datetime)}</span>
      </div>
      <div class="match-row">
        <div class="team team-left">
          <span class="flag">${m.team1Flag || ""}</span>
          <span class="team-name">${m.team1Name || m.team1}</span>
        </div>
        <div class="result-display">
          ${result
            ? `<span class="big-score">${result.score1}</span><span class="vs">×</span><span class="big-score">${result.score2}</span>`
            : `<span class="vs muted">vs</span>`}
        </div>
        <div class="team team-right">
          <span class="team-name">${m.team2Name || m.team2}</span>
          <span class="flag">${m.team2Flag || ""}</span>
        </div>
      </div>
      ${m.venue ? `<div class="match-foot"><span class="muted">${m.venue}</span></div>` : ""}
    `;
    list.appendChild(card);
  });
}

// ----- Ranking -----
function renderRanking() {
  const list = $("#ranking-list");
  const ranked = buildRanking(
    state.users, state.palpitesAll, state.matches,
    state.championGuesses, { ...state.results, tournament: state.tournamentResult },
    state.scoringRules
  );

  if (ranked.length === 0) {
    list.innerHTML = `<p class="empty">Sem participantes ainda.</p>`;
    return;
  }

  list.innerHTML = `
    <div class="rank-head">
      <span>#</span>
      <span>Participante</span>
      <span title="Placares exatos">🎯</span>
      <span title="Vencedores">✓</span>
      <span>Pts</span>
    </div>
  ` + ranked.map(r => `
    <div class="rank-row ${r.username === state.session.username ? "me" : ""}">
      <span class="rank-pos">${r.position}</span>
      <span class="rank-name">${r.name} <small class="muted">@${r.username}</small></span>
      <span class="rank-mini">${r.exactCount}</span>
      <span class="rank-mini">${r.winnerCount}</span>
      <span class="rank-pts">${r.total}</span>
    </div>
  `).join("");
}

// ----- Campeão -----
function populateChampionDropdowns() {
  const teams = Object.keys(state.teams).length > 0
    ? Object.entries(state.teams).map(([code, t]) => ({ code, ...t }))
    : DEFAULT_TEAMS;

  const opts = teams
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(t => `<option value="${t.code}">${t.flag || ""} ${t.name}</option>`)
    .join("");

  const form = $("#form-campeao");
  if (!form) return;
  form.champion.innerHTML  = `<option value="">Selecione…</option>${opts}`;
  form.runnerUp.innerHTML  = `<option value="">Selecione…</option>${opts}`;

  // Restaura valores se já existe palpite
  if (state.championGuess) {
    form.champion.value = state.championGuess.champion || "";
    form.runnerUp.value = state.championGuess.runnerUp || "";
  }
}

function renderCampeao() {
  populateChampionDropdowns();

  const phase = currentPhase(state.config);
  const msg = {
    preCup:      `Aberto até <strong>${fmtDateTime(state.config.tournamentStart)}</strong>. Vale <strong>1x</strong>.`,
    preR32:      `A Copa começou. Alteração agora vale <strong>1/2x</strong>. Fecha em ${fmtDateTime(state.config.r32Start)}.`,
    preQuarters: `Mata-mata em andamento. Alteração agora vale <strong>1/3x</strong>. Fecha em ${fmtDateTime(state.config.quartersStart)}.`,
    locked:      `<strong>Bloqueado</strong> — as quartas já começaram.`
  }[phase.phase];
  $("#champion-phase-msg").innerHTML = msg;

  const form = $("#form-campeao");
  const locked = phase.phase === "locked";
  form.champion.disabled = locked;
  form.runnerUp.disabled = locked;
  form.querySelector("button[type=submit]").disabled = locked;

  // Mostra palpite atual e multiplicador travado
  const cur = state.championGuess;
  const meta = $("#champion-current");
  if (cur) {
    meta.innerHTML = `
      <p class="muted">Palpite atual: <strong>${cur.champion}</strong> campeão · <strong>${cur.runnerUp}</strong> vice
      · valendo <strong>${(cur.multiplier ?? 1) === 1 ? "1x" : (cur.multiplier === 0.5 ? "1/2x" : "1/3x")}</strong>
      (fase: ${cur.phase}).</p>
    `;
  } else {
    meta.innerHTML = "";
  }
}

async function submitCampeao(e) {
  e.preventDefault();
  const form = e.target;
  const champion = form.champion.value;
  const runnerUp = form.runnerUp.value;
  const err = $("#campeao-error");
  err.textContent = "";

  if (!champion || !runnerUp) { err.textContent = "Selecione campeão e vice"; return; }
  if (champion === runnerUp)  { err.textContent = "Campeão e vice precisam ser diferentes"; return; }

  const phase = currentPhase(state.config);
  if (phase.phase === "locked") { err.textContent = "Período bloqueado"; return; }

  await set(ref(db, `championGuesses/${state.session.username}`), {
    champion, runnerUp,
    phase: phase.phase,
    multiplier: phase.multiplier,
    updatedAt: Date.now()
  });
  toast("Palpite de campeão salvo ✓", "success");
}

// ---------- Boot ----------
function boot() {
  // Tabs
  $$(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

  // Login form
  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error"); err.textContent = "";
    const fd = new FormData(e.target);
    try {
      await tryLogin(fd.get("username").trim(), fd.get("password"));
      enterApp();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  // Register form
  $("#form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#register-error"); err.textContent = "";
    const fd = new FormData(e.target);
    try {
      await tryRegister({
        name: fd.get("name").trim(),
        username: fd.get("username").trim().toLowerCase(),
        email: fd.get("email").trim().toLowerCase(),
        password: fd.get("password")
      });
      enterApp();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  // Navegação login/cadastro
  $("#goto-register").addEventListener("click", () => showView("view-register"));
  $("#goto-login").addEventListener("click", () => showView("view-login"));

  // Logout
  $("#logout-btn").addEventListener("click", logout);

  // Campeão form
  $("#form-campeao").addEventListener("submit", submitCampeao);

  // Sessão existente?
  const s = getSession();
  if (s) {
    state.session = s;
    enterApp();
  } else {
    showView("view-login");
  }
}

function enterApp() {
  showView("view-app");
  $("#user-display").textContent = state.session.name + " · @" + state.session.username;
  startListeners();
}

boot();
