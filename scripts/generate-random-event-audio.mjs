import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(root, "audio", "random-events");
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

  const envelope = (time, duration, attack = .02, release = .25) => {
    const attackGain = Math.min(1, time / Math.max(.001, attack));
    const releaseGain = Math.min(1, (duration - time) / Math.max(.001, release));
    return Math.max(0, Math.min(attackGain, releaseGain));
  };

  const addTone = ({ start = 0, duration = 1, frequency = 440, endFrequency = frequency, amplitude = .2, pan = 0, wave = "sine", attack = .01, release = .2, harmonics = [] }) => {
    const first = Math.floor(start * sampleRate);
    const count = Math.floor(duration * sampleRate);
    let phase = 0;
    harmonics = [{ ratio: 1, gain: 1 }, ...harmonics];
    for (let offset = 0; offset < count; offset += 1) {
      const time = offset / sampleRate;
      const progress = time / duration;
      const currentFrequency = frequency * Math.pow(endFrequency / frequency, progress);
      phase += 2 * Math.PI * currentFrequency / sampleRate;
      let value = 0;
      harmonics.forEach(({ ratio, gain }) => {
        const harmonicPhase = phase * ratio;
        if (wave === "triangle") value += (2 / Math.PI) * Math.asin(Math.sin(harmonicPhase)) * gain;
        else if (wave === "saw") value += (2 * ((harmonicPhase / (2 * Math.PI)) % 1) - 1) * gain;
        else value += Math.sin(harmonicPhase) * gain;
      });
      mix(first + offset, value * amplitude * envelope(time, duration, attack, release), pan);
    }
  };

  const addNoise = ({ start = 0, duration = 1, amplitude = .15, pan = 0, attack = .01, release = .3, color = "white", reverse = false }) => {
    const first = Math.floor(start * sampleRate);
    const count = Math.floor(duration * sampleRate);
    let low = 0;
    let previous = 0;
    for (let offset = 0; offset < count; offset += 1) {
      const time = offset / sampleRate;
      const white = random() * 2 - 1;
      low += .035 * (white - low);
      let value = white;
      if (color === "pink") value = low * 2.6;
      if (color === "high") value = white - previous;
      previous = white;
      const sweep = reverse ? Math.pow(time / duration, 1.5) : 1;
      mix(first + offset, value * amplitude * envelope(time, duration, attack, release) * sweep, pan);
    }
  };

  const addImpact = (start, pan = 0, strength = 1) => {
    addTone({ start, duration: 1.25, frequency: 105, endFrequency: 38, amplitude: .52 * strength, pan, attack: .002, release: .78, harmonics: [{ ratio: .5, gain: .42 }] });
    addNoise({ start, duration: .55, amplitude: .32 * strength, pan, attack: .001, release: .48, color: "pink" });
    addNoise({ start, duration: .16, amplitude: .22 * strength, pan, attack: .001, release: .15, color: "high" });
  };

  const addChime = (start, frequency, pan = 0, amplitude = .22, duration = 1.35) => {
    addTone({ start, duration, frequency, amplitude, pan, attack: .003, release: duration * .82, harmonics: [{ ratio: 2, gain: .35 }, { ratio: 3.01, gain: .14 }, { ratio: 4.02, gain: .08 }] });
  };

  return { left, right, addTone, addNoise, addImpact, addChime };
}

function writeWav(name, track) {
  let peak = 0;
  for (let index = 0; index < track.left.length; index += 1) {
    peak = Math.max(peak, Math.abs(track.left[index]), Math.abs(track.right[index]));
  }
  const gain = peak > 0 ? .92 / peak : 1;
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
  writeFileSync(resolve(outputDir, name), buffer);
}

function goldRush() {
  const track = createTrack(4.5, 101);
  track.addImpact(.06, 0, 1.05);
  [659.25, 783.99, 987.77, 1318.51, 1567.98].forEach((note, index) => {
    track.addChime(.28 + index * .19, note, index % 2 ? .42 : -.42, .2, 1.5);
  });
  [0, 1, 2, 3, 4, 5, 6].forEach((index) => {
    const start = 1.42 + index * .22;
    track.addChime(start, 1760 + index * 115, index % 2 ? .72 : -.72, .11, .52);
  });
  track.addTone({ start: 1.05, duration: 3.1, frequency: 261.63, endFrequency: 392, amplitude: .12, wave: "triangle", release: .8, harmonics: [{ ratio: 1.5, gain: .35 }] });
  track.addNoise({ start: .1, duration: 3.7, amplitude: .09, color: "pink", attack: .25, release: 1.1 });
  return track;
}

function secondWind() {
  const track = createTrack(4.8, 202);
  track.addNoise({ start: 0, duration: 1.45, amplitude: .28, color: "high", reverse: true, attack: .02, release: .04 });
  track.addTone({ start: .05, duration: 1.4, frequency: 120, endFrequency: 720, amplitude: .16, wave: "sine", attack: .04, release: .05 });
  track.addImpact(1.34, 0, .92);
  [261.63, 329.63, 392, 523.25].forEach((note, index) => track.addChime(1.42 + index * .13, note, (index - 1.5) * .25, .19, 2.7));
  track.addTone({ start: 1.45, duration: 3.05, frequency: 523.25, endFrequency: 784, amplitude: .1, pan: -.25, release: .9, harmonics: [{ ratio: 2, gain: .28 }] });
  track.addTone({ start: 1.5, duration: 3, frequency: 659.25, endFrequency: 1046.5, amplitude: .09, pan: .25, release: .9, harmonics: [{ ratio: 2, gain: .24 }] });
  track.addNoise({ start: 1.2, duration: 3.25, amplitude: .075, color: "pink", attack: .4, release: 1.2 });
  return track;
}

function spotlight() {
  const track = createTrack(4.35, 303);
  [.08, .3, .52].forEach((start, index) => {
    track.addNoise({ start, duration: .08, amplitude: .33, pan: index === 1 ? .55 : -.55, attack: .001, release: .075, color: "high" });
    track.addTone({ start, duration: .16, frequency: 1550 + index * 320, endFrequency: 1120, amplitude: .09, pan: index === 1 ? .55 : -.55, release: .14 });
  });
  track.addImpact(.68, 0, .96);
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((note, index) => track.addChime(.78 + index * .16, note, index % 2 ? .5 : -.5, .19, 1.8));
  track.addTone({ start: 1.25, duration: 2.75, frequency: 196, endFrequency: 293.66, amplitude: .13, wave: "triangle", release: .8, harmonics: [{ ratio: 1.5, gain: .42 }] });
  track.addNoise({ start: .72, duration: 3.2, amplitude: .075, color: "pink", attack: .25, release: 1 });
  return track;
}

function pressureDrop() {
  const track = createTrack(4.7, 404);
  [0, .42, .84].forEach((start, index) => {
    track.addTone({ start, duration: .28, frequency: 880 - index * 90, endFrequency: 760 - index * 90, amplitude: .18, wave: "triangle", attack: .005, release: .2, harmonics: [{ ratio: 2, gain: .22 }] });
  });
  track.addImpact(.9, 0, 1.1);
  track.addTone({ start: .92, duration: 3.2, frequency: 420, endFrequency: 54, amplitude: .22, wave: "saw", attack: .01, release: 1.1, harmonics: [{ ratio: .5, gain: .5 }] });
  track.addNoise({ start: .94, duration: 3.5, amplitude: .26, color: "high", attack: .01, release: 1.25 });
  track.addNoise({ start: 1.05, duration: 3.35, amplitude: .11, color: "pink", attack: .04, release: 1.3 });
  [1.05, 1.18, 1.34, 1.55].forEach((start, index) => track.addChime(start, 680 - index * 95, index % 2 ? .7 : -.7, .07, .42));
  return track;
}

writeWav("gold-rush.wav", goldRush());
writeWav("second-wind.wav", secondWind());
writeWav("spotlight.wav", spotlight());
writeWav("pressure-drop.wav", pressureDrop());
console.log(`Generated random-event audio in ${outputDir}`);
