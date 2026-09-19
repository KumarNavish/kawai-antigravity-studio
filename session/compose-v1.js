// session/compose-v1.js
// Antigravity's First Milestone Arrangement
// Prompt: "Turn this into a warm, deeply melodic arrangement with moving bass, restrained live drums and strings that gradually become more expressive. Preserve my piano."

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ppq = 480;
const barTicks = ppq * 4; // 1920

// 1. MELODIC ACOUSTIC BASS TRACK
const bassNotes = [
  // Section 1: Restrained, mysterious (Bars 1-4)
  // Bar 1 (Dm9)
  { pitch: 38, startTick: 0, durationTicks: 900, velocity: 65 },       // D2
  { pitch: 41, startTick: 960, durationTicks: 450, velocity: 60 },     // F2
  { pitch: 40, startTick: 1440, durationTicks: 440, velocity: 62 },    // E2 passing
  // Bar 2 (Bbmaj7)
  { pitch: 34, startTick: 1920, durationTicks: 900, velocity: 68 },    // Bb1
  { pitch: 41, startTick: 2880, durationTicks: 450, velocity: 62 },    // F2
  { pitch: 45, startTick: 3360, durationTicks: 440, velocity: 64 },    // A2
  // Bar 3 (Gm9)
  { pitch: 31, startTick: 3840, durationTicks: 900, velocity: 68 },    // G1
  { pitch: 38, startTick: 4800, durationTicks: 450, velocity: 63 },    // D2
  { pitch: 46, startTick: 5280, durationTicks: 440, velocity: 66 },    // Bb2 anticipation
  // Bar 4 (Asus4 - A7)
  { pitch: 33, startTick: 5760, durationTicks: 900, velocity: 68 },    // A1
  { pitch: 40, startTick: 6720, durationTicks: 450, velocity: 65 },    // E2
  { pitch: 37, startTick: 7200, durationTicks: 440, velocity: 64 },    // C#2 leading tone

  // Section 2: Flow & yearning (Bars 5-8)
  // Bar 5 (Dm9)
  { pitch: 38, startTick: 7680, durationTicks: 700, velocity: 74 },    // D2
  { pitch: 45, startTick: 8400, durationTicks: 240, velocity: 66 },    // A2
  { pitch: 41, startTick: 8640, durationTicks: 480, velocity: 70 },    // F2
  { pitch: 43, startTick: 9120, durationTicks: 440, velocity: 68 },    // G2
  // Bar 6 (Fmaj7/C)
  { pitch: 36, startTick: 9600, durationTicks: 700, velocity: 75 },    // C2
  { pitch: 43, startTick: 10320, durationTicks: 240, velocity: 68 },   // G2
  { pitch: 40, startTick: 10560, durationTicks: 480, velocity: 72 },   // E2
  { pitch: 38, startTick: 11040, durationTicks: 440, velocity: 70 },   // D2
  // Bar 7 (Gm7 - C7)
  { pitch: 31, startTick: 11520, durationTicks: 700, velocity: 76 },   // G1
  { pitch: 38, startTick: 12240, durationTicks: 240, velocity: 70 },   // D2
  { pitch: 36, startTick: 12480, durationTicks: 700, velocity: 76 },   // C2
  { pitch: 43, startTick: 13200, durationTicks: 240, velocity: 72 },   // G2
  // Bar 8 (Fmaj7 space turnaround)
  { pitch: 29, startTick: 13440, durationTicks: 900, velocity: 72 },   // F1
  { pitch: 36, startTick: 14400, durationTicks: 450, velocity: 68 },   // C2
  { pitch: 38, startTick: 14880, durationTicks: 440, velocity: 70 },   // D2 leading into section 3

  // Section 3: Suspense & tension build (Bars 9-12)
  // Bar 9 (Em7b5)
  { pitch: 40, startTick: 15360, durationTicks: 700, velocity: 80 },   // E2
  { pitch: 46, startTick: 16080, durationTicks: 240, velocity: 76 },   // Bb2
  { pitch: 38, startTick: 16320, durationTicks: 480, velocity: 78 },   // D2
  { pitch: 43, startTick: 16800, durationTicks: 440, velocity: 82 },   // G2
  // Bar 10 (A7b13)
  { pitch: 33, startTick: 17280, durationTicks: 700, velocity: 84 },   // A1
  { pitch: 45, startTick: 18000, durationTicks: 240, velocity: 80 },   // A2
  { pitch: 37, startTick: 18240, durationTicks: 480, velocity: 85 },   // C#2
  { pitch: 43, startTick: 18720, durationTicks: 440, velocity: 86 },   // G2
  // Bar 11 (Dm climax push)
  { pitch: 38, startTick: 19200, durationTicks: 460, velocity: 90 },   // D2
  { pitch: 38, startTick: 19680, durationTicks: 460, velocity: 88 },   // D2 pulse
  { pitch: 45, startTick: 20160, durationTicks: 460, velocity: 92 },   // A2
  { pitch: 43, startTick: 20640, durationTicks: 440, velocity: 88 },   // G2
  // Bar 12 (Bb7 - Bdim7 suspense transition)
  { pitch: 34, startTick: 21120, durationTicks: 700, velocity: 88 },   // Bb1
  { pitch: 41, startTick: 21840, durationTicks: 240, velocity: 84 },   // F2
  { pitch: 35, startTick: 22080, durationTicks: 700, velocity: 90 },   // B1 (diminished tension!)
  { pitch: 44, startTick: 22800, durationTicks: 240, velocity: 88 },   // G#2

  // Section 4: Liberation, openness, uplift & resolution (Bars 13-16)
  // Bar 13 (F/A - Bbmaj7)
  { pitch: 33, startTick: 23040, durationTicks: 900, velocity: 88 },   // A1
  { pitch: 34, startTick: 23940, durationTicks: 850, velocity: 90 },   // Bb1
  // Bar 14 (Csus4 - C)
  { pitch: 36, startTick: 24960, durationTicks: 900, velocity: 86 },   // C2
  { pitch: 43, startTick: 25920, durationTicks: 850, velocity: 84 },   // G2
  // Bar 15 (Dm9)
  { pitch: 38, startTick: 26880, durationTicks: 900, velocity: 82 },   // D2
  { pitch: 45, startTick: 27840, durationTicks: 850, velocity: 76 },   // A2
  // Bar 16 (D Picardy resolution)
  { pitch: 26, startTick: 28800, durationTicks: 1900, velocity: 70 }   // D1 deep anchor sustaining
];

// 2. RESTRAINED LIVE ACOUSTIC DRUMS TRACK
const drumNotes = [];
function addDrum(pitch, tick, vel) {
  drumNotes.push({ pitch, startTick: tick, durationTicks: 120, velocity: vel });
}

// Section 1: Bars 1-4 (Intimate shaker & subtle ride cymbal, delicate rim on beat 3)
for (let b = 0; b < 4; b++) {
  const bStart = b * barTicks;
  // Soft ride bell on beats 2 & 4
  addDrum(53, bStart + 480, 42);
  addDrum(53, bStart + 1440, 45);
  // Organic shaker on 8th notes
  for (let i = 0; i < 4; i++) {
    addDrum(54, bStart + i * 480 + 240, 36);
  }
  // Delicate rim click on beat 3 (bars 2 & 4)
  if (b === 1 || b === 3) {
    addDrum(37, bStart + 960, 44);
  }
}

// Section 2: Bars 5-8 (Kick enters softly, closed hi-hat groove with micro-dynamics)
for (let b = 4; b < 8; b++) {
  const bStart = b * barTicks;
  // Kick on 1 and syncopated 3&
  addDrum(36, bStart + 0, 62);
  addDrum(36, bStart + 1200, 58); // syncopated push
  // Warm snare on beat 3
  addDrum(38, bStart + 960, 60);
  // Closed hi-hat on 8ths with natural accent on downbeats
  for (let i = 0; i < 8; i++) {
    const vel = (i % 2 === 0) ? 54 : 40;
    addDrum(42, bStart + i * 240, vel);
  }
  // Subtle ride cymbal touch on bar 8 turnaround
  if (b === 7) {
    addDrum(51, bStart + 1680, 55);
  }
}

// Section 3: Bars 9-12 (Suspense building, ghost notes, urgent kick)
for (let b = 8; b < 12; b++) {
  const bStart = b * barTicks;
  // Kick on 1, 2&, 3
  addDrum(36, bStart + 0, 72 + (b - 8) * 4);
  addDrum(36, bStart + 720, 68 + (b - 8) * 4);
  addDrum(36, bStart + 960, 75 + (b - 8) * 4);

  // Snare on 2 and 4 with ghost notes
  addDrum(38, bStart + 480, 70 + (b - 8) * 4);
  addDrum(38, bStart + 1440, 75 + (b - 8) * 4);
  addDrum(38, bStart + 1200, 45); // ghost note
  addDrum(38, bStart + 1680, 48); // ghost note

  // Ride cymbal opening up
  for (let i = 0; i < 4; i++) {
    addDrum(51, bStart + i * 480, 62 + (b - 8) * 5);
  }

  // Bar 12 build fill
  if (b === 11) {
    addDrum(38, bStart + 1560, 78);
    addDrum(38, bStart + 1680, 82);
    addDrum(38, bStart + 1800, 88);
  }
}

// Section 4: Bars 13-16 (Open, uplifting physical propulsion & resolution)
// Bar 13 crash on 1
addDrum(49, 12 * barTicks, 85);
for (let b = 12; b < 15; b++) {
  const bStart = b * barTicks;
  // Confident kick on 1, 2&, 3
  addDrum(36, bStart + 0, 82);
  addDrum(36, bStart + 720, 76);
  addDrum(36, bStart + 960, 84);

  // Deep snare on 2 and 4
  addDrum(38, bStart + 480, 84);
  addDrum(38, bStart + 1440, 86);

  // Shimmering ride
  for (let i = 0; i < 8; i++) {
    addDrum(51, bStart + i * 240, 68);
  }
}
// Bar 16 resolution: soft crash on 1, then silence for piano ring
addDrum(49, 15 * barTicks, 65);
addDrum(36, 15 * barTicks, 68);

// 3. EXPRESSIVE CELLO & STRINGS TRACK
const stringsNotes = [
  // Cello countermelody enters in Bar 3 & answers the piano in Bar 4
  { pitch: 50, startTick: 3 * barTicks - 480, durationTicks: 450, velocity: 62 },  // D3
  { pitch: 52, startTick: 3 * barTicks, durationTicks: 450, velocity: 65 },        // E3
  { pitch: 53, startTick: 3 * barTicks + 480, durationTicks: 450, velocity: 68 },  // F3
  { pitch: 57, startTick: 3 * barTicks + 960, durationTicks: 450, velocity: 70 },  // A3
  { pitch: 53, startTick: 3 * barTicks + 1440, durationTicks: 450, velocity: 65 }, // F3

  // Bars 5-8: Warm cello counter-lines
  { pitch: 50, startTick: 4 * barTicks, durationTicks: 1800, velocity: 68 },        // D3
  { pitch: 48, startTick: 5 * barTicks, durationTicks: 1800, velocity: 70 },        // C3
  { pitch: 46, startTick: 6 * barTicks, durationTicks: 900, velocity: 72 },         // Bb2
  { pitch: 45, startTick: 6 * barTicks + 960, durationTicks: 900, velocity: 74 },   // A2
  { pitch: 48, startTick: 7 * barTicks, durationTicks: 1800, velocity: 65 },        // C3 space

  // Bars 9-12: High strings enter with harmonic suspense & yearning suspensions
  { pitch: 67, startTick: 8 * barTicks, durationTicks: 1800, velocity: 74 },        // G4 (suspended over Em7b5)
  { pitch: 70, startTick: 8 * barTicks, durationTicks: 1800, velocity: 72 },        // Bb4
  { pitch: 69, startTick: 9 * barTicks, durationTicks: 1800, velocity: 78 },        // A4 (over A7b13)
  { pitch: 73, startTick: 9 * barTicks, durationTicks: 1800, velocity: 80 },        // C#5
  { pitch: 74, startTick: 10 * barTicks, durationTicks: 900, velocity: 86 },       // D5 peak
  { pitch: 76, startTick: 10 * barTicks + 960, durationTicks: 900, velocity: 88 }, // E5
  { pitch: 70, startTick: 11 * barTicks, durationTicks: 900, velocity: 85 },       // Bb4
  { pitch: 71, startTick: 11 * barTicks + 960, durationTicks: 900, velocity: 88 }, // B4 (diminished tension!)

  // Bars 13-16: Radiant open voicings for earned emotional liberation & uplift
  // Bar 13 (F/A - Bb)
  { pitch: 69, startTick: 12 * barTicks, durationTicks: 1850, velocity: 84 },       // A4
  { pitch: 72, startTick: 12 * barTicks, durationTicks: 1850, velocity: 86 },       // C5
  { pitch: 77, startTick: 12 * barTicks, durationTicks: 1850, velocity: 88 },       // F5 soaring!
  // Bar 14 (C)
  { pitch: 67, startTick: 13 * barTicks, durationTicks: 1850, velocity: 82 },       // G4
  { pitch: 72, startTick: 13 * barTicks, durationTicks: 1850, velocity: 84 },       // C5
  { pitch: 76, startTick: 13 * barTicks, durationTicks: 1850, velocity: 85 },       // E5
  // Bar 15 (Dm9)
  { pitch: 65, startTick: 14 * barTicks, durationTicks: 1850, velocity: 78 },       // F4
  { pitch: 69, startTick: 14 * barTicks, durationTicks: 1850, velocity: 80 },       // A4
  { pitch: 72, startTick: 14 * barTicks, durationTicks: 1850, velocity: 82 },       // C5
  // Bar 16 (D Picardy uplift)
  { pitch: 62, startTick: 15 * barTicks, durationTicks: 1900, velocity: 70 },       // D4
  { pitch: 66, startTick: 15 * barTicks, durationTicks: 1900, velocity: 72 },       // F#4 (warm major 3rd)
  { pitch: 69, startTick: 15 * barTicks, durationTicks: 1900, velocity: 74 }        // A4
];

const arrangedTracks = [
  {
    id: 'track-bass',
    name: 'Acoustic Upright Bass',
    instrument: 'upright_bass',
    volume: 0.86,
    pan: -0.05,
    muted: false,
    solo: false,
    notes: bassNotes
  },
  {
    id: 'track-drums',
    name: 'Restrained Live Drums',
    instrument: 'acoustic_drums',
    volume: 0.78,
    pan: 0,
    muted: false,
    solo: false,
    notes: drumNotes
  },
  {
    id: 'track-strings',
    name: 'Expressive Cello & Strings',
    instrument: 'string_ensemble',
    volume: 0.82,
    pan: 0.15,
    muted: false,
    solo: false,
    notes: stringsNotes
  }
];

fs.writeFileSync(path.join(__dirname, 'arrangement_v1.json'), JSON.stringify(arrangedTracks, null, 2));
console.log(`Composed Arrangement V1:
  - Bass: ${bassNotes.length} notes
  - Drums: ${drumNotes.length} hits
  - Strings/Cello: ${stringsNotes.length} notes`);
