export function bestKey(diffKey: string) {
  return `bbs_best_${diffKey}`
}

export function readBestScore(diffKey: string) {
  const v = Number(localStorage.getItem(bestKey(diffKey)) || 0)
  return Number.isFinite(v) ? v : 0
}

export function writeBestScore(diffKey: string, score: number) {
  try {
    localStorage.setItem(bestKey(diffKey), String(Number(score) || 0))
  } catch {
    // ignore storage errors
  }
}

export function scoreFor(diffKey: string, seconds: number) {
  const mult =
    diffKey === 'easy'
      ? 1
      : diffKey === 'medium'
        ? 1.35
        : diffKey === 'hard'
          ? 1.9
          : diffKey === 'expert'
            ? 2.6
            : 3.3

  const base = Math.round(12000 * mult)
  const penalty = Math.round(Number(seconds || 0) * 20 * mult)
  return Math.max(0, base - penalty)
}
