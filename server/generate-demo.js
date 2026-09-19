// server/generate-demo.js
// Generates the initial high-fidelity 16-bar Kawai CA-701 piano performance demo
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDir = path.join(__dirname, '..', 'session');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

const ppq = 480;
const ticksPerBar = ppq * 4; // 1920
const bpm = 92;

const notes = [];
const pedals = [];

function addNote(pitch, startTick, durationTicks, velocity) {
  // subtle humanized microtiming and velocity variation
  const jitter = Math.floor((Math.random() - 0.5) * 6);
  notes.push({
    pitch,
    startTick: Math.max(0, startTick + jitter),
    durationTicks,
    velocity: Math.min(127, Math.max(20, velocity + jitter))
  });
}

function addPedal(startTick, endTick) {
  pedals.push({ type: 'damper', cc: 64, value: 127, tick: startTick });
  pedals.push({ type: 'damper', cc: 64, value: 0, tick: endTick - 20 });
}

// 16 Bars composition in D minor / F major
const barHarmonies = [
  // Section 1: Restrained, mysterious (Bars 1-4)
  { bar: 1, lh: [38, 45, 53], rh: [[52, 0, 440], [53, 480, 440], [57, 960, 440], [52, 1440, 440]], vel: 55 }, // Dm9
  { bar: 2, lh: [34, 41, 50], rh: [[50, 0, 440], [53, 480, 440], [57, 960, 440], [60, 1440, 440]], vel: 58 }, // Bbmaj7
  { bar: 3, lh: [31, 38, 46], rh: [[57, 0, 440], [58, 480, 440], [62, 960, 440], [60, 1440, 440]], vel: 60 }, // Gm9
  { bar: 4, lh: [33, 40, 45], rh: [[62, 0, 720], [61, 720, 720], [57, 1440, 480]], vel: 56 },                  // Asus4 -> A7

  // Section 2: Yearning flow (Bars 5-8)
  { bar: 5, lh: [38, 45, 53], rh: [[52, 0, 360], [53, 360, 360], [57, 720, 600], [60, 1440, 480]], vel: 65 }, // Dm9
  { bar: 6, lh: [36, 43, 52], rh: [[60, 0, 480], [64, 480, 480], [65, 960, 960]], vel: 68 },                   // Fmaj7/C
  { bar: 7, lh: [31, 38, 45], rh: [[65, 0, 480], [64, 480, 480], [62, 960, 480], [60, 1440, 480]], vel: 72 }, // Gm7 -> C7
  { bar: 8, lh: [29, 36, 45, 53], rh: [[60, 0, 960], [57, 960, 960]], vel: 62 },                                 // Fmaj7 (space)

  // Section 3: Suspense, tension build (Bars 9-12)
  { bar: 9, lh: [40, 46, 52], rh: [[55, 0, 480], [58, 480, 480], [64, 960, 480], [67, 1440, 480]], vel: 74 }, // Em7b5
  { bar: 10, lh: [33, 45, 53], rh: [[65, 0, 480], [64, 480, 480], [61, 960, 960]], vel: 78 },                  // A7(b13)
  { bar: 11, lh: [38, 45, 50], rh: [[69, 0, 480], [67, 480, 480], [65, 960, 480], [64, 1440, 480]], vel: 85 }, // Dm peak climax
  { bar: 12, lh: [34, 43, 50], rh: [[62, 0, 720], [65, 720, 600], [68, 1440, 480]], vel: 82 },                  // Bb7 -> Bdim7

  // Section 4: Openness, freedom & resolution (Bars 13-16)
  { bar: 13, lh: [33, 45, 53], rh: [[65, 0, 480], [69, 480, 480], [72, 960, 960]], vel: 80 },                  // F/A
  { bar: 14, lh: [36, 43, 48], rh: [[70, 0, 480], [67, 480, 480], [65, 960, 960]], vel: 76 },                  // Csus4 -> C
  { bar: 15, lh: [38, 45, 53], rh: [[62, 0, 480], [60, 480, 480], [57, 960, 960]], vel: 65 },                  // Dm9
  { bar: 16, lh: [26, 38, 45, 50], rh: [[54, 0, 1920], [57, 0, 1920], [62, 0, 1920]], vel: 55 }                 // Dsus2/D warm Picardy ring
];

for (const section of barHarmonies) {
  const barStart = (section.bar - 1) * ticksPerBar;
  
  // Left hand arpeggiation / chord
  let lhOffset = 0;
  for (const p of section.lh) {
    addNote(p, barStart + lhOffset, 1440 - lhOffset, section.vel - 6);
    lhOffset += 240; // gentle 8th-note roll
  }

  // Right hand melody notes
  for (const [pitch, offset, dur] of section.rh) {
    addNote(pitch, barStart + offset, dur, section.vel + 6);
  }

  // Pedal down throughout bar, lifts right before next bar
  addPedal(barStart + 30, barStart + ticksPerBar - 30);
}

const performanceData = {
  id: 'perf-kawai-demo-16bars',
  title: 'Kawai CA-701 16-Bar Performance (D Minor - Yearning to Uplift)',
  recordedAt: new Date().toISOString(),
  bpm,
  timeSignature: [4, 4],
  ppq,
  totalBars: 16,
  notes: notes.sort((a, b) => a.startTick - b.startTick),
  pedals
};

fs.writeFileSync(path.join(sessionDir, 'performance.json'), JSON.stringify(performanceData, null, 2));
fs.writeFileSync(path.join(sessionDir, 'demo_performance.json'), JSON.stringify(performanceData, null, 2));
console.log(`Generated demo performance with ${notes.length} notes across 16 bars.`);
