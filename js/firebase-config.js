// ============================================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================================
// 1. Acesse https://console.firebase.google.com/
// 2. Crie um projeto novo (ou reutilize um existente)
// 3. Adicione um app web (ícone </>) e copie os valores abaixo
// 4. Em "Realtime Database", crie um banco em modo de teste
// 5. Cole o conteúdo de database-seed.json no banco (importar JSON)
// 6. (Importante) Aplique as regras de segurança do README
// ============================================================================

export const firebaseConfig = {
  apiKey: "COLE_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

// ============================================================================
// CONFIGURAÇÃO DO BOLÃO
// ============================================================================
// Datas das fases (horário de Brasília). Alteráveis pelo admin via painel.
// Os valores aqui são apenas defaults para o primeiro carregamento.
// ============================================================================

export const TOURNAMENT_CONFIG = {
  // Palpite de campeão/vice abre antes do início e fecha conforme a fase
  tournamentStart:  "2026-06-11T20:00:00-03:00", // 1x até 1 dia antes
  r32Start:         "2026-06-28T13:00:00-03:00", // entre início e R32 → 1/2x
  quartersStart:    "2026-07-09T17:00:00-03:00", // entre R32 e quartas → 1/3x
  // Após o início das quartas: bloqueado
  corporateEmailDomains: ["thymosenergia.com.br"]
};
