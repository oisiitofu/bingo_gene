import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "audio", "monster-battle");
const sampleRate = 48000;
mkdirSync(outputDir, { recursive: true });

function createTrack(duration, seed = 1) {
  const length = Math.ceil(duration * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0xffffffff;
  };
  const mix = (index, value, pan = 0) => {
    if (index < 0 || index >= length) return;
    const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
    left[index] += value * Math.cos(angle);
    right[index] += value * Math.sin(angle);
  };
  const envelope = (time, duration, attack = .01, release = .15) => Math.max(0, Math.min(
    1,
    time / Math.max(.001, attack),
    (duration - time) / Math.max(.001, release)
  ));
  const waveValue = (wave, phase) => {
    if (wave === "square") return Math.sin(phase) >= 0 ? 1 : -1;
    if (wave === "saw") return 2 * ((phase / (Math.PI * 2)) % 1) - 1;
    if (wave === "triangle") return (2 / Math.PI) * Math.asin(Math.sin(phase));
    return Math.sin(phase);
  };
  const tone = ({ start = 0, duration: noteDuration = 1, frequency = 440, endFrequency = frequency, amplitude = .2, pan = 0, wave = "sine", attack = .01, release = .15, harmonics = [] }) => {
    let phase = 0;
    const first = Math.floor(start * sampleRate);
    const count = Math.floor(noteDuration * sampleRate);
    const voices = [{ ratio: 1, gain: 1 }, ...harmonics];
    for (let offset = 0; offset < count; offset += 1) {
      const time = offset / sampleRate;
      const progress = time / noteDuration;
      const currentFrequency = frequency * Math.pow(endFrequency / frequency, progress);
      phase += Math.PI * 2 * currentFrequency / sampleRate;
      let value = 0;
      voices.forEach(({ ratio, gain }) => { value += waveValue(wave, phase * ratio) * gain; });
      mix(first + offset, value * amplitude * envelope(time, noteDuration, attack, release), pan);
    }
  };
  const noise = ({ start = 0, duration: noiseDuration = 1, amplitude = .2, pan = 0, attack = .002, release = .2, color = "white", sweep = 1 }) => {
    const first = Math.floor(start * sampleRate);
    const count = Math.floor(noiseDuration * sampleRate);
    let low = 0;
    let previous = 0;
    for (let offset = 0; offset < count; offset += 1) {
      const time = offset / sampleRate;
      const white = random() * 2 - 1;
      low += .04 * (white - low);
      const shaped = color === "low" ? low * 2.8 : (color === "high" ? white - previous : white);
      previous = white;
      const sweepGain = Math.pow(1 - time / noiseDuration, sweep);
      mix(first + offset, shaped * amplitude * envelope(time, noiseDuration, attack, release) * sweepGain, pan);
    }
  };
  const kick = (start, strength = 1) => {
    tone({ start, duration: .42, frequency: 155, endFrequency: 42, amplitude: .62 * strength, release: .3, harmonics: [{ ratio: .5, gain: .38 }] });
    noise({ start, duration: .055, amplitude: .25 * strength, color: "high", release: .05 });
  };
  const snare = (start, pan = 0, strength = 1) => {
    noise({ start, duration: .26, amplitude: .34 * strength, pan, color: "high", release: .21 });
    tone({ start, duration: .22, frequency: 190, endFrequency: 128, amplitude: .2 * strength, pan, release: .18 });
  };
  const impact = (start, strength = 1, pan = 0) => {
    kick(start, 1.28 * strength);
    tone({ start, duration: 1.05, frequency: 118, endFrequency: 30, amplitude: .48 * strength, pan, release: .86, harmonics: [{ ratio: .5, gain: .52 }, { ratio: 2, gain: .18 }] });
    noise({ start, duration: .7, amplitude: .38 * strength, pan, color: "low", release: .62 });
    noise({ start, duration: .18, amplitude: .32 * strength, pan, color: "high", release: .16 });
  };
  return { left, right, tone, noise, kick, snare, impact };
}

function writeWav(name, track) {
  let peak = 0;
  for (let index = 0; index < track.left.length; index += 1) peak = Math.max(peak, Math.abs(track.left[index]), Math.abs(track.right[index]));
  const gain = peak > 0 ? .93 / peak : 1;
  const dataSize = track.left.length * 4;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < track.left.length; index += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track.left[index] * gain)) * 32767), 44 + index * 4);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, track.right[index] * gain)) * 32767), 46 + index * 4);
  }
  const outputPath = resolve(outputDir, name);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buffer);
}

function battleBgm() {
  const track = createTrack(31.2, 9071);
  const beat = .4;
  const roots = [55, 65.406, 73.416, 49];
  track.noise({ start: 0, duration: 1.2, amplitude: .13, color: "high", attack: .02, release: .05, sweep: .15 });
  track.impact(.18, .72);
  for (let step = 0; step < 76; step += 1) {
    const start = .8 + step * beat;
    const barStep = step % 4;
    const root = roots[Math.floor(step / 8) % roots.length];
    track.kick(start, barStep === 0 ? .95 : .72);
    if (barStep === 1 || barStep === 3) track.snare(start, barStep === 1 ? -.18 : .18, .78);
    [0, .5].forEach((fraction, index) => track.noise({ start: start + fraction * beat, duration: .07, amplitude: index ? .08 : .11, pan: index ? .45 : -.45, color: "high", release: .055 }));
    track.tone({ start, duration: beat * .82, frequency: root, amplitude: .18, wave: "saw", release: .12, harmonics: [{ ratio: .5, gain: .55 }, { ratio: 2, gain: .16 }] });
    if (barStep === 0 || barStep === 2) {
      [root * 2, root * 3, root * 4].forEach((frequency, index) => track.tone({ start, duration: beat * 1.65, frequency, amplitude: .035, pan: (index - 1) * .42, wave: "square", attack: .025, release: .32 }));
    }
    if (step % 8 >= 4) {
      const lead = [2, 3, 4, 6][step % 4];
      track.tone({ start: start + beat * .5, duration: beat * .42, frequency: root * lead, amplitude: .07, pan: step % 2 ? .35 : -.35, wave: "triangle", release: .13, harmonics: [{ ratio: 2, gain: .24 }] });
    }
  }
  [8.8, 16.8, 24.8].forEach((start) => {
    track.noise({ start: start - .7, duration: .74, amplitude: .13, color: "high", attack: .58, release: .04, sweep: .1 });
    track.impact(start, .62);
  });
  return track;
}

function physicalHit() {
  const track = createTrack(.95, 211);
  track.noise({ start: 0, duration: .11, amplitude: .28, color: "high", attack: .001, release: .09 });
  track.impact(.075, 1.12, -.08);
  [820, 1190, 1760].forEach((frequency, index) => track.tone({ start: .07 + index * .012, duration: .22, frequency, endFrequency: frequency * .55, amplitude: .08, pan: (index - 1) * .35, wave: "square", release: .19 }));
  return track;
}

function magicHit() {
  const track = createTrack(1.15, 422);
  track.noise({ start: 0, duration: .32, amplitude: .18, color: "high", attack: .22, release: .025, sweep: .15 });
  track.tone({ start: 0, duration: .34, frequency: 260, endFrequency: 1180, amplitude: .18, pan: -.28, wave: "triangle", attack: .03, release: .04, harmonics: [{ ratio: 2, gain: .36 }] });
  track.impact(.31, .9, .18);
  [740, 1046.5, 1480].forEach((frequency, index) => track.tone({ start: .32, duration: .7, frequency, endFrequency: frequency * .62, amplitude: .09, pan: (index - 1) * .45, release: .58, harmonics: [{ ratio: 2.01, gain: .28 }] }));
  return track;
}

function specialHit() {
  const track = createTrack(1.65, 844);
  track.noise({ start: 0, duration: .45, amplitude: .22, color: "high", attack: .34, release: .03, sweep: .1 });
  track.tone({ start: 0, duration: .45, frequency: 95, endFrequency: 850, amplitude: .22, wave: "saw", attack: .04, release: .04 });
  track.impact(.4, 1.35);
  track.impact(.54, .78, -.42);
  track.impact(.62, .72, .42);
  [196, 293.66, 392, 587.33, 783.99].forEach((frequency, index) => track.tone({ start: .4 + index * .026, duration: 1.12, frequency, endFrequency: frequency * .55, amplitude: .1, pan: (index - 2) * .28, wave: index < 2 ? "saw" : "triangle", release: .9, harmonics: [{ ratio: 2, gain: .24 }] }));
  return track;
}

writeWav("boss-bgm/bgm.wav", battleBgm());
writeWav("physical-hit.wav", physicalHit());
writeWav("magic-hit.wav", magicHit());
writeWav("special-hit.wav", specialHit());
console.log(`Generated monster battle audio in ${outputDir}`);
