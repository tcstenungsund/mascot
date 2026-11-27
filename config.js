// Mascot settings – the only file you need to edit.
// After editing: reload the page. Typos in face names show up as warnings in the browser console (F12).

const CONFIG = {
  // Mood name → one or more kaomoji. With several, one is picked at random each time.
  // "home" is the mascot's identity: the face it shows most of the time.
  faces: {
    home:      ['(・‿・)'],
    blink:     ['(－‿－)'],
    happy:     ['(＾▽＾)', '(＾‿＾)'],
    greet:     ['ヾ(＾▽＾)', '(・‿・)ノ'],
    thinking:  ['(・・ )ゞ', '( ・・)…'],
    surprised: ['(°o°)'],
    yawn:      ['(－o－)'],
    sleep:     ['(－ω－) zzZ'],
    groggy:    ['(－_－) …?'],
    hungry:    ['(っ˘▽˘)っ♨'],
    party:     ['＼(＾▽＾)／'],
    wink:      ['( ͡•‿-)'],     // one eye closed, the other eyebrow raised
    smug:      ['(￣ー￣)'],
    cool:      ['(⌐■_■)'],
    love:      ['(♡‿♡)'],
    excited:   ['✧◝(⁰▿⁰)◜✧'],
    // Used by the AI prompt (and some by the idle program): working on it / doesn't know / went wrong
    determined: ['(•̀‿•́)✧'],
    shrug:     ['¯\\_(ツ)_/¯'],  // \\ is one backslash
    nervous:   ['(・_・;)'],
    talking:   ['(・o・)'],     // mouth open; alternates with "home" while an answer streams in
    // Reactions on the page
    lookLeft:  ['(・‿・ )'],  // home face looking left: eyes shifted inside the brackets
    lookRight: ['( ・‿・)'],
    giggle:    ['(≧▽≦)'],     // one click/tap
    dizzy:     ['(@_@)'],     // three quick clicks/taps
    tableflip: ['(╯°□°)╯︵ ┻━┻'], // six quick clicks/taps: you asked for it
    listening: ['(・ω・)…'],  // while someone types
  },

  // Neon glow colours from Nösnäsgymnasiet's graphic profile. Pick with ?color=bla in the URL.
  colors: {
    rosa: '#C70066',
    bla:  '#5FABC9',
    gron: '#8BB31D',
    gul:  '#F2B640',
  },
  defaultColor: 'rosa',

  // When it is "open". Days: 1 = Monday … 7 = Sunday. Outside these hours it stays asleep
  // and only wakes briefly (groggy) when it notices someone.
  schoolHours: { days: [1, 2, 3, 4, 5], from: '07:30', to: '17:00' },

  sleepAfterMinutes: 5,      // no input or motion this long → it falls asleep
  greetCooldownSeconds: 60,  // at most one wave per minute for passers-by

  // Random idle program while awake. Higher weight = more often.
  idleMoods: {
    happy: 3, thinking: 2, wink: 2, surprised: 1, party: 1,
    smug: 1, cool: 1, love: 1, excited: 1, shrug: 1,
  },
  idleMoodEverySeconds: [20, 40], // random gap between moods (min, max)
  blinkEverySeconds: [3, 8],
  glanceEverySeconds: [10, 25], // looks to the side now and then, so it seems alive without a mouse
  blipEverySeconds: [60, 120],  // a Tron light zipping along the brick wall now and then; null = off

  // Fixed moments in the day. They override the random program for a few minutes.
  moments: [
    { at: '08:00', days: [1, 2, 3, 4, 5], face: 'yawn',   minutes: 2 },
    { at: '11:30', days: [1, 2, 3, 4, 5], face: 'hungry', minutes: 5 },
    { at: '15:00', days: [5],             face: 'party',  minutes: 10 },
  ],

  // Manual override: Alt + number holds a face until Esc (or Alt+0). Alt+S = sleep now.
  // Alt is needed so that ordinary typing only makes it listen.
  keys: {
    1: 'home', 2: 'happy', 3: 'greet', 4: 'thinking', 5: 'surprised',
    6: 'party', 7: 'wink', 8: 'shrug', 9: 'cool',
    // Faces without a key can still be shown with ?face=name in the URL.
  },

  // Local AI prompt: only on the computer running Ollama, with the page opened at http://127.0.0.1:8000
  // (python3 presence.py). Start typing to chat; Esc or closeAfterMinutes without use wipes the chat.
  chat: {
    ollama: 'http://127.0.0.1:11434',
    model: 'gemma4:12b',   // any model from `ollama list`; ~8 GB graphics memory, fluent Swedish
    closeAfterMinutes: 5,
    // How long Ollama keeps the model in memory after use. Loading it takes up to ~30 s, so on a computer
    // dedicated to the mascot keep it loaded: -1 = always. Use e.g. '30m' if the computer is used for more.
    keepAlive: -1,
    // Room for the system prompt plus the conversation, in tokens. Ollama's default (4096) is too small for
    // the facts in promptFile: the model would silently forget them. More context uses more graphics memory.
    contextTokens: 8192,
    // How freely the model picks its words: 0 = always the most likely word, 1 = Gemma's default (creative).
    // Lower makes it stick to the facts in promptFile; too low and the answers turn stiff and repetitive.
    temperature: 0.6,
    // The mascot's instructions and everything it knows about the school: a plain text file in this folder,
    // so anyone can update the facts without touching code. It is read again every time the chat opens.
    promptFile: 'ai-prompt.md',
  },
};
