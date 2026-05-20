// ============================================================================
// MOTOR DE PONTUAÇÃO
// ============================================================================
// Regras (ajustáveis pelo admin):
//   - Acertou o vencedor (ou empate):                   2 pts
//   - Acertou o placar exato:                           3 pts
//   - Acertou os gols de UM time (não ambos):           1 pt
//   - Acertou a diferença de gols (se vencedor certo):  1 pt
//   - Campeão acertado:                                20 pts × multiplicador
//   - Vice-campeão acertado:                           20 pts × multiplicador
//
// Pontos são CUMULATIVOS (placar exato 3x1 = 2+3+0+1 = 6pts)
// Multiplicador campeão/vice depende da fase em que o palpite foi feito:
//   - Antes da Copa:               1x
//   - Antes dos 16-avos (R32):     1/2x  (palpite alterado durante a fase de grupos)
//   - Antes das Quartas:           1/3x  (alterado entre R32 e oitavas)
// ============================================================================

export const DEFAULT_SCORING = {
  winner: 2,
  exactScore: 3,
  oneTeamGoals: 1,
  goalDifference: 1,
  champion: 20,
  runnerUp: 20
};

// Calcula a pontuação de um único palpite contra um resultado
export function scoreMatch(palpite, result, rules = DEFAULT_SCORING) {
  if (!palpite || !result) return { total: 0, breakdown: {} };
  if (palpite.score1 == null || palpite.score2 == null) return { total: 0, breakdown: {} };
  if (result.score1 == null || result.score2 == null)   return { total: 0, breakdown: {} };

  const p1 = Number(palpite.score1), p2 = Number(palpite.score2);
  const r1 = Number(result.score1),  r2 = Number(result.score2);

  const breakdown = {};
  let total = 0;

  // Vencedor (ou empate)
  const palpiteWinner = p1 === p2 ? "draw" : (p1 > p2 ? "team1" : "team2");
  const resultWinner  = r1 === r2 ? "draw" : (r1 > r2 ? "team1" : "team2");
  const winnerCorrect = palpiteWinner === resultWinner;
  if (winnerCorrect) {
    breakdown.winner = rules.winner;
    total += rules.winner;
  }

  // Placar exato
  const exactCorrect = p1 === r1 && p2 === r2;
  if (exactCorrect) {
    breakdown.exactScore = rules.exactScore;
    total += rules.exactScore;
  }

  // Gols de UM time apenas (se ambos, já é placar exato e não soma esse aqui)
  if (!exactCorrect) {
    const t1Hit = p1 === r1;
    const t2Hit = p2 === r2;
    if (t1Hit !== t2Hit) {  // exatamente um deles
      breakdown.oneTeamGoals = rules.oneTeamGoals;
      total += rules.oneTeamGoals;
    }
  }

  // Diferença de gols (somente se vencedor correto e não for placar exato)
  if (winnerCorrect && !exactCorrect) {
    const palpiteDiff = p1 - p2;
    const resultDiff  = r1 - r2;
    if (palpiteDiff === resultDiff) {
      breakdown.goalDifference = rules.goalDifference;
      total += rules.goalDifference;
    }
  }

  return { total, breakdown };
}

// Calcula a pontuação total de um usuário
export function scoreUser(userPalpites, matches, championGuess, results, rules = DEFAULT_SCORING) {
  let totalMatches = 0;
  let exactCount = 0;
  let winnerCount = 0;
  const perMatch = {};

  for (const [matchId, palpite] of Object.entries(userPalpites || {})) {
    const result = results?.[matchId];
    if (!result || result.score1 == null) continue;

    const { total, breakdown } = scoreMatch(palpite, result, rules);
    perMatch[matchId] = { total, breakdown };
    totalMatches += total;
    if (breakdown.exactScore) exactCount++;
    if (breakdown.winner)     winnerCount++;
  }

  // Campeão / vice
  let championPts = 0;
  let runnerUpPts = 0;
  if (championGuess) {
    const mult = championGuess.multiplier ?? 1;
    if (results?.tournament?.champion && championGuess.champion === results.tournament.champion) {
      championPts = rules.champion * mult;
    }
    if (results?.tournament?.runnerUp && championGuess.runnerUp === results.tournament.runnerUp) {
      runnerUpPts = rules.runnerUp * mult;
    }
  }

  const total = totalMatches + championPts + runnerUpPts;
  return {
    total,
    totalMatches,
    championPts,
    runnerUpPts,
    exactCount,
    winnerCount,
    perMatch
  };
}

// Ordena ranking. Critérios:
//   1. Maior pontuação total
//   2. Mais placares exatos
//   3. Mais vencedores acertados
//   4. Ordem alfabética do nome
export function buildRanking(users, palpitesAll, matches, championGuesses, results, rules = DEFAULT_SCORING) {
  const ranked = Object.entries(users || {}).map(([uid, user]) => {
    const score = scoreUser(
      palpitesAll?.[uid] || {},
      matches,
      championGuesses?.[uid],
      results,
      rules
    );
    return {
      uid,
      username: user.username,
      name: user.name,
      ...score
    };
  });

  ranked.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
    if (b.winnerCount !== a.winnerCount) return b.winnerCount - a.winnerCount;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return ranked.map((u, i) => ({ ...u, position: i + 1 }));
}
