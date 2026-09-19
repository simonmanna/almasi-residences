'use client';

import { useEffect, useRef } from 'react';

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  wind: GainNode;
  timer: number;
}

function noise(ctx: AudioContext, seconds = 4) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  // Brown noise: soft, low, wind-like.
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function chirp(ctx: AudioContext, out: AudioNode) {
  const t0 = ctx.currentTime;
  const notes = 2 + Math.floor(Math.random() * 3);
  const base = 2600 + Math.random() * 1400;
  for (let i = 0; i < notes; i++) {
    const t = t0 + i * (0.11 + Math.random() * 0.05);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.07);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.1);
  }
}

/**
 * Evening ambience made in the browser: a low wind and distant birds, muffled
 * indoors. Starts only from the visitor's own toggle, so it is off by default
 * everywhere, mobile included.
 */
export function useAmbience(on: boolean, indoors: boolean) {
  const rig = useRef<Rig | null>(null);

  useEffect(() => {
    if (!on) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    master.connect(ctx.destination);
    const src = noise(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const wind = ctx.createGain();
    wind.gain.value = 0.06;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(wind.gain);
    src.connect(lp).connect(wind).connect(master);
    src.start();
    lfo.start();
    const birds = ctx.createGain();
    birds.gain.value = 1;
    birds.connect(master);
    const schedule = () => {
      if (ctx.state === 'closed') return;
      chirp(ctx, birds);
      r.timer = window.setTimeout(schedule, 2500 + Math.random() * 6000);
    };
    const r: Rig = { ctx, master, wind, timer: window.setTimeout(schedule, 1200) };
    rig.current = r;
    return () => {
      window.clearTimeout(r.timer);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      window.setTimeout(() => void ctx.close(), 350);
      rig.current = null;
    };
  }, [on]);

  useEffect(() => {
    const r = rig.current;
    if (!r) return;
    r.master.gain.linearRampToValueAtTime(indoors ? 0.45 : 1, r.ctx.currentTime + 1.2);
  }, [indoors, on]);
}
