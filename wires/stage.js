// stage: draws the poem in the sky, lights each syllable as it sounds, and threads them together in order

const sceneEl = document.querySelector('#scene');
const bloomEl = document.querySelector('#bloom');
const haloEl = document.querySelector('#halo');
const lightEl = document.createElement('canvas');   // the scene on black, small: what glows
const vaporEl = document.querySelector('#vapor');   // under the words, half size and blurred: what dissolves
const ctx = sceneEl.getContext('2d');
const bloomCtx = bloomEl.getContext('2d');
const haloCtx = haloEl.getContext('2d');
const lightCtx = lightEl.getContext('2d');
const vaporCtx = vaporEl.getContext('2d');

const FACE = '"Times New Roman", Times, serif';
const LEADING = 1.2;    // line height, in ems
const SPACE = 0.26;     // gap between words, in ems
const PATH = 7;         // seconds the thread takes to fade. long: it is a trail, not a flash
const VAPOR = 3.4;      // seconds a syllable takes to dissolve into the sky
const COPIES = 5;       // a dissolving syllable is this many faint copies, scattering as it ages
const INK = [255, 255, 255];
const LIT = [244, 255, 94];     // the syllable sounding
const TRAIL = [255, 92, 196];   // the thread
const FRAME = [120, 246, 255];  // the box
const FOG = [198, 206, 238];    // what vapor fades toward: the sky where the path starts
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// a tile of soft blots. the vapor is seen through it, so it is mottled like cloud, not flat
const grain = document.createElement('canvas');
grain.width = grain.height = 256;
{
    const g = grain.getContext('2d');
    g.fillStyle = 'rgba(255, 255, 255, 0.5)';
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 80; k++) {
        const r = 12 + Math.random() * 36;
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const blot = g.createRadialGradient(x, y, 0, x, y, r);
        blot.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        blot.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = blot;
        // painted nine times, shifted a tile each way, so the tile repeats without a seam
        for (const ox of [-256, 0, 256]) {
            for (const oy of [-256, 0, 256]) {
                g.setTransform(1, 0, 0, 1, ox, oy);
                g.fillRect(0, 0, 256, 256);
            }
        }
    }
}
const weave = vaporCtx.createPattern(grain, 'repeat');

let rows = [];          // from readPoem
let hits = [];          // recent hits, oldest first. the thread runs through them
let puffs = [];         // syllables drifting off as vapor
let fontSize = 48;
let stageW = 0;
let stageH = 0;
let clock = 0;          // seconds
let tick = 0;           // frames

function setPoem(poemRows) {
    rows = poemRows;
    hits = [];
    fitPoem();
}

// the words a place is showing right now
function* shown(place) {
    if (!place) return;
    if (place.kind === 'word') yield place;
    else if (place.kind === 'slot') yield* shown(place.kids[place.current]);
    else for (const kid of place.kids) yield* shown(kid);
}

// every word a place could show
function* everyWord(place) {
    if (!place) return;
    if (place.kind === 'word') yield place;
    else for (const kid of place.kids) yield* everyWord(kid);
}

// the width of a place when it shows its widest word
function widest(place, gap) {
    if (!place) return 0;
    if (place.kind === 'word') return place.w;
    const widths = place.kids.map((kid) => widest(kid, gap)).filter((w) => w > 0);
    if (place.kind === 'slot') return Math.max(0, ...widths);
    return widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1);
}

function setType(px) {
    ctx.font = `${px}px ${FACE}`;
    ctx.letterSpacing = `${-0.01 * px}px`;
    ctx.textBaseline = 'alphabetic';
}

// a word is drawn syllable by syllable, so measure each and note where it starts
function measure(word, scale) {
    let dx = 0;
    for (const part of word.parts) {
        part.w = ctx.measureText(part.text).width * scale;
        part.dx = dx;
        part.heat ??= 0;
        dx += part.w;
    }
    word.w = dx;
    word.heat ??= 0;
    word.until ??= 0;
}

// measure at 100px, then pick the size where the widest line and the whole stack both fit
function fitPoem() {
    setType(100);
    let wide = 1;
    let tall = 0;
    for (const row of rows) {
        tall += row.place ? 1 : 0.6;
        for (const word of everyWord(row.place)) measure(word, 1);
        wide = Math.max(wide, widest(row.place, 100 * SPACE));
    }
    fontSize = Math.min((stageW * 0.86) / wide * 100, (stageH * 0.84) / (tall * LEADING), stageH * 0.1, 110);
    fontSize = Math.max(12, fontSize);
    for (const row of rows) {
        for (const word of everyWord(row.place)) measure(word, fontSize / 100);
    }
}

function fitStage() {
    const scale = Math.min(devicePixelRatio || 1, 2);
    stageW = sceneEl.clientWidth;
    stageH = sceneEl.clientHeight;
    sceneEl.width = stageW * scale;
    sceneEl.height = stageH * scale;
    lightEl.width = bloomEl.width = Math.ceil(stageW / 4);
    lightEl.height = bloomEl.height = Math.ceil(stageH / 4);
    haloEl.width = Math.ceil(stageW / 8);
    haloEl.height = Math.ceil(stageH / 8);
    vaporEl.width = Math.ceil(stageW / 2);
    vaporEl.height = Math.ceil(stageH / 2);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    vaporCtx.setTransform(0.5, 0, 0, 0.5, 0, 0);    // drawn in stage coordinates, like the scene
    hits = [];
    fitPoem();
}

new ResizeObserver(fitStage).observe(sceneEl);

// center every line, and slide words over when the one next to them changes
function layOut(dt) {
    const leading = fontSize * LEADING;
    const gap = fontSize * SPACE;
    const tall = rows.reduce((sum, row) => sum + (row.place ? 1 : 0.6), 0) * leading;
    const ease = 1 - Math.exp(-dt / 0.05);
    let y = (stageH - tall) / 2 + fontSize * 0.92;
    for (const row of rows) {
        if (!row.place) {
            y += leading * 0.6;
            continue;
        }
        const words = [...shown(row.place)];
        const wide = words.reduce((sum, word) => sum + word.w, 0) + gap * (words.length - 1);
        let x = (stageW - wide) / 2;
        for (const word of words) {
            word.x = word.seen === tick - 1 ? word.x + (x - word.x) * ease : x;
            word.y = y;
            word.seen = tick;
            x += word.w + gap;
        }
        row.heat *= Math.exp(-dt / 0.5);
        y += leading;
    }
}

function paint([r, g, b], alpha) {
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

function mix(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function shake(amount) {
    return still ? 0 : (Math.random() - 0.5) * 2 * amount;
}

function fade(age, life) {
    return Math.max(0, 1 - age / life) ** 2;
}

// a syllable sounded. light it, show its word in its slot, and thread it onto the path
function strike(word, i, seconds) {
    for (const [slot, k] of word.slots) slot.current = k;
    word.heat = 1;
    word.until = clock + seconds;
    word.parts[i].heat = 1;
    word.row.heat = 1;
    const last = hits[hits.length - 1];
    hits.push({
        word,
        i,
        at: clock,
        over: last ? !last.over : true,                         // the thread goes over one syllable, under the next
        sway: shake(0.3),                                       // and not always through the middle
        flip: Math.random() < 0.5,
        lean: Array.from({ length: 8 }, () => shake(0.05)),     // each box sits a little off
    });
    if (hits.length > 96) hits.shift();
    if (!still) {
        puffs.push({
            word,
            i,
            at: clock,
            drift: shake(0.3) + 0.1,
            copies: Array.from({ length: COPIES }, () => ({
                dx: shake(1),
                dy: shake(1),
                size: 0.85 + Math.random() * 0.3,
                phase: Math.random() * Math.PI * 2,
            })),
        });
    }
}

// where the thread passes a syllable: just above it or just below it, following the word if it moved
function anchorOf(hit) {
    const part = hit.word.parts[hit.i];
    const x = hit.word.x + part.dx + part.w * (0.5 + hit.sway);
    return [x, hit.word.y + (hit.over ? -fontSize * 0.8 : fontSize * 0.3)];
}

// the wireframe box a hit drew around its syllable, following the word if it moved
function boxOf(hit) {
    const part = hit.word.parts[hit.i];
    const x = hit.word.x + part.dx;
    const y = hit.word.y;
    const pad = fontSize * 0.08;
    const top = y - fontSize * 0.72;
    const bottom = y + fontSize * 0.24;
    const corners = [[x - pad, top], [x + part.w + pad, top], [x + part.w + pad, bottom], [x - pad, bottom]];
    return corners.map(([cx, cy], i) => [cx + hit.lean[i * 2] * fontSize, cy + hit.lean[i * 2 + 1] * fontSize]);
}

function drawWord(word, row, dt) {
    const held = clock < word.until;
    word.heat = Math.max(word.heat * Math.exp(-dt / 0.3), held ? 0.4 : 0);
    const alpha = word.voiced ? 0.5 + 0.5 * Math.max(row.heat * 0.4, word.heat) : 0.28;
    for (const part of word.parts) {
        part.heat *= Math.exp(-dt / 0.18);
        const x = word.x + part.dx;
        ctx.fillStyle = paint(mix(INK, LIT, part.heat), alpha);
        ctx.fillText(part.text, x, word.y);
        if (part.heat < 0.05) continue;
        // a hot syllable shakes: a few faint copies a little off, new every frame
        ctx.fillStyle = paint(LIT, 0.35 * part.heat);
        for (let k = 0; k < 3; k++) {
            ctx.fillText(part.text, x + shake(part.heat * fontSize * 0.08), word.y + shake(part.heat * fontSize * 0.04));
        }
    }
}

// skywriting: a struck syllable lets off a copy of itself that rises, swells and thins into the sky.
// it goes on the vapor canvas as a few faint copies that wander apart as it ages, so it diffuses
function drawPuffs() {
    puffs = puffs.filter((puff) => clock - puff.at < VAPOR);
    if (puffs.length > 40) puffs.splice(0, puffs.length - 40);
    for (const puff of puffs) {
        const t = (clock - puff.at) / VAPOR;
        const part = puff.word.parts[puff.i];
        const rise = 1 - (1 - t) ** 2;              // quick to leave the line, then hanging
        const spread = fontSize * 0.55 * t;         // how far the copies have wandered
        const x0 = puff.word.x + part.dx + rise * puff.drift * fontSize * 1.4;
        const y0 = puff.word.y - rise * fontSize * 1.5;
        vaporCtx.fillStyle = paint(mix(INK, FOG, t), 0.16 * (1 - t) ** 1.5);
        for (const copy of puff.copies) {
            const grow = copy.size * (1 + t * 0.9);
            const sway = Math.sin(clock * 0.8 + copy.phase) * spread * 0.4;
            vaporCtx.font = `${fontSize * grow}px ${FACE}`;
            vaporCtx.fillText(
                part.text,
                x0 + copy.dx * spread + sway - (grow - 1) * part.w / 2,
                y0 + copy.dy * spread * 0.6,
            );
        }
    }
}

function drawBoxes() {
    for (const hit of hits) {
        const age = clock - hit.at;
        const frame = fade(age, 0.65);
        if (frame <= 0) continue;
        // a wireframe around the syllable, drawn fresh (and a little off) on every hit
        const box = boxOf(hit);
        ctx.lineWidth = 1;
        ctx.strokeStyle = paint(FRAME, frame);
        ctx.beginPath();
        box.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.moveTo(...box[hit.flip ? 0 : 1]);
        ctx.lineTo(...box[hit.flip ? 2 : 3]);
        ctx.stroke();
    }
}

// one thread through every syllable that sounded, oldest to newest: a smooth curve (catmull-rom)
// that fades and thins toward its tail, and is still being drawn out toward its newest point
function drawThread() {
    while (hits.length > 1 && clock - hits[1].at > PATH) hits.shift();
    if (hits.length === 1 && clock - hits[0].at > PATH) hits = [];
    if (hits.length < 2) return;
    const points = hits.map(anchorOf);
    const at = (k) => points[Math.min(Math.max(k, 0), points.length - 1)];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 1; k < points.length; k++) {
        const age = clock - hits[k].at;
        const life = Math.max(0, 1 - age / PATH);
        const [x0, y0] = at(k - 1);
        const [x3, y3] = at(k);
        const [xa, ya] = at(k - 2);
        const [xb, yb] = at(k + 1);
        const x1 = x0 + (x3 - xa) / 9;
        const y1 = y0 + (y3 - ya) / 9;
        const x2 = x3 - (xb - x0) / 9;
        const y2 = y3 - (yb - y0) / 9;
        const reach = k === points.length - 1 ? Math.min(1, age / 0.09) : 1;
        ctx.lineWidth = 1 + 1.8 * life;
        ctx.strokeStyle = paint(TRAIL, 0.12 + 0.8 * life ** 1.3);
        stroke(ctx, [x0, y0, x1, y1, x2, y2, x3, y3], reach);
        // as it ages the same stretch widens and softens on the vapor canvas: the thread turns to haze
        if (reach === 1 && life < 0.85) {
            vaporCtx.lineCap = 'round';
            vaporCtx.lineWidth = 3 + 10 * (1 - life);
            vaporCtx.strokeStyle = paint(TRAIL, 0.35 * (1 - life) * Math.min(1, life * 4));
            stroke(vaporCtx, [x0, y0, x1, y1, x2, y2, x3, y3], 1);
        }
    }
    // a small block at the head of the thread
    const head = hits[hits.length - 1];
    const [hx, hy] = points[points.length - 1];
    const s = fontSize * 0.2;
    ctx.fillStyle = paint(FRAME, 0.6 * fade(clock - head.at, 0.7));
    ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
}

// one stretch of the thread (not named curve: strudel owns that global): a cubic, or only the first part of one while it is still being drawn out
function stroke(c, [x0, y0, x1, y1, x2, y2, x3, y3], reach) {
    c.beginPath();
    c.moveTo(x0, y0);
    if (reach === 1) {
        c.bezierCurveTo(x1, y1, x2, y2, x3, y3);
    } else {
        for (let s = 1; s <= 12; s++) {
            const t = (s / 12) * reach;
            const u = 1 - t;
            c.lineTo(
                u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
                u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
            );
        }
    }
    c.stroke();
}

function drawStage() {
    const now = performance.now() / 1000;
    const dt = Math.min(now - clock, 0.1);
    clock = now;
    tick++;
    if (!stageW) return;
    layOut(dt);

    ctx.clearRect(0, 0, stageW, stageH);
    vaporCtx.globalCompositeOperation = 'source-over';
    vaporCtx.clearRect(0, 0, stageW, stageH);
    setType(fontSize);
    for (const row of rows) {
        for (const word of shown(row.place)) drawWord(word, row, dt);
    }
    drawPuffs();
    drawBoxes();
    drawThread();

    // the vapor is seen through the grain, which drifts, so it is mottled and moving like cloud
    weave.setTransform(new DOMMatrix().translate(still ? 0 : clock * 4, still ? 0 : -clock * 7).scale(1.6));
    vaporCtx.globalCompositeOperation = 'destination-in';
    vaporCtx.fillStyle = weave;
    vaporCtx.fillRect(0, 0, stageW, stageH);

    // the glow: the scene flattened onto black, cubed so only what's really lit blooms, blurred by css
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = '#000';
    lightCtx.fillRect(0, 0, lightEl.width, lightEl.height);
    lightCtx.drawImage(sceneEl, 0, 0, lightEl.width, lightEl.height);
    lightCtx.drawImage(vaporEl, 0, 0, lightEl.width, lightEl.height);
    bloomCtx.globalCompositeOperation = 'copy';
    bloomCtx.drawImage(lightEl, 0, 0);
    bloomCtx.globalCompositeOperation = 'multiply';
    bloomCtx.drawImage(lightEl, 0, 0);
    bloomCtx.drawImage(lightEl, 0, 0);
    haloCtx.globalCompositeOperation = 'copy';
    haloCtx.drawImage(bloomEl, 0, 0, haloEl.width, haloEl.height);
    haloCtx.globalCompositeOperation = 'multiply';
    haloCtx.drawImage(lightEl, 0, 0, haloEl.width, haloEl.height);
}
