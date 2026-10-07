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
in <your our> hands
<tearing stringing> my heart(3,8) <open close>
just to see <[the light][your pain]>

the <rain noise static>*4 whispers
syllable by syllable
until I <vanish stray scatter>*2
[~ into] [the sky]*3`;

// upright (a phone, or a 9:16 window for a post) the code block is only as tall as the poem, so the
// stage gets the rest. the stylesheet says when that is
const upright = matchMedia('(max-width: 720px), (max-aspect-ratio: 4/5)');

function fitCode() {
    scoreEl.style.height = '';
    if (upright.matches) scoreEl.style.height = `${scoreEl.scrollHeight}px`;
}

fitCode();
upright.addEventListener('change', fitCode);

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

// how the words cut the break. four to try:
//   carve   the break runs on underneath, in time, and sounds only where a syllable is: each syllable plays
//           the stretch of the bar that is under it. the groove is kept and the words cut holes in it
//   strike  every syllable is a drum: it starts the amen on a kick or snare, so the hit lands with the word,
//           and the break keeps going underneath, fading, until the next syllable cuts in
//   loop    the break runs in time with the bar. each word owns a half-bar of the amen; a syllable restarts
//           the beat that belongs at that moment and loops it. always in groove, but the words barely sound
//   hits    every syllable is one short amencutup slice. in time, but a sparse line falls silent
const CHOP = 'carve';

// in carve, how much of the bar a syllable lets through, at most. a longer syllable goes quiet after that,
// so the words leave holes in the break; a shorter one plays for its whole length. 1/16 is choppier
const HIT = 1 / 2;

// in carve, how loud the whole break is under the words, dulled, so a sparse line keeps its pulse. 0 for none
const GHOST = 0.001;

// in carve, what a word does to the stretch of the break under it. the word's hash picks one, so the same
// word always sounds the same way and a different word sounds different. these all stay on the grid and
// stay the break: shift reads the bar so many sixteenths along (4 is a beat: a kick where a snare was),
// bar reads one bar of the sample whatever the clock says, hit is the word's own hit length.
// any sound control goes too (lpf, hpf, crush, coarse, speed, gain...), and back plays it backwards
const VOICES = [
    {},                             // as it comes
    { shift: 8 },                   // the other half of the bar: same backbeat, other hats
    { shift: 4 },                   // a beat along
    { bar: 2 },                     // always the third bar
    { hit: 1 / 8 },                 // short
    { hit: 1 },                     // rings for the whole syllable
    // the ones that take the break apart. put any back in to hear it
    // { back: true },              // backwards
    // { crush: 5 },                // crushed
    // { lpf: 450 },                // under a blanket
    // { hpf: 2500, gain: 1.3 },    // just the hats
    // { speed: 2 },                // an octave up, over in half the time
];

// words that always play from the same place in the break (or write heart:0 inline)
const lexicon = { heart: 0, light: 4 };

function hash(text) {
    let h = 0;
    for (const c of text) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return h;
}

// pos is where in the bar the syllable falls, 0..1; len is how much of the bar it lasts; cycle counts bars.
// every sound sits in the stereo field where its word sits
function wordToSound(mark, pos, len, cycle) {
    const seconds = len / cps;
    const key = (text) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[^\p{L}0-9']/gu, '');
    const word = key(mark.word.text);
    const own = mark.n ?? (Object.hasOwn(lexicon, word) ? lexicon[word] : undefined);
    const pan = 0.3 + 0.4 * mark.word.across;
    if (CHOP === 'carve') {
        // whichever of the sample's three bars is up, the stretch of it under the syllable, for a hit's length.
        // a word with its own slice is a hit from there instead. the word's voice colours it
        const { back, hit = HIT, bar = cycle % 3, shift = 0, ...voice } = VOICES[hash(word) % VOICES.length];
        const at = (((pos + shift / 16) % 1) + 1) % 1;    // where in the bar to read, wrapped
        const from = own !== undefined && mark.part === 0 ? (own % SLICES) / SLICES : (bar + at) / 3;
        const to = Math.min(1, from + Math.min(len, hit) / 3);
        const speed = (bpm / BREAK_BPM) * (voice.speed ?? 1);
        return {
            s: BREAK,
            cut: 1,
            pan,
            ...voice,
            // backwards: strudel flips the whole sample before it reads begin and end, so flip those too
            begin: back ? 1 - to : from,
            end: back ? 1 - from : to,
            speed: back ? -speed : speed,
        };
    }
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
    const words = score.pattern.withHap((hap) => hap.withValue((mark) => wordToSound(
        mark,
        hap.whole.begin.cyclePos().valueOf(),
        hap.duration.valueOf(),
        Math.floor(hap.whole.begin.valueOf()),
    )));
    if (CHOP !== 'carve' || !GHOST || score.pattern === silence) return words;
    // the whole break, quiet and dull, one bar a cycle, so the pulse is there under a sparse line
    const ghost = pure({ s: BREAK, speed: bpm / BREAK_BPM, gain: GHOST, lpf: 700 })
        .withHap((hap) => hap.withValue((sound) => {
            const bar = Math.floor(hap.whole.begin.valueOf()) % 3;
            return { ...sound, begin: bar / 3, end: (bar + 1) / 3 };
        }));
    return stack(words, ghost);
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
    fitCode();
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
