// ============================================================================
// APP PRINCIPAL (usuário) — com Firebase Authentication
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, update, onValue
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

import { firebaseConfig, TOURNAMENT_CONFIG } from "./firebase-config.js";
import {
  loginWithUsername, registerUser, logout, sendResetByUsername, friendlyAuthError,
  loginWithGoogle, completeGoogleProfile
} from "./auth.js";
import {
  STAGES, DEFAULT_TEAMS, currentPhase, fmtDateTime, fmtDateShort, isMatchLocked
} from "./fixture.js";
import { scoreMatch, buildRanking, DEFAULT_SCORING } from "./scoring.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

const state = {
  uid: null,
  profile: null,            // { uid, name, username, email, role }
  config: TOURNAMENT_CONFIG,
  matches: {},
  results: {},
  palpites: {},
  palpitesAll: {},
  users: {},
  championGuesses: {},
  championGuess: null,
  tournamentResult: {},
  scoringRules: { ...DEFAULT_SCORING },
  teams: {},
  activeTab: "palpites",
  stageFilter: "all",
  listenersStarted: false,
  pendingGoogleUser: null
};

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
  toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

// ---------- Listeners de dados (tempo real) ----------
function startListeners() {
  if (state.listenersStarted) return;
  state.listenersStarted = true;

  onValue(ref(db, "config"), s => {
    if (s.exists()) state.config = { ...TOURNAMENT_CONFIG, ...s.val() };
    renderActiveTab();
  });
  onValue(ref(db, "matches"), s => { state.matches = s.val() || {}; renderActiveTab(); });
  onValue(ref(db, "results"), s => { state.results = s.val() || {}; renderActiveTab(); });
  onValue(ref(db, "users"),   s => { state.users = s.val() || {}; renderActiveTab(); });
  onValue(ref(db, "palpites"), s => {
    state.palpitesAll = s.val() || {};
    state.palpites = state.palpitesAll[state.uid] || {};
    renderActiveTab();
  });
  onValue(ref(db, "championGuesses"), s => {
    state.championGuesses = s.val() || {};
    state.championGuess = state.championGuesses[state.uid] || null;
    renderActiveTab();
  });
  onValue(ref(db, "tournamentResult"), s => { state.tournamentResult = s.val() || {}; renderActiveTab(); });
  onValue(ref(db, "scoringRules"), s => {
    state.scoringRules = s.exists() ? { ...DEFAULT_SCORING, ...s.val() } : { ...DEFAULT_SCORING };
    renderActiveTab();
  });
  onValue(ref(db, "teams"), s => { state.teams = s.val() || {}; populateChampionDropdowns(); });
}

function renderActiveTab() {
  if (state.activeTab === "palpites")   renderPalpites();
  if (state.activeTab === "calendario") renderCalendario();
  if (state.activeTab === "ranking")    renderRanking();
  if (state.activeTab === "campeao")    renderCampeao();
}

// ----- filtro de fase -----
function renderStageFilter() {
  const present = new Set(Object.values(state.matches).map(m => m.stage));
  const ordered = Array.from(present).sort((a,b) => (STAGES[a]?.order||99)-(STAGES[b]?.order||99));
  const el = $("#stage-filter");
  if (!el) return;
  el.innerHTML = "";
  const mk = (val,label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "chip" + (state.stageFilter === val ? " active" : "");
    b.onclick = () => { state.stageFilter = val; renderPalpites(); renderCalendario(); };
    return b;
  };
  el.appendChild(mk("all","Todos"));
  ordered.forEach(s => el.appendChild(mk(s, STAGES[s]?.short || s)));
}

function sortedMatches() {
  return Object.entries(state.matches)
    .map(([id,m]) => ({ id, ...m }))
    .filter(m => state.stageFilter === "all" || m.stage === state.stageFilter)
    .sort((a,b) => {
      const dA = a.datetime ? new Date(a.datetime).getTime() : Infinity;
      const dB = b.datetime ? new Date(b.datetime).getTime() : Infinity;
      return dA - dB;
    });
}

// ----- Palpites -----
function renderPalpites() {
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
    const myScore = result ? scoreMatch(palpite, result, state.scoringRules) : null;
    const card = document.createElement("article");
    card.className = "match-card" + (locked ? " locked" : "");
    card.innerHTML = `
      <div class="match-head">
        <span class="match-stage">${STAGES[m.stage]?.short || m.stage}${m.group ? " · Grupo "+m.group : ""}</span>
        <span class="match-date">${fmtDateShort(m.datetime)}</span>
      </div>
      <div class="match-row">
        <div class="team team-left">
          <span class="flag">${m.team1Flag||""}</span>
          <span class="team-name">${m.team1Name||m.team1}</span>
        </div>
        <div class="score-input">
          <input type="number" min="0" max="20" data-match="${m.id}" data-side="1" value="${palpite.score1 ?? ""}" ${locked?"disabled":""}>
          <span class="vs">×</span>
          <input type="number" min="0" max="20" data-match="${m.id}" data-side="2" value="${palpite.score2 ?? ""}" ${locked?"disabled":""}>
        </div>
        <div class="team team-right">
          <span class="team-name">${m.team2Name||m.team2}</span>
          <span class="flag">${m.team2Flag||""}</span>
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
      </div>`;
    list.appendChild(card);
  });
  list.querySelectorAll("input[data-match]").forEach(inp => inp.addEventListener("input", onPalpiteInput));
  list.querySelectorAll("button[data-submit]").forEach(btn =>
    btn.addEventListener("click", () => submitPalpite(btn.dataset.submit)));
}

const _saveTimers = {};
function onPalpiteInput(e) {
  const matchId = e.target.dataset.match;
  const side = e.target.dataset.side;
  const v = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value,10) || 0);
  state.palpites[matchId] = state.palpites[matchId] || {};
  state.palpites[matchId][`score${side}`] = v;
  clearTimeout(_saveTimers[matchId]);
  _saveTimers[matchId] = setTimeout(() => savePalpiteDraft(matchId), 400);
}
async function savePalpiteDraft(matchId) {
  const p = state.palpites[matchId] || {};
  if (p.submitted) return;
  if (isMatchLocked(state.matches[matchId])) return;
  try {
    await update(ref(db, `palpites/${state.uid}/${matchId}`), {
      score1: p.score1 ?? null, score2: p.score2 ?? null,
      submitted: false, updatedAt: Date.now()
    });
  } catch (e) { console.error(e); }
}
async function submitPalpite(matchId) {
  const p = state.palpites[matchId];
  if (!p || p.score1 == null || p.score2 == null) {
    toast("Preencha os dois placares antes de enviar", "error"); return;
  }
  if (isMatchLocked(state.matches[matchId])) { toast("Esse jogo já começou", "error"); return; }
  try {
    await update(ref(db, `palpites/${state.uid}/${matchId}`), {
      score1: Number(p.score1), score2: Number(p.score2),
      submitted: true, submittedAt: Date.now(), updatedAt: Date.now()
    });
    toast("Palpite enviado ✓", "success");
  } catch (e) { toast("Erro ao enviar: " + e.message, "error"); }
}

// ----- Calendário -----
function renderCalendario() {
  renderStageFilter();
  const list = $("#calendario-list");
  const matches = sortedMatches();
  if (matches.length === 0) { list.innerHTML = `<p class="empty">Nenhum jogo cadastrado ainda.</p>`; return; }
  list.innerHTML = "";
  matches.forEach(m => {
    const result = state.results[m.id];
    const card = document.createElement("article");
    card.className = "match-card cal-card" + (result ? " has-result" : "");
    card.innerHTML = `
      <div class="match-head">
        <span class="match-stage">${STAGES[m.stage]?.short || m.stage}${m.group ? " · Grupo "+m.group : ""}</span>
        <span class="match-date">${fmtDateTime(m.datetime)}</span>
      </div>
      <div class="match-row">
        <div class="team team-left"><span class="flag">${m.team1Flag||""}</span><span class="team-name">${m.team1Name||m.team1}</span></div>
        <div class="result-display">
          ${result
            ? `<span class="big-score">${result.score1}</span><span class="vs">×</span><span class="big-score">${result.score2}</span>`
            : `<span class="vs muted">vs</span>`}
        </div>
        <div class="team team-right"><span class="team-name">${m.team2Name||m.team2}</span><span class="flag">${m.team2Flag||""}</span></div>
      </div>
      ${m.venue ? `<div class="match-foot"><span class="muted">${m.venue}</span></div>` : ""}`;
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
  if (ranked.length === 0) { list.innerHTML = `<p class="empty">Sem participantes ainda.</p>`; return; }
  list.innerHTML = `
    <div class="rank-head">
      <span>#</span><span>Participante</span>
      <span title="Placares exatos">🎯</span><span title="Vencedores">✓</span><span>Pts</span>
    </div>` + ranked.map(r => `
    <div class="rank-row ${r.uid === state.uid ? "me" : ""}">
      <span class="rank-pos">${r.position}</span>
      <span class="rank-name">${r.name} <small class="muted">@${r.username}</small></span>
      <span class="rank-mini">${r.exactCount}</span>
      <span class="rank-mini">${r.winnerCount}</span>
      <span class="rank-pts">${r.total}</span>
    </div>`).join("");
}

// ----- Campeão -----
function populateChampionDropdowns() {
  const teams = Object.keys(state.teams).length
    ? Object.entries(state.teams).map(([code,t]) => ({ code, ...t }))
    : DEFAULT_TEAMS;
  const opts = teams
    .sort((a,b) => a.name.localeCompare(b.name,"pt-BR"))
    .map(t => `<option value="${t.code}">${t.flag||""} ${t.name}</option>`).join("");
  const form = $("#form-campeao");
  if (!form) return;
  form.champion.innerHTML = `<option value="">Selecione…</option>${opts}`;
  form.runnerUp.innerHTML = `<option value="">Selecione…</option>${opts}`;
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
  const cur = state.championGuess;
  const meta = $("#champion-current");
  if (cur) {
    const multLabel = (cur.multiplier ?? 1) === 1 ? "1x" : (cur.multiplier === 0.5 ? "1/2x" : "1/3x");
    meta.innerHTML = `<p class="muted">Palpite atual: <strong>${cur.champion}</strong> campeão · <strong>${cur.runnerUp}</strong> vice · valendo <strong>${multLabel}</strong>.</p>`;
  } else meta.innerHTML = "";
}
async function submitCampeao(e) {
  e.preventDefault();
  const form = e.target;
  const champion = form.champion.value, runnerUp = form.runnerUp.value;
  const err = $("#campeao-error"); err.textContent = "";
  if (!champion || !runnerUp) { err.textContent = "Selecione campeão e vice"; return; }
  if (champion === runnerUp) { err.textContent = "Campeão e vice precisam ser diferentes"; return; }
  const phase = currentPhase(state.config);
  if (phase.phase === "locked") { err.textContent = "Período bloqueado"; return; }
  try {
    await set(ref(db, `championGuesses/${state.uid}`), {
      champion, runnerUp, phase: phase.phase, multiplier: phase.multiplier, updatedAt: Date.now()
    });
    toast("Palpite de campeão salvo ✓", "success");
  } catch (ex) { err.textContent = "Erro ao salvar: " + ex.message; }
}

// ---------- Boot ----------
function boot() {
  $$(".tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

  $("#form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error"); err.textContent = "";
    const fd = new FormData(e.target);
    try {
      await loginWithUsername(auth, db, fd.get("username").trim().toLowerCase(), fd.get("password"));
      // onAuthStateChanged cuida do resto
    } catch (ex) { err.textContent = friendlyAuthError(ex); }
  });

  $("#form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#register-error"); err.textContent = "";
    const fd = new FormData(e.target);
    let domains = TOURNAMENT_CONFIG.corporateEmailDomains;
    try {
      const cfg = await get(ref(db, "config"));
      if (cfg.exists() && cfg.val().corporateEmailDomains) domains = cfg.val().corporateEmailDomains;
    } catch (_) {}
    try {
      await registerUser(auth, db, {
        name: fd.get("name").trim(),
        username: fd.get("username").trim().toLowerCase(),
        email: fd.get("email").trim().toLowerCase(),
        password: fd.get("password")
      }, domains);
      toast("Conta criada ✓", "success");
    } catch (ex) { err.textContent = friendlyAuthError(ex); }
  });

  $("#goto-register").addEventListener("click", () => showView("view-register"));
  $("#goto-login").addEventListener("click", () => showView("view-login"));

  $("#forgot-password").addEventListener("click", async () => {
    const u = prompt("Digite seu nome de usuário para receber o e-mail de redefinição de senha:");
    if (!u) return;
    try {
      const email = await sendResetByUsername(auth, db, u.trim().toLowerCase());
      toast(`E-mail de redefinição enviado para ${email}`, "success");
    } catch (ex) { toast(friendlyAuthError(ex), "error"); }
  });

  $("#logout-btn").addEventListener("click", async () => {
    try {
      state.listenersStarted = false; // permite religar os listeners no próximo login
      await logout(auth);
      // onAuthStateChanged leva de volta ao login; fallback abaixo por garantia
      showView("view-login");
    } catch (ex) {
      console.error("Erro no logout:", ex);
      toast("Erro ao sair: " + friendlyAuthError(ex), "error");
    }
  });
  $("#form-campeao").addEventListener("submit", submitCampeao);

  // ----- Login com Google -----
  $("#google-login-btn").addEventListener("click", async () => {
    const err = $("#login-error"); err.textContent = "";
    let domains = TOURNAMENT_CONFIG.corporateEmailDomains;
    try {
      const cfg = await get(ref(db, "config"));
      if (cfg.exists() && cfg.val().corporateEmailDomains) domains = cfg.val().corporateEmailDomains;
    } catch (_) {}
    try {
      const { user, isNew } = await loginWithGoogle(auth, db, domains);
      if (isNew) {
        // Primeiro acesso via Google: pedir nome e nome de usuário
        state.pendingGoogleUser = user;
        const nameInput = document.querySelector("#form-pick-username input[name=name]");
        if (nameInput) nameInput.value = user.displayName || "";
        showView("view-pick-username");
      }
      // Se não for novo, o onAuthStateChanged já leva para o app
    } catch (ex) { err.textContent = friendlyAuthError(ex); }
  });

  // ----- Escolha de nome e usuário (1º acesso Google) -----
  $("#form-pick-username").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#pick-username-error"); err.textContent = "";
    const fd = new FormData(e.target);
    const username = fd.get("username").trim().toLowerCase();
    const name = fd.get("name").trim();
    if (!state.pendingGoogleUser) { err.textContent = "Sessão expirada. Entre de novo."; return; }
    try {
      await completeGoogleProfile(db, state.pendingGoogleUser, username, name);
      state.pendingGoogleUser = null;
      // Recarrega o perfil e entra
      const snap = await get(ref(db, `users/${auth.currentUser.uid}`));
      state.uid = auth.currentUser.uid;
      state.profile = snap.exists() ? snap.val() : { name: "Participante", username };
      $("#user-display").textContent = `${state.profile.name} · @${state.profile.username}`;
      showView("view-app");
      startListeners();
      renderActiveTab();
      toast("Conta criada ✓", "success");
    } catch (ex) { err.textContent = friendlyAuthError(ex); }
  });

  // Estado de autenticação
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      state.uid = null; state.profile = null;
      showView("view-login");
      return;
    }
    state.uid = user.uid;
    let snap;
    try {
      snap = await get(ref(db, `users/${user.uid}`));
    } catch (_) { snap = null; }
    // Conta de login existe mas ainda não tem perfil = usuário Google novo
    if (!snap || !snap.exists()) {
      if (state.pendingGoogleUser) {
        // o fluxo de escolha de usuário está em andamento, não faz nada aqui
        return;
      }
      state.profile = { name: "Participante", username: "?" };
    } else {
      state.profile = snap.val();
    }
    $("#user-display").textContent = `${state.profile.name} · @${state.profile.username}`;
    showView("view-app");
    startListeners();
    renderActiveTab();
  });
}

boot();
