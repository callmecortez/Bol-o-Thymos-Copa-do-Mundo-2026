// ============================================================================
// FIXTURE E ESTÁGIOS DO TORNEIO
// ============================================================================
// A Copa de 2026 tem 48 seleções, 12 grupos de 4, 104 jogos no total.
// Os jogos são cadastrados pelo admin via painel (manual ou import JSON).
// ============================================================================

export const STAGES = {
  group:    { label: "Fase de Grupos",   order: 1, short: "Grupos" },
  r32:      { label: "16-avos de Final", order: 2, short: "16-avos" },
  r16:      { label: "Oitavas de Final", order: 3, short: "Oitavas" },
  quarters: { label: "Quartas de Final", order: 4, short: "Quartas" },
  semis:    { label: "Semifinais",       order: 5, short: "Semis" },
  third:    { label: "Disputa de 3º",    order: 6, short: "3º Lugar" },
  final:    { label: "Final",            order: 7, short: "Final" }
};

export const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

// Lista de seleções classificadas para a Copa (3 sedes + 45 via eliminatórias)
// Ajustável pelo admin via painel.
export const DEFAULT_TEAMS = [
  // Sedes
  { code: "CAN", name: "Canadá",   flag: "🇨🇦" },
  { code: "MEX", name: "México",   flag: "🇲🇽" },
  { code: "USA", name: "EUA",      flag: "🇺🇸" },
  // CONMEBOL
  { code: "ARG", name: "Argentina",flag: "🇦🇷" },
  { code: "BRA", name: "Brasil",   flag: "🇧🇷" },
  { code: "URU", name: "Uruguai",  flag: "🇺🇾" },
  { code: "COL", name: "Colômbia", flag: "🇨🇴" },
  { code: "ECU", name: "Equador",  flag: "🇪🇨" },
  { code: "PAR", name: "Paraguai", flag: "🇵🇾" },
  // UEFA (12 vagas)
  { code: "FRA", name: "França",   flag: "🇫🇷" },
  { code: "ESP", name: "Espanha",  flag: "🇪🇸" },
  { code: "POR", name: "Portugal", flag: "🇵🇹" },
  { code: "ENG", name: "Inglaterra",flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "GER", name: "Alemanha", flag: "🇩🇪" },
  { code: "NED", name: "Holanda",  flag: "🇳🇱" },
  { code: "ITA", name: "Itália",   flag: "🇮🇹" },
  { code: "BEL", name: "Bélgica",  flag: "🇧🇪" },
  { code: "CRO", name: "Croácia",  flag: "🇭🇷" },
  { code: "SUI", name: "Suíça",    flag: "🇨🇭" },
  { code: "DEN", name: "Dinamarca",flag: "🇩🇰" },
  { code: "AUT", name: "Áustria",  flag: "🇦🇹" },
  // AFC (8 vagas)
  { code: "JPN", name: "Japão",     flag: "🇯🇵" },
  { code: "KOR", name: "Coreia do Sul", flag: "🇰🇷" },
  { code: "IRN", name: "Irã",       flag: "🇮🇷" },
  { code: "AUS", name: "Austrália", flag: "🇦🇺" },
  { code: "KSA", name: "Arábia Saudita", flag: "🇸🇦" },
  // CAF (9 vagas)
  { code: "MAR", name: "Marrocos",  flag: "🇲🇦" },
  { code: "SEN", name: "Senegal",   flag: "🇸🇳" },
  { code: "CIV", name: "Costa do Marfim", flag: "🇨🇮" },
  { code: "EGY", name: "Egito",     flag: "🇪🇬" },
  { code: "NGA", name: "Nigéria",   flag: "🇳🇬" }
  // ... o admin pode adicionar/remover seleções pelo painel
];

// Para o palpite de campeão/vice o admin pode editar via painel.
// Aqui só facilita o autocompletar nos formulários.

// Retorna a fase ativa atual baseada na data
export function currentPhase(config, now = new Date()) {
  const t  = new Date(config.tournamentStart).getTime();
  const r32= new Date(config.r32Start).getTime();
  const qf = new Date(config.quartersStart).getTime();
  const n  = now.getTime();
  if (n < t)   return { phase: "preCup",      multiplier: 1,    label: "Antes da Copa" };
  if (n < r32) return { phase: "preR32",      multiplier: 0.5,  label: "Fase de Grupos (1/2x)" };
  if (n < qf)  return { phase: "preQuarters", multiplier: 1/3,  label: "16-avos/Oitavas (1/3x)" };
  return { phase: "locked", multiplier: 0, label: "Bloqueado" };
}

// Formata data ISO para exibição em pt-BR
export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  });
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  });
}

// Verifica se já passou do horário do jogo
export function isMatchLocked(match, now = new Date()) {
  if (!match.datetime) return false;
  return new Date(match.datetime).getTime() <= now.getTime();
}
