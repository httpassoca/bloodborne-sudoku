export const LANGS = [
  { key: 'en', label: 'EN' },
  { key: 'pt-BR', label: 'PT-BR' },
]

export const MESSAGES = {
  en: {
    appTitle: 'Bloodborne Sudoku',
    subtitle: 'A small hunt of numbers. A large hunt of patience.',

    score: 'Score',
    best: 'Best',

    huntSetup: 'Hunt Setup',
    difficulty: 'Difficulty',

    newHunt: 'New Hunt',
    clear: 'Clear',
    reveal: 'Reveal',

    companionKill: 'Companion Kill',
    stopCompanion: 'Stop Companion',
    companionSpeed: 'Companion speed',
    companionLog: 'Companion Log',

    remaining: 'Remaining',
    allNumbersPlaced: 'All numbers placed.',

    time: 'Time',
    status: 'Status',

    companionTitle: 'Companion',

    controlsTitle: 'Controls',
    c_place: '1–9 place number',
    c_corner: 'Shift + 1–9 corner draft',
    c_center: 'Ctrl/⌘ + 1–9 center draft',
    c_clear: 'Backspace/Del clear',
    c_move: 'Arrow keys move selection',
    c_multi: 'Shift + arrows extend selection (multi-draft)',

    victoryTitle: 'PREY SLAUGHTERED',
    victoryHint: 'Press any key or click anywhere to continue.',

    statusSolved: (score) => `PREY SLAUGHTERED — Score ${score}`,
    statusConflicts: (n) => `${n} conflicts — your blood sings.`,
    statusIdle: 'Seek paleblood, to transcend the hunt.',

    diff: {
      easy: 'Easy (Yharnam Street)',
      medium: 'Medium (Cathedral Ward)',
      hard: 'Hard (Forbidden Woods)',
      expert: 'Expert (Nightmare Frontier)',
      nightmare: 'Nightmare (Mensis)',
    },

    companion: {
      quiet: 'The companion is quiet.',
      begin: 'Companion: Beginning the kill…',
      nothing: 'Companion: Nothing to do.',
      undoing: 'Companion: I smell blood. Undoing mistakes…',
      reverting: 'Companion: Reverting your steps to before the mistake…',
      decisionHint: 'Decision is highlighted on the board.',
      nakedSingle: ({ r, c, n }) => `Companion: Only candidate for r${r + 1}c${c + 1} is ${n}.`,
      hiddenRow: ({ r, c, n, idx }) => `Companion: ${n} can only go in one place in row ${idx + 1} → r${r + 1}c${c + 1}.`,
      hiddenCol: ({ r, c, n, idx }) => `Companion: ${n} can only go in one place in column ${idx + 1} → r${r + 1}c${c + 1}.`,
      hiddenBox: ({ r, c, n, br, bc }) =>
        `Companion: ${n} can only go in one place in box (${br + 1},${bc + 1}) → r${r + 1}c${c + 1}.`,
      fallback: ({ r, c, n }) => `Companion: No simple single found. Revealing the next correct value: ${n} (r${r + 1}c${c + 1}).`,
    },
  },

  'pt-BR': {
    appTitle: 'Sudoku Bloodborne',
    subtitle: 'Uma pequena caçada de números. Uma grande caçada de paciência.',

    score: 'Pontuação',
    best: 'Recorde',

    huntSetup: 'Preparação da Caçada',
    difficulty: 'Dificuldade',

    newHunt: 'Nova Caçada',
    clear: 'Limpar',
    reveal: 'Revelar',

    companionKill: 'Golpe do Companheiro',
    stopCompanion: 'Parar Companheiro',
    companionSpeed: 'Velocidade do companheiro',
    companionLog: 'Diário do Companheiro',

    remaining: 'Restantes',
    allNumbersPlaced: 'Todos os números foram colocados.',

    time: 'Tempo',
    status: 'Status',

    companionTitle: 'Companheiro',

    controlsTitle: 'Controles',
    c_place: '1–9 coloca número',
    c_corner: 'Shift + 1–9 rascunho no canto',
    c_center: 'Ctrl/⌘ + 1–9 rascunho no centro',
    c_clear: 'Backspace/Del limpa',
    c_move: 'Setas movem a seleção',
    c_multi: 'Shift + setas estende seleção (multi-rascunho)',

    victoryTitle: 'PRESA ABATIDA',
    victoryHint: 'Pressione qualquer tecla ou toque na tela para continuar.',

    statusSolved: (score) => `PRESA ABATIDA — Pontuação ${score}`,
    statusConflicts: (n) => `${n} conflitos — o sangue chama.`,
    statusIdle: 'Busque paleblood, para transcender a caçada.',

    diff: {
      easy: 'Fácil (Rua de Yharnam)',
      medium: 'Médio (Distrito da Catedral)',
      hard: 'Difícil (Bosque Proibido)',
      expert: 'Expert (Fronteira do Pesadelo)',
      nightmare: 'Pesadelo (Mensis)',
    },

    companion: {
      quiet: 'O companheiro está quieto.',
      begin: 'Companheiro: iniciando o golpe…',
      nothing: 'Companheiro: nada a fazer.',
      undoing: 'Companheiro: sinto o cheiro de sangue. Desfazendo erros…',
      reverting: 'Companheiro: voltando para antes do erro…',
      decisionHint: 'A decisão está destacada no tabuleiro.',
      nakedSingle: ({ r, c, n }) => `Companheiro: o único candidato para l${r + 1}c${c + 1} é ${n}.`,
      hiddenRow: ({ r, c, n, idx }) => `Companheiro: ${n} só pode ir em um lugar na linha ${idx + 1} → l${r + 1}c${c + 1}.`,
      hiddenCol: ({ r, c, n, idx }) => `Companheiro: ${n} só pode ir em um lugar na coluna ${idx + 1} → l${r + 1}c${c + 1}.`,
      hiddenBox: ({ r, c, n, br, bc }) =>
        `Companheiro: ${n} só pode ir em um lugar no bloco (${br + 1},${bc + 1}) → l${r + 1}c${c + 1}.`,
      fallback: ({ r, c, n }) => `Companheiro: não achei um single simples. Revelando o próximo valor correto: ${n} (l${r + 1}c${c + 1}).`,
    },
  },
}

export function t(lang, key, params) {
  const dict = MESSAGES[lang] || MESSAGES.en

  const parts = key.split('.')
  let cur = dict
  for (const p of parts) {
    cur = cur?.[p]
  }

  if (typeof cur === 'function') return cur(params)
  if (typeof cur === 'string') return cur

  return key
}
