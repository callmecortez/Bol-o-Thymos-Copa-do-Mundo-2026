// ============================================================================
// AUTENTICAÇÃO — Firebase Authentication (e-mail/senha + Google)
// ============================================================================
// Login por NOME DE USUÁRIO ou por conta Google. O Firebase Auth identifica
// contas por e-mail; guardamos um índice "usernames/<usuario>" que converte
// usuário -> e-mail. As senhas NÃO ficam no nosso banco — são gerenciadas
// pelo Google.
// ============================================================================

import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
  ref, get, update
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// ---------- Validações ----------
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
  if (c.includes("popup-closed-by-user")) return "Janela do Google fechada antes de concluir";
  if (c.includes("popup-blocked")) return "O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo";
  if (c.includes("account-exists-with-different-credential"))
    return "Esse e-mail já tem conta com outro método de login";
  if (c.includes("operation-not-allowed"))
    return "Método de login não habilitado no Firebase. Ative em Authentication > Sign-in method";
  if (c.includes("network")) return "Falha de conexão. Verifique sua internet";
  if (c.includes("configuration-not-found") || c.includes("auth/internal-error"))
    return "Authentication não configurado. Verifique no Firebase Console";
  return (err && err.message) || "Erro inesperado";
}

// ---------- Resolução usuário -> e-mail ----------
export async function usernameToEmail(db, username) {
  const snap = await get(ref(db, `usernames/${username}`));
  if (!snap.exists()) return null;
  return snap.val().email;
}

// Verifica se já existe perfil para um uid (usado no fluxo Google)
export async function profileExists(db, uid) {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists();
}

// ---------- Login com usuário/senha ----------
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

// ---------- Cadastro com usuário/senha ----------
export async function registerUser(auth, db, { name, username, email, password }, domains) {
  const vU = validateUsername(username); if (!vU.ok) throw new Error(vU.msg);
  const vP = validatePassword(password); if (!vP.ok) throw new Error(vP.msg);
  const vE = validateCorporateEmail(email, domains); if (!vE.ok) throw new Error(vE.msg);

  const exists = await get(ref(db, `usernames/${username}`));
  if (exists.exists()) throw new Error("Esse usuário já existe");

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  await update(ref(db), {
    [`usernames/${username}`]: { email, uid },
    [`users/${uid}`]: { uid, name, username, email, role: "user", createdAt: Date.now() }
  });
  return cred.user;
}

// ---------- Login com Google ----------
// Retorna { user, isNew }. Se isNew === true, o app deve pedir um nome de
// usuário e chamar completeGoogleProfile() para finalizar o cadastro.
export async function loginWithGoogle(auth, db, domains) {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  const email = (user.email || "").toLowerCase();

  // Valida domínio corporativo
  const vE = validateCorporateEmail(email, domains);
  if (!vE.ok) {
    await signOut(auth);
    throw new Error(vE.msg);
  }

  const hasProfile = await profileExists(db, user.uid);
  return { user, isNew: !hasProfile };
}

// Finaliza o cadastro de um usuário que entrou via Google pela primeira vez
export async function completeGoogleProfile(db, user, username) {
  const vU = validateUsername(username);
  if (!vU.ok) throw new Error(vU.msg);
  const exists = await get(ref(db, `usernames/${username}`));
  if (exists.exists()) throw new Error("Esse usuário já existe");

  const email = (user.email || "").toLowerCase();
  await update(ref(db), {
    [`usernames/${username}`]: { email, uid: user.uid },
    [`users/${user.uid}`]: {
      uid: user.uid,
      name: user.displayName || username,
      username, email, role: "user",
      provider: "google",
      createdAt: Date.now()
    }
  });
}

// ---------- Redefinição de senha ----------
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
