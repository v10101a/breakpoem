// strudel
let repl;
let pattern;

const scoreEl = document.querySelector('#code');
const statusEl = document.querySelector('#status');

scoreEl.value = 'rain tide ~ static';

async function boot() {
    repl = await initStrudel({ prebake: () => samples('github:tidalcycles/dirt-samples') });
    statusEl.textContent = 'ready';
    frame();
}

boot();

// text

const lexicon = { rain: 4, tide: 8, static: 13 };

function play() {
    // const words = mini(scoreEl.value);
    // pattern = words.fmap(wordToSound);

    // split lines for catting
    const line = scoreEl.value.split('\n')
    let wordss = []
    for (let i = 0; i < line.length; i++) {
        wordss.push(mini(line[i]))
        line[i].trim() === ''
    }
    pattern = cat(...wordss).fmap(wordToSound)
    repl.setCps(172 / 60 / 4);
    pattern.play()
    statusEl.textContent = 'playing';
}

function wordToSound(word) {
    let chop = lexicon[word] ?? 0;
    return { s: 'amencutup', n: chop, word: word };
}


document.querySelector('#play-btn').addEventListener('click', play)

document.querySelector('#stop-btn').addEventListener('click', () => {
    hush();
    statusEl.textContent = 'stopped';
})


//visuals

let last = 0;
const poemEl = document.querySelector('#poem');

function frame() {
    const now = repl.scheduler.now();
    if (pattern && now > last) {
        const haps = pattern.queryArc(last, now);
        for (const hap of haps) {
            if (hap.hasOnset()) {
                console.log(hap.value.word);
                poemEl.textContent = hap.value.word;
            }
        }
    }
    last = now;
    requestAnimationFrame(frame);
}