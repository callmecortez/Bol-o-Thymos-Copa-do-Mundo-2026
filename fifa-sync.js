// ============================================================================
// SINCRONIZAÇÃO COM A API DA FIFA
// ============================================================================
// A API pública da FIFA (api.fifa.com) permite chamadas cross-origin
// (access-control-allow-origin: *), então o navegador consegue buscar
// jogos e resultados direto, sem proxy.
//
// IMPORTANTE: é uma API NÃO documentada. A FIFA pode mudar a estrutura ou
// os IDs sem aviso. Por isso a sincronização é uma CONVENIÊNCIA — o
// lançamento manual de jogos e resultados continua funcionando como fallback.
//
// Competição 17 = Copa do Mundo da FIFA · Temporada 285023 = edição 2026
// ============================================================================

const FIFA_BASE = "https://api.fifa.com/api/v3";
const ID_COMPETITION = "17";
const ID_SEASON = "285023"; // Copa do Mundo 2026

// Mapa de bandeiras por código da FIFA (alpha-3)
export const FIFA_FLAGS = {
  "ALG": "🇩🇿", "ARG": "🇦🇷", "AUS": "🇦🇺", "AUT": "🇦🇹", "BEL": "🇧🇪",
  "BIH": "🇧🇦", "BRA": "🇧🇷", "CAN": "🇨🇦", "CIV": "🇨🇮", "COD": "🇨🇩",
  "COL": "🇨🇴", "CPV": "🇨🇻", "CRO": "🇭🇷", "CUW": "🇨🇼", "CZE": "🇨🇿",
  "ECU": "🇪🇨", "EGY": "🇪🇬", "ENG": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "ESP": "🇪🇸", "FRA": "🇫🇷",
  "GER": "🇩🇪", "GHA": "🇬🇭", "HAI": "🇭🇹", "IRN": "🇮🇷", "IRQ": "🇮🇶",
  "JOR": "🇯🇴", "JPN": "🇯🇵", "KOR": "🇰🇷", "KSA": "🇸🇦", "MAR": "🇲🇦",
  "MEX": "🇲🇽", "NED": "🇳🇱", "NOR": "🇳🇴", "NZL": "🇳🇿", "PAN": "🇵🇦",
  "PAR": "🇵🇾", "POR": "🇵🇹", "QAT": "🇶🇦", "RSA": "🇿🇦", "SCO": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "SEN": "🇸🇳", "SUI": "🇨🇭", "SWE": "🇸🇪", "TUN": "🇹🇳", "TUR": "🇹🇷",
  "URU": "🇺🇾", "USA": "🇺🇸", "UZB": "🇺🇿"
};

// Mapa de fases da FIFA (texto pt-BR) para os códigos internos do app
const STAGE_MAP = {
  "Primeira fase":         "group",
  "Segundas de final":     "r32",
  "Oitavas de final":      "r16",
  "Quartas de final":      "quarters",
  "Semifinal":             "semis",
  "Decisão do 3º lugar":   "third",
  "Final":                 "final"
};

// Extrai a descrição localizada de um campo multilíngue da FIFA
function loc(field) {
  if (!field) return "";
  if (Array.isArray(field)) {
    const pt = field.find(x => (x.Locale || "").toLowerCase().startsWith("pt"));
    return (pt || field[0] || {}).Description || "";
  }
  return String(field);
}

// Status da FIFA: 0=agendado, 1=agendado, 3=encerrado, 12=ao vivo, etc.
// Consideramos "encerrado" quando há placar definido em ambos os lados.
function isFinished(m) {
  return m.HomeTeamScore != null && m.AwayTeamScore != null
      && Number.isInteger(m.HomeTeamScore) && Number.isInteger(m.AwayTeamScore);
}

// Transforma um jogo da FIFA no formato interno do app
function transformMatch(m) {
  const stage = STAGE_MAP[loc(m.StageName)] || "group";
  const groupName = loc(m.GroupName); // ex: "Grupo A"
  const group = groupName ? (groupName.replace(/[^A-L]/gi, "").toUpperCase() || null) : null;

  const home = m.Home;
  const away = m.Away;

  // Times definidos vs placeholders (mata-mata ainda sem classificados)
  const team1Code = home ? (home.IdCountry || home.Abbreviation || "T1") : (m.PlaceHolderA || "?");
  const team2Code = away ? (away.IdCountry || away.Abbreviation || "T2") : (m.PlaceHolderB || "?");
  const team1Name = home ? loc(home.TeamName) : (m.PlaceHolderA || "A definir");
  const team2Name = away ? loc(away.TeamName) : (m.PlaceHolderB || "A definir");
  const team1Flag = home ? (FIFA_FLAGS[home.IdCountry] || "") : "";
  const team2Flag = away ? (FIFA_FLAGS[away.IdCountry] || "") : "";

  return {
    fifaId: String(m.IdMatch),
    matchNumber: m.MatchNumber ?? null,
    stage,
    group,
    team1: String(team1Code).toUpperCase(),
    team1Name,
    team1Flag,
    team2: String(team2Code).toUpperCase(),
    team2Name,
    team2Flag,
    datetime: m.Date || null,        // ISO UTC, ex "2026-06-11T19:00:00Z"
    venue: loc(m.Stadium),
    teamsDefined: !!(home && away)
  };
}

// Busca todos os jogos da Copa 2026 na API da FIFA
export async function fetchFifaMatches() {
  const url = `${FIFA_BASE}/calendar/matches`
            + `?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}`
            + `&language=pt&count=200`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`FIFA respondeu ${res.status}`);
  const data = await res.json();
  const results = data.Results || [];
  if (results.length === 0) throw new Error("A FIFA não retornou jogos");
  return results
    .map(transformMatch)
    .sort((a, b) => {
      const dA = a.datetime ? new Date(a.datetime).getTime() : Infinity;
      const dB = b.datetime ? new Date(b.datetime).getTime() : Infinity;
      return dA - dB;
    });
}

// Busca apenas os resultados (jogos encerrados com placar)
export async function fetchFifaResults() {
  const url = `${FIFA_BASE}/calendar/matches`
            + `?idCompetition=${ID_COMPETITION}&idSeason=${ID_SEASON}`
            + `&language=pt&count=200`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`FIFA respondeu ${res.status}`);
  const data = await res.json();
  const results = data.Results || [];
  const out = {};
  for (const m of results) {
    if (isFinished(m)) {
      out[String(m.IdMatch)] = {
        score1: Number(m.HomeTeamScore),
        score2: Number(m.AwayTeamScore),
        // Em mata-mata a FIFA também expõe pênaltis
        pen1: m.HomeTeamPenaltyScore ?? null,
        pen2: m.AwayTeamPenaltyScore ?? null
      };
    }
  }
  return out; // { fifaId: { score1, score2, pen1, pen2 } }
}

// Chave estável no Firebase para jogos vindos da FIFA (re-sync não duplica)
export function fifaMatchKey(fifaId) {
  return `fifa_${fifaId}`;
}
