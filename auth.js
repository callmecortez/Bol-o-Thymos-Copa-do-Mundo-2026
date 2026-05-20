// ============================================================================
// AUTENTICAÇÃO — Firebase Authentication (e-mail/senha)
// ============================================================================
// O login é por NOME DE USUÁRIO, mas o Firebase Auth identifica contas por
// e-mail. Por isso guardamos um índice público "usernames/<usuario>" que
// converte usuário -> e-mail. As senhas NÃO ficam no nosso banco — são
// gerenciadas pelo Google, com segurança real.
// ============================================================================

import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  ref, get, update
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// ---------- Validações ----------
// Nomes de usuário viram CHAVES no banco; o Realtime Database proíbe
// . # $ [ ] / em chaves, então restringimos a letras, números, _ e -.
export function validateUsername(username) {
  if (!username || username.length < 3) return { ok: false, msg: "Usuário: mínimo 3 caracteres" };
  if (username.length > 24) return { ok: false, msg: "Usuário: máximo 24 caracteres" };
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { ok: false, msg: "Usuário: use apenas letras, números, hífen ou underscore (sem espaços ou pontos)" };
  }
  return { ok: true };
}

export function validatePassword(password) {
  if (!password || password.length < 6) return { ok: false, msg: "Senha: mínimo 6 caracteres" };
  return { ok: true };
}

export function validateCorporateEmail(email, domains) {
  if (!email || !email.includes("@")) return { ok: false, msg: "E-mail inválido" };
  const domain = email.split("@")[1].toLowerCase().trim();
  if (domains && domains.length && !domains.includes(domain)) {
    return { ok: false, msg: `E-mail deve ser do domínio: ${domains.join(", ")}` };
  }
  return { ok: true };
}

// Traduz códigos de erro do Firebase para mensagens claras em pt-BR
export function friendlyAuthError(err) {
  const c = (err && err.code) || "";
  if (c.includes("email-already-in-use")) return "Esse e-mail já está cadastrado";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "Usuário ou senha inválidos";
  if (c.includes("too-many-requests")) return "Muitas tentativas. Tente novamente em alguns minutos";
  if (c.includes("weak-password")) return "Senha muito fraca (mínimo 6 caracteres)";
  if (c.includes("invalid-email")) return "E-mail inválido";
  if (c.includes("network")) return "Falha de conexão. Verifique sua internet";
  return (err && err.message) || "Erro inesperado";
}

// ---------- Resolução usuário -> e-mail ----------
export async function usernameToEmail(db, username) {
  const snap = await get(ref(db, `usernames/${username}`));
  if (!snap.exists()) return null;
  return snap.val().email;
}

// ---------- Login ----------
export async function loginWithUsername(auth, db, username, password) {
  const email = await usernameToEmail(db, username);
  if (!email) {
    const e = new Error("Usuário ou senha inválidos");
    e.code = "auth/user-not-found";
    throw e;
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ---------- Cadastro ----------
export async function registerUser(auth, db, { name, username, email, password }, domains) {
  const vU = validateUsername(username); if (!vU.ok) throw new Error(vU.msg);
  const vP = validatePassword(password); if (!vP.ok) throw new Error(vP.msg);
  const vE = validateCorporateEmail(email, domains); if (!vE.ok) throw new Error(vE.msg);

  // Nome de usuário já existe?
  const exists = await get(ref(db, `usernames/${username}`));
  if (exists.exists()) throw new Error("Esse usuário já existe");

  // Cria a conta no Firebase Auth (o Google valida e-mail duplicado aqui)
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  // Grava o perfil e o índice de nome de usuário
  await update(ref(db), {
    [`usernames/${username}`]: { email, uid },
    [`users/${uid}`]: {
      uid, name, username, email,
      role: "user",
      createdAt: Date.now()
    }
  });
  return cred.user;
}

// ---------- Redefinição de senha (autoatendimento) ----------
export async function sendResetByUsername(auth, db, username) {
  const email = await usernameToEmail(db, username);
  if (!email) throw new Error("Usuário não encontrado");
  await sendPasswordResetEmail(auth, email);
  return email;
}

export async function sendResetByEmail(auth, email) {
  await sendPasswordResetEmail(auth, email);
}

export async function logout(auth) {
  await signOut(auth);
}
