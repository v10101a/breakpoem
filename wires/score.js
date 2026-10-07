// score: reads the poem as mini-notation, one line per cycle.
// gives back what to draw (a place for every line) and what to play (a pattern of words).
// a place is a word, a row of places, or a slot that shows one of several places at a time.

const LETTER = /[\p{L}0-9]/u;

// how a line is divided in time. two to try:
//   syllables  evenly among its syllables: a word is worth as many steps as it has syllables, so I'm trembling
//              counts 1 2 3, and word*2 says the word twice and takes twice the room. a rest keeps about
//              a word's share of the line
//   words      evenly among its words, the way mini-notation reads it, and then each word's step among its
//              syllables: I'm trembling is 1, then 2 3 in the same room the 1 had
const STEPS = 'syllables';

// mini-notation can't read everything a poem has in it. swap those characters one for one,
// so an offset into the code still points at the same character of the line
function toMini(text) {
    const loose = [];   // characters only the page keeps, like quotes
    let code = '';
    let euclid = 0;     // inside word(3,8)
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const before = text[i - 1] ?? '';
        const after = text[i + 1] ?? '';
        let out = ' ';
        if (LETTER.test(c) || '~-#.^_[]<>{},|*!@?'.includes(c)) out = c;
        else if ("'‘’".includes(c)) out = 'ʼ';                       // a letter, so I'm stays one word
        else if ('—–'.includes(c)) out = '-';                        // a dash is a rest you can see
        else if (c === '…') out = '.';
        else if (c === '(' && /[\p{L}0-9\]>}]/u.test(before)) { out = c; euclid++; }
        else if (c === ')' && euclid > 0) { out = c; euclid--; }
        else if (c === ':' && /[0-9]/.test(after)) out = c;          // rain:4 picks a chop
        else if (c === '/' && /[0-9<\[]/.test(after)) out = c;
        else if (c === '%' && before === '}') out = c;
        loose[i] = out === ' ' && !/\s/.test(c);
        code += out;
    }
    return { code, loose };
}

// the word as it was typed: the atom, plus the punctuation around it that
// mini-notation read as an operator (out! why? so,) or couldn't read at all
function spell(line, from, to) {
    let start = from;
    while (line.loose[start - 1]) start--;
    // an opening quote is ours. the slash in and/or belongs to the word before
    if (start === 0 || /\s/.test(line.text[start - 1])) from = start;
    for (;;) {
        if (line.loose[to]) to++;
        else if (/[!?,]/.test(line.text[to] ?? '') && !/^[!?]*[0-9]/.test(line.text.slice(to + 1))) to++;
        else break;
    }
    return line.text.slice(from, to);
}

const DIGRAPHS = ['ch', 'sh', 'th', 'ph', 'wh', 'qu', 'ck'];

// split a word into syllables: one vowel group each, with english rules of thumb.
// a hyphen always splits, so write po-em to insist
function syllables(text) {
    if (/\p{L}-\p{L}/u.test(text)) return text.split(/(?<=-)(?=\p{L})/u).flatMap(syllables);
    const lower = text.toLowerCase();
    const first = lower.search(/\p{L}/u);
    const cut = lower.search(/['‘’]/);     // what follows an apostrophe (I'm, we're) adds no syllable
    const isLetter = (i) => /\p{L}/u.test(lower[i] ?? '');
    const plain = (i) => /[aeiou]/.test(lower[i] ?? '');
    const isVowel = (i) => /[aeiouy]/.test(lower[i] ?? '') && !(cut >= 0 && i > cut)
        && !(lower[i] === 'y' && (i === first || (plain(i - 1) && plain(i + 1))))   // yes, be-yond
        && !(lower[i] === 'u' && lower[i - 1] === 'q');
    // two vowels that usually make two syllables: ra-di-o, di-al, du-al. but na-tion, so-cial, guard
    const hiatus = (i) => {
        const pair = lower.slice(i - 1, i + 1);
        if (pair === 'yi') return true;     // fly-ing
        if (pair === 'io') return lower[i + 1] !== 'n';
        if (pair === 'ia') return !/[cts]/.test(lower[i - 2] ?? '');
        if (pair === 'ua') return !/[qg]/.test(lower[i - 2] ?? '');
        return false;
    };
    const nuclei = [];      // vowel groups, as [start, end)
    for (let i = 0; i < lower.length; i++) {
        if (!isVowel(i)) continue;
        if (nuclei.length && nuclei[nuclei.length - 1][1] === i && !hiatus(i)) nuclei[nuclei.length - 1][1] = i + 1;
        else nuclei.push([i, i + 1]);
    }
    if (nuclei.length < 2) return [text];
    // a final e is usually silent (make, makes, waked) but not always (table, boxes, folded, toppled)
    const [s, e] = nuclei[nuclei.length - 1];
    const tail = lower.slice(e).replace(/[^\p{L}]/gu, '');
    if (e - s === 1 && lower[s] === 'e' && isLetter(s - 1) && !isVowel(s - 1)) {
        const before = lower.slice(0, s);
        const stable = /[^aeiou]l$/.test(before);    // ta-ble, ta-bles, top-pled
        const silent = (tail === '' && !stable)
            || (tail === 's' && !stable && !/(s|x|z|ch|sh)$/.test(before))
            || (tail === 'd' && !stable && !/[dt]$/.test(before));
        if (silent) nuclei.pop();
    }
    if (nuclei.length < 2) return [text];
    // the consonants between two vowel groups: one goes right (shi-ver), more get split (lit-tle)
    const cuts = [];
    for (let i = 1; i < nuclei.length; i++) {
        const from = nuclei[i - 1][1];
        const to = nuclei[i][0];
        const between = lower.slice(from, to);
        const last = i === nuclei.length - 1;
        if (last && lower[to] === 'e' && /^(s|d)?$/.test(tail) && between.length >= 2 && between.endsWith('l')) cuts.push(to - 2);
        else if (between.length <= 1 || (between.length === 2 && DIGRAPHS.includes(between))) cuts.push(from);
        else cuts.push(from + 1);
    }
    const chunks = [];
    let start = 0;
    for (const at of cuts) {
        chunks.push(text.slice(start, at));
        start = at;
    }
    chunks.push(text.slice(start));
    return chunks.filter(Boolean);
}

function placeOf(node, line, slots) {
    if (node.type_ === 'element') return placeOf(node.source_, line, slots);
    if (node.type_ === 'atom') {
        if (node.source_ === '~') return null;
        const [from, to] = getLeafLocation(line.code, node);
        const text = spell(line, from - 1, to - 1);     // the code has a quote in front
        const voiced = LETTER.test(text);
        const parts = (voiced ? syllables(text) : [text]).map((chunk) => ({ text: chunk }));
        const across = (from - 1) / Math.max(1, line.text.length);     // how far along the line it sits
        const word = { kind: 'word', text, at: from, slots, voiced, parts, across };
        line.words.set(from, word);
        return word;
    }
    switch (node.arguments_.alignment) {
        case 'rand':                // a|b|c: one place, picked at random
            return slotOf(node.source_, line, slots);
        case 'polymeter_slowcat':   // <a b c>: one place, the next one each time round
            return rowOf(node.source_.map((layer) => slotOf(layer.source_, line, slots)));
        default:                    // a b c, [a b], {a b c}%4, a . b: side by side
            return rowOf(node.source_.map((kid) => placeOf(kid, line, slots)));
    }
}

function rowOf(kids) {
    kids = kids.filter(Boolean);
    return kids.length === 1 ? kids[0] : { kind: 'row', kids };
}

function slotOf(nodes, line, slots) {
    const slot = { kind: 'slot', current: 0, kids: [] };
    slot.kids = nodes.map((node, i) => placeOf(node, line, [...slots, [slot, i]]));
    return slot;
}

function readLine(text) {
    const { code, loose } = toMini(text);
    if (!code.trim()) return { place: null };   // a blank line is a gap on the page, not a silent cycle
    const line = { text, loose, code: `"${code}"`, words: new Map() };
    const ast = mini2ast(line.code);
    const row = { place: placeOf(ast, line, []), heat: 0 };
    for (const word of line.words.values()) word.row = row;
    // each hap remembers where in the code it came from. that's how a sound finds its word.
    // then each word becomes its syllables in a row, and the line is divided up as STEPS says
    const marks = patternifyAST(ast, line.code)
        .withHap((hap) => hap.withValue((value) => ({
            word: hap.context.locations.map((loc) => line.words.get(loc.start)).find(Boolean),
            n: Array.isArray(value) ? value[1] : undefined,
        })))
        .filterValues((mark) => mark.word?.voiced);
    const parts = (mark) => fastcat(...mark.word.parts.map((part, i) => ({ ...mark, part: i })));
    row.pattern = STEPS === 'words'
        ? marks.squeezeBind(parts)
        : marks.stepBind((mark) => parts(mark).setSteps(mark.word.parts.length));
    return row;
}

function readPoem(text) {
    const rows = text.split('\n').map((line, i) => {
        try {
            return readLine(line);
        } catch (err) {
            // the parser saw the line in quotes, so hitting the closing quote means the line ended too soon
            const found = /but (.+) found/.exec(err.message)?.[1];
            const what = !found || found === '"\\""' || found === 'end of input' ? 'the line to end there' : found;
            throw new Error(`line ${i + 1}: didn't expect ${what}`);
        }
    });
    rows.forEach((row, i) => { row.n = i; });
    const lines = rows.filter((row) => row.pattern);
    return { rows, pattern: lines.length ? cat(...lines.map((row) => row.pattern)) : silence };
}
