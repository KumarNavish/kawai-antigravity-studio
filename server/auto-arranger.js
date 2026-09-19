// server/auto-arranger.js
// Musical Transformation Engine for Standalone & Remote Users
// Converts Kawai CA-701 piano performance + natural-language prompt into an arranged multi-track piece

import { analyzePerformance, pitchClass } from './analyzer.js';

export function arrangeFromPerformance(performance, promptText = '') {
  const analysis = analyzePerformance(performance);
  const prompt = (promptText || '').toLowerCase();
  
  const ppq = performance.ppq || 480;
  const ticksPerBar = ppq * 4;
  const totalBars = Math.max(4, performance.totalBars || 16);
  const bpm = performance.bpm || 92;
  const bars = analysis.bars || [];

  // Detect style preferences from prompt
  const isOrchestral = /orchestra|cinematic|ghibli|film|soundtrack|symphon|lush|strings/i.test(prompt);
  const isLofi = /lofi|lo-fi|chill|beat|hiphop|hip hop|groove|downtempo/i.test(prompt);
  const isJazz = /jazz|swing|trio|blues/i.test(prompt);
  const needsDrums = isLofi || /drum|beat|percussion|rhythm/i.test(prompt);
  const isAcoustic = /acoustic|folk|guitar/i.test(prompt);

  const tracks = [];

  // Track 1: Bass Foundation (Cello for orchestral, Acoustic Bass for modern/jazz)
  const bassInstrument = isOrchestral ? 'cello' : 'acoustic_bass';
  const bassNotes = [];

  for (let b = 0; b < totalBars; b++) {
    const barInfo = bars[b] || (bars[b % bars.length]) || { chord: { root: 'D', bassMidi: 38 } };
    const barStart = b * ticksPerBar;
    
    // Choose root pitch in bass octave (approx MIDI 33-45)
    let rootMidi = barInfo.chord?.bassMidi || 38;
    while (rootMidi > 46) rootMidi -= 12;
    while (rootMidi < 33) rootMidi += 12;
    const fifthMidi = rootMidi + 7;

    if (isLofi) {
      // Syncopated lofi bassline (Beat 1, and of 2, beat 4)
      bassNotes.push({ pitch: rootMidi, startTick: barStart, durationTicks: ppq * 1.5, velocity: 85 });
      bassNotes.push({ pitch: rootMidi, startTick: barStart + Math.floor(ppq * 1.75), durationTicks: ppq * 0.8, velocity: 75 });
      bassNotes.push({ pitch: fifthMidi, startTick: barStart + ppq * 3, durationTicks: ppq * 0.9, velocity: 80 });
    } else if (isOrchestral) {
      // Expressive sustained cello root with gentle 3rd-beat movement
      bassNotes.push({ pitch: rootMidi, startTick: barStart, durationTicks: ppq * 2.8, velocity: 72 });
      bassNotes.push({ pitch: fifthMidi, startTick: barStart + ppq * 3, durationTicks: ppq * 0.9, velocity: 68 });
    } else {
      // Root-Fifth baseline
      bassNotes.push({ pitch: rootMidi, startTick: barStart, durationTicks: ppq * 1.8, velocity: 80 });
      bassNotes.push({ pitch: fifthMidi, startTick: barStart + ppq * 2, durationTicks: ppq * 1.8, velocity: 75 });
    }
  }

  tracks.push({
    id: 'track-auto-bass',
    name: isOrchestral ? 'Cellos & Double Bass' : 'Acoustic Upright Bass',
    instrument: bassInstrument,
    role: 'bass',
    volume: 0.82,
    pan: -0.15,
    muted: false,
    solo: false,
    notes: bassNotes
  });

  // Track 2: Sustained Strings / Warm Harmonic Pad
  const padNotes = [];
  for (let b = 0; b < totalBars; b++) {
    const barInfo = bars[b] || (bars[b % bars.length]) || { chord: { pitchClasses: [2, 5, 9] } };
    const barStart = b * ticksPerBar;
    const pcs = barInfo.chord?.pitchClasses || [2, 5, 9];

    // Pick 2-3 voicing notes in octave 4-5 (approx MIDI 57-72)
    const voiced = [];
    for (const pc of pcs) {
      let pitch = 60 + ((pc - (60 % 12) + 12) % 12);
      if (pitch < 57) pitch += 12;
      if (pitch > 74) pitch -= 12;
      if (!voiced.includes(pitch)) voiced.push(pitch);
      if (voiced.length >= 3) break;
    }

    const duration = ticksPerBar - 40;
    const padVel = isOrchestral ? 64 : 54;
    for (const p of voiced) {
      padNotes.push({
        pitch: p,
        startTick: barStart + 20,
        durationTicks: duration,
        velocity: padVel
      });
    }
  }

  tracks.push({
    id: 'track-auto-strings',
    name: 'Lush String Ensemble',
    instrument: 'strings',
    role: 'pad',
    volume: 0.74,
    pan: 0.25,
    muted: false,
    solo: false,
    notes: padNotes
  });

  // Track 3: Counter-melody / Lead (Flute or Acoustic Guitar)
  const leadInstrument = isAcoustic ? 'acoustic_guitar' : 'flute';
  const leadNotes = [];

  for (let b = 0; b < totalBars; b++) {
    const barInfo = bars[b] || (bars[b % bars.length]) || {};
    const barStart = b * ticksPerBar;
    const pcs = barInfo.chord?.pitchClasses || [2, 9];
    
    // Play counter-motifs mainly on bars 2, 4, 6, 8... to leave breathing room for piano
    if (b % 2 === 1 || isOrchestral) {
      const topPitch1 = 72 + ((pcs[0] || 2) % 12);
      const topPitch2 = 72 + (((pcs[1] || pcs[0] || 2) + 2) % 12);
      
      leadNotes.push({
        pitch: topPitch1,
        startTick: barStart + ppq * 1.5,
        durationTicks: ppq * 1.2,
        velocity: 75
      });
      leadNotes.push({
        pitch: topPitch2,
        startTick: barStart + ppq * 3,
        durationTicks: ppq * 0.9,
        velocity: 70
      });
    }
  }

  tracks.push({
    id: 'track-auto-lead',
    name: isAcoustic ? 'Fingerstyle Acoustic Guitar' : 'Orchestral Flute Solo',
    instrument: leadInstrument,
    role: 'lead',
    volume: 0.78,
    pan: -0.2,
    muted: false,
    solo: false,
    notes: leadNotes
  });

  // Track 4: Optional Drums / Percussion
  if (needsDrums || isLofi) {
    const drumNotes = [];
    const KICK = 36;
    const SNARE = 38;
    const HIHAT = 42;

    for (let b = 0; b < totalBars; b++) {
      const barStart = b * ticksPerBar;
      
      // Kick on beat 1, and optional syncopation on beat 3.5
      drumNotes.push({ pitch: KICK, startTick: barStart, durationTicks: 120, velocity: 90 });
      if (b % 2 === 1) {
        drumNotes.push({ pitch: KICK, startTick: barStart + Math.floor(ppq * 2.5), durationTicks: 120, velocity: 82 });
      }

      // Snare on beat 2 and 4
      drumNotes.push({ pitch: SNARE, startTick: barStart + ppq, durationTicks: 120, velocity: 85 });
      drumNotes.push({ pitch: SNARE, startTick: barStart + ppq * 3, durationTicks: 120, velocity: 85 });

      // 8th-note Hi-Hats with subtle swing/accent
      for (let step = 0; step < 8; step++) {
        const tick = barStart + step * (ppq / 2);
        const vel = (step % 2 === 0) ? 75 : 60;
        drumNotes.push({ pitch: HIHAT, startTick: tick, durationTicks: 80, velocity: vel });
      }
    }

    tracks.push({
      id: 'track-auto-drums',
      name: isLofi ? 'Lofi Boom-Bap Kit' : 'Acoustic Studio Drums',
      instrument: 'acoustic_drums',
      role: 'percussion',
      volume: 0.70,
      pan: 0.0,
      muted: false,
      solo: false,
      notes: drumNotes
    });
  }

  const detectedKey = analysis.keyAdvisory?.bestEstimate || 'D minor';
  const reason = `Automated arrangement based on "${promptText || 'balanced orchestration'}" in ${detectedKey} (${totalBars} bars, ${bpm} BPM)`;

  return {
    tracks,
    reason,
    detectedKey,
    totalBars,
    bpm
  };
}
