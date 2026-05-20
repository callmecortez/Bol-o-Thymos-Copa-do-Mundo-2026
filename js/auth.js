// ============================================================================
// AUTENTICAÇÃO (hash de senha + sessão local)
// ============================================================================
// Não usamos Firebase Auth para permitir login por usuário (não e-mail) e
// para que o admin consiga resetar senhas diretamente. Senhas são guardadas
// como hash SHA-256 com salt único por usuário. Sessão fica no localStorage.
// ============================================================================

const SESSION_KEY = "bolaocopa_session";
const ADMIN_SESSION_KEY = "bolaocopa_admin_session";

// Gera string aleatória para salt
export function randomSalt(len = 16) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

// SHA-256(salt + senha)
export async function hashPassword(password, salt) {
  const enc = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
}

// Verifica senha contra hash armazenado
export async function verifyPassword(password, salt, expectedHash) {
  const h = await hashPassword(password, salt);
  return h === expectedHash;
}

// Sessão do usuário comum
export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
export function getSession() {
  const s = localStorage.getItem(SESSION_KEY);
  return s ? JSON.parse(s) : null;
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Sessão de admin (independente)
export function saveAdminSession(session) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}
export function getAdminSession() {
  const s = localStorage.getItem(ADMIN_SESSION_KEY);
  return s ? JSON.parse(s) : null;
}
export function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

// Validação básica de e-mail + domínio corporativo
export function validateCorporateEmail(email, domains) {
  if (!email || !email.includes("@")) return { ok: false, msg: "E-mail inválido" };
  const domain = email.split("@")[1].toLowerCase().trim();
  if (!domains.includes(domain)) {
    return { ok: false, msg: `E-mail deve ser do domínio: ${domains.join(", ")}` };
  }
  return { ok: true };
}

// Validação de usuário (apenas letras, números, ponto, underscore, hífen)
export function validateUsername(username) {
  if (!username || username.length < 3) return { ok: false, msg: "Mínimo 3 caracteres" };
  if (username.length > 24) return { ok: false, msg: "Máximo 24 caracteres" };
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return { ok: false, msg: "Use apenas letras, números, ponto, hífen ou underscore" };
  }
  return { ok: true };
}

export function validatePassword(password) {
  if (!password || password.length < 6) return { ok: false, msg: "Mínimo 6 caracteres" };
  return { ok: true };
}
