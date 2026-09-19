// session/compose-revision.js
// Antigravity Conversational Revision:
// "The first half is beautiful. The second half needs more suspense before the release."

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projFile = path.join(__dirname, 'project.json');
const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));

const ppq = 480;
const barTicks = ppq * 4;

// Update Bass Track: enhance suspense in Bars 9-12
const bassTrack = proj.tracks.find(t => t.id === 'track-bass');
if (bassTrack) {
  // Keep Bars 1-8 and 13-16 exactly as they were; revise Bars 9-12:
  const keptNotes = bassTrack.notes.filter(n => n.startTick < 8 * barTicks || n.startTick >= 12 * barTicks);
  
  const suspenseBassNotes = [
    // Bar 9 (Em7b5): brooding low pedal with tense syncopation
    { pitch: 40, startTick: 15360, durationTicks: 450, velocity: 78 },       // E2
    { pitch: 39, startTick: 15840, durationTicks: 450, velocity: 82 },       // D#2 chromatic neighbor!
    { pitch: 40, startTick: 16320, durationTicks: 900, velocity: 85 },       // E2
    // Bar 10 (A7b13): sinister octave drop and tritone tension
    { pitch: 33, startTick: 17280, durationTicks: 450, velocity: 86 },       // A1
    { pitch: 37, startTick: 17760, durationTicks: 450, velocity: 88 },       // C#2
    { pitch: 43, startTick: 18240, durationTicks: 900, velocity: 92 },       // G2
    // Bar 11 (Dm): hushed, restrained heartbeat pulse (subtle suspense drop before the swell)
    { pitch: 38, startTick: 19200, durationTicks: 240, velocity: 68 },       // D2
    { pitch: 38, startTick: 19680, durationTicks: 240, velocity: 74 },       // D2
    { pitch: 38, startTick: 20160, durationTicks: 240, velocity: 82 },       // D2
    { pitch: 38, startTick: 20640, durationTicks: 240, velocity: 92 },       // D2 rising
    // Bar 12 (Bdim7): stark diminished tension, sudden silence on beat 4 right before the drop!
    { pitch: 35, startTick: 21120, durationTicks: 450, velocity: 94 },       // B1
    { pitch: 41, startTick: 21600, durationTicks: 450, velocity: 96 },       // F2
    { pitch: 44, startTick: 22080, durationTicks: 450, velocity: 98 }        // G#2 - leaves beat 4 silent!
  ];

  bassTrack.notes = [...keptNotes, ...suspenseBassNotes].sort((a, b) => a.startTick - b.startTick);
}

// Update Strings: increase dissonance & dynamic suspense swell in Bars 9-12
const stringsTrack = proj.tracks.find(t => t.id === 'track-strings');
if (stringsTrack) {
  const keptNotes = stringsTrack.notes.filter(n => n.startTick < 8 * barTicks || n.startTick >= 12 * barTicks);

  const suspenseStrings = [
    // Bar 9: High suspended trill / cluster dissonance
    { pitch: 67, startTick: 8 * barTicks, durationTicks: 1800, velocity: 76 },        // G4
    { pitch: 71, startTick: 8 * barTicks, durationTicks: 1800, velocity: 80 },        // B4
    { pitch: 74, startTick: 8 * barTicks, durationTicks: 1800, velocity: 82 },        // D5
    // Bar 10: Tense descending chromatic suspension
    { pitch: 69, startTick: 9 * barTicks, durationTicks: 1800, velocity: 84 },        // A4
    { pitch: 73, startTick: 9 * barTicks, durationTicks: 1800, velocity: 88 },        // C#5
    { pitch: 76, startTick: 9 * barTicks, durationTicks: 1800, velocity: 90 },        // E5
    // Bar 11: Swelling violin tremolo/arc
    { pitch: 70, startTick: 10 * barTicks, durationTicks: 900, velocity: 85 },       // Bb4
    { pitch: 74, startTick: 10 * barTicks, durationTicks: 900, velocity: 92 },       // D5
    { pitch: 77, startTick: 10 * barTicks + 960, durationTicks: 900, velocity: 98 }, // F5 high peak
    // Bar 12: Diminished cluster cutting out right before beat 4
    { pitch: 71, startTick: 11 * barTicks, durationTicks: 1350, velocity: 96 },      // B4
    { pitch: 74, startTick: 11 * barTicks, durationTicks: 1350, velocity: 98 },      // D5
    { pitch: 77, startTick: 11 * barTicks, durationTicks: 1350, velocity: 100 }      // F5
  ];

  stringsTrack.notes = [...keptNotes, ...suspenseStrings].sort((a, b) => a.startTick - b.startTick);
}

fs.writeFileSync(path.join(__dirname, 'arrangement_v2.json'), JSON.stringify(proj.tracks.filter(t => !t.isAnchor), null, 2));
console.log('Composed revised arrangement V2 with heightened suspense in Bars 9-12.');
