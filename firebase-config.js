// ============================================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================================
// 1. Acesse https://console.firebase.google.com/ e abra seu projeto
// 2. Em "Criação > Authentication", clique em "Vamos começar" e ative o
//    provedor "E-mail/senha" (Sign-in method > Email/Password > Ativar)
// 3. Em "Criação > Realtime Database", crie o banco
// 4. Adicione um app web (ícone </>) e copie os valores abaixo
// 5. Aplique as regras de segurança do arquivo database-rules.json
// 6. Importe database-seed.json no Realtime Database
// ============================================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBbjRldWVT_MeWscqGabakCka7N0zYVXYQ",
  authDomain: "bolao-thymos.firebaseapp.com",
  databaseURL: "https://bolao-thymos-default-rtdb.firebaseio.com",
  projectId: "bolao-thymos",
  storageBucket: "bolao-thymos.firebasestorage.app",
  messagingSenderId: "973509301748",
  appId: "1:973509301748:web:eb33e17cbd101a7066d5a1"
};

// ============================================================================
// CONFIGURAÇÃO DO BOLÃO (defaults — o admin pode editar pelo painel)
// ============================================================================

export const TOURNAMENT_CONFIG = {
  tournamentStart: "2026-06-11T20:00:00-03:00", // 1x até 1 dia antes
  r32Start:        "2026-06-28T13:00:00-03:00", // entre início e R32 -> 1/2x
  quartersStart:   "2026-07-09T17:00:00-03:00", // entre R32 e quartas -> 1/3x
  corporateEmailDomains: ["thymosenergia.com.br"]
};
