// strudel
let repl;
let score;          // what the page shows, and the pattern of words behind it
let playing = false;
let state = 'loading strudel...';
let problem = null; // the line that doesn't read, if any

const bpm = 180;
const cps = bpm / 60 / 4;

const scoreEl = document.querySelector('#code');
const statusEl = document.querySelector('#status');

scoreEl.value = `I'm <shivering trembling unravelling>
into <your our> hands
<tearing stringing> my heart <open close>
just to see <[the light][your pain]>

the <rain noise static>*4 whispers
syllable by syllable
until I <vanish stray scatter>*2
[~ into] [the sky]*3`;

async function boot() {
    repl = await initStrudel({ prebake: () => samples('github:tidalcycles/dirt-samples') });
    state = 'ready';
    read();
    report();
    frame();
}

boot();

// text

// three bars of the amen, thought of as 48 slices. 0 is the first kick, 4 the first snare
const BREAK = 'breaks152';
const BREAK_BPM = 152;
const SLICES = 48;

// the slices with a drum on them: kicks and snares. 0 is the first kick, 4 the first snare
const DRUMS = [0, 2, 4, 12, 16, 21, 31, 35, 36, 43, 44];

// how the words cut the break. three to try:
//   strike  every syllable is a drum: it starts the amen on a kick or snare, so the hit lands with the word,
//           and the break keeps going underneath, fading, until the next syllable cuts in
//   loop    the break runs in time with the bar. each word owns a half-bar of the amen; a syllable restarts
//           the beat that belongs at that moment and loops it. always in groove, but the words barely sound
//   hits    every syllable is one short amencutup slice. in time, but a sparse line falls silent
const CHOP = 'strike';

// words that always play from the same place in the break (or write heart:0 inline)
const lexicon = { heart: 0, light: 4 };

function hash(text) {
    let h = 0;
    for (const c of text) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h;
}

// pos is where in the bar the syllable falls, 0..1; seconds is how long until the next one.
// every sound sits in the stereo field where its word sits
function wordToSound(mark, pos, seconds) {
    const key = (text) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}0-9']/gu, '');
    const word = key(mark.word.text);
    const own = mark.n ?? (Object.hasOwn(lexicon, word) ? lexicon[word] : undefined);
    const pan = 0.3 + 0.4 * mark.word.across;
    if (CHOP === 'hits') {
        return { s: 'amencutup', n: (own ?? hash(word)) + mark.part, pan };
    }
    if (CHOP === 'strike') {
        // the word's first syllable may be a chosen slice; the rest walk on through the drums
        const slice = own !== undefined && mark.part === 0 ? own : DRUMS[(hash(word) + mark.part) % DRUMS.length];
        return {
            s: BREAK,
            begin: (slice % SLICES) / SLICES,
            cut: 1,
            speed: (bpm / BREAK_BPM) * (0.96 + (hash(word) % 5) * 0.02),
            attack: 0,
            decay: Math.min(0.5, seconds * 0.8),
            sustain: 0.3,
            pan,
        };
    }
    // loop: half-bars of 8 slices keep the backbeat a backbeat. the moment in the bar picks the slice within it
    const half = own === undefined ? hash(word) % (SLICES / 8) : Math.floor(own / 8);
    const slice = half * 8 + (Math.round(pos * 16) % 8);
    return {
        s: BREAK,
        begin: slice / SLICES,
        loop: 1,
        loopBegin: slice / SLICES,
        loopEnd: Math.min(1, (slice + 4) / SLICES),
        cut: 1,
        speed: bpm / BREAK_BPM,
        pan,
    };
}

function toSound() {
    return score.pattern.withHap((hap) => hap.withValue((mark) => wordToSound(mark, hap.whole.begin.cyclePos().valueOf(), hap.duration.valueOf() / cps)));
}

// read the poem again. the page follows right away, and so does the sound if it's playing
function read() {
    try {
        score = readPoem(scoreEl.value);
        problem = null;
    } catch (err) {
        problem = err.message;
        return;
    }
    setPoem(score.rows);
    if (playing) toSound().play();
}

function play() {
    if (!score) return;
    playing = true;
    state = 'playing';
    repl.setCps(cps);
    toSound().play();
    report();
}

function stop() {
    hush();
    playing = false;
    state = 'stopped';
    report();
}

function report() {
    statusEl.textContent = problem ?? state;
}

scoreEl.addEventListener('input', () => {
    read();
    report();
});

document.querySelector('#play-btn').addEventListener('click', play);
document.querySelector('#stop-btn').addEventListener('click', stop);

document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); play(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); stop(); }
    else if (e.key === 'Escape') document.body.classList.toggle('bare');
});

// visuals

let last = 0;

function frame() {
    const now = repl.scheduler.now();
    if (playing && now > last) {
        for (const hap of score.pattern.queryArc(Math.max(last, now - 0.25), now)) {
            if (hap.hasOnset()) strike(hap.value.word, hap.value.part, hap.duration / cps);
        }
    }
    last = now;
    drawStage();
    requestAnimationFrame(frame);
}
