/**
 * 程序化合成的轻音乐（lo-fi 氛围）：和弦铺底 + 低音 + 稀疏的钢琴式琶音 + 延迟混响。
 * 同一个 seed 生成同一首曲子，不同视频用不同 seed 得到不同调性、速度与和弦进行。
 */

const SR = 44100;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** 调内第 degree 级（0 起）的七和弦，返回 MIDI 音高 */
function chord(root: number, degree: number) {
  return [0, 2, 4, 6].map((k) => {
    const d = degree + k;
    return root + MAJOR[d % 7] + 12 * Math.floor(d / 7);
  });
}

const PROGRESSIONS = [
  [0, 4, 5, 3], // I V vi IV
  [5, 3, 0, 4], // vi IV I V
  [0, 5, 3, 4], // I vi IV V
  [1, 4, 0, 5], // ii V I vi
  [3, 4, 2, 5], // IV V iii vi
];

export function synthesizeMusic(seconds: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const root = 48 + [0, 2, 3, 5, 7, 9][Math.floor(rand() * 6)];
  const bpm = 68 + Math.floor(rand() * 16);
  const prog = PROGRESSIONS[Math.floor(rand() * PROGRESSIONS.length)];
  const beat = 60 / bpm;
  const chordLen = beat * 8; // 每个和弦两小节
  const n = Math.ceil(seconds * SR);
  const out = new Float32Array(n);

  const chordCount = Math.ceil(seconds / chordLen) + 1;
  for (let c = 0; c < chordCount; c++) {
    const notes = chord(root, prog[c % prog.length]);
    const t0 = c * chordLen;

    // 和弦铺底：每个音两个略微失谐的正弦，慢起慢收，与下一个和弦交叠
    for (const m of notes) {
      for (const detune of [-0.003, 0.003]) {
        const f = midiToHz(m + 12) * (1 + detune);
        addTone(out, t0, chordLen + 1.5, (t, len) => {
          const env = Math.min(1, t / 1.2) * Math.min(1, (len - t) / 1.5);
          return 0.035 * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
        });
      }
    }

    // 低音：第 1、5 拍
    for (const b of [0, 4]) {
      const f = midiToHz(notes[0] - 12);
      addTone(out, t0 + b * beat, beat * 3.5, (t) => 0.12 * Math.exp(-t * 0.9) * Math.min(1, t * 40) * Math.sin(2 * Math.PI * f * t));
    }

    // 琶音：八分音符，随机留白，五声音阶味道
    const pool = [...notes.slice(0, 3).map((m) => m + 24), notes[0] + 36];
    for (let k = 0; k < 16; k++) {
      if (rand() < 0.45) continue;
      const m = pool[Math.floor(rand() * pool.length)];
      const f = midiToHz(m);
      const vel = 0.05 + rand() * 0.04;
      addTone(out, t0 + (k * beat) / 2, 2.5, (t) => {
        const env = Math.exp(-t * 2.2) * Math.min(1, t * 200);
        return vel * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 4));
      });
    }
  }

  // 延迟混响
  const delay = Math.round(beat * 0.75 * SR);
  for (let i = delay; i < n; i++) out[i] += out[i - delay] * 0.32;

  // 归一化 + 首尾淡入淡出
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.7 / peak : 1;
  const fade = 3 * SR;
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, i / fade, (n - i) / fade);
    out[i] *= gain * f;
  }
  return out;

  function addTone(buf: Float32Array, start: number, len: number, fn: (t: number, len: number) => number) {
    const s = Math.floor(start * SR);
    const e = Math.min(buf.length, s + Math.floor(len * SR));
    for (let i = Math.max(0, s); i < e; i++) buf[i] += fn((i - s) / SR, len);
  }
}

/** 单声道 16-bit PCM WAV */
export function encodeWav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}
