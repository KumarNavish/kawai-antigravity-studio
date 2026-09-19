// server/analyzer.js
// Deterministic, Advisory Music Theory & Performance Analyzer for Kawai CA-701

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler Key Profiles
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const CHORD_TYPES = [
  { name: 'maj7', intervals: [0, 4, 7, 11], weight: 1.25 },
  { name: 'm7', intervals: [0, 3, 7, 10], weight: 1.25 },
  { name: '7', intervals: [0, 4, 7, 10], weight: 1.15 },
  { name: 'maj9', intervals: [0, 2, 4, 7, 11], weight: 1.35 },
  { name: 'm9', intervals: [0, 2, 3, 7, 10], weight: 1.35 },
  { name: 'add9', intervals: [0, 2, 4, 7], weight: 1.15 },
  { name: 'm(add9)', intervals: [0, 2, 3, 7], weight: 1.15 },
  { name: 'maj', intervals: [0, 4, 7], weight: 1.0 },
  { name: 'm', intervals: [0, 3, 7], weight: 1.0 },
  { name: 'sus4', intervals: [0, 5, 7], weight: 1.05 },
  { name: 'sus2', intervals: [0, 2, 7], weight: 1.05 },
  { name: 'dim', intervals: [0, 3, 6], weight: 1.0 },
  { name: 'm7b5', intervals: [0, 3, 6, 10], weight: 1.25 },
  { name: 'dim7', intervals: [0, 3, 6, 9], weight: 1.15 },
  { name: 'aug', intervals: [0, 4, 8], weight: 0.9 },
  { name: '7alt', intervals: [0, 4, 10, 1, 8], weight: 1.1 }
];

export function midiToNoteName(midi) {
  if (midi == null || isNaN(midi)) return '-';
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

function correlation(x, y) {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/**
 * Advisory Key Detection: returns best estimate, confidence, plausible alternatives,
 * and pitch-class distribution evidence.
 */
export function detectKeyAdvisory(notes) {
  const pitchCounts = new Array(12).fill(0);
  for (const n of notes) {
    const pc = pitchClass(n.pitch);
    const durationWeight = (n.durationTicks || 480) / 480;
    const velocityWeight = (n.velocity || 64) / 64;
    pitchCounts[pc] += durationWeight * velocityWeight;
  }

  const allKeyCorrelations = [];

  for (let root = 0; root < 12; root++) {
    const rotatedMajor = [];
    const rotatedMinor = [];
    for (let i = 0; i < 12; i++) {
      rotatedMajor.push(MAJOR_PROFILE[(i - root + 12) % 12]);
      rotatedMinor.push(MINOR_PROFILE[(i - root + 12) % 12]);
    }

    const rMaj = correlation(pitchCounts, rotatedMajor);
    allKeyCorrelations.push({
      key: `${NOTE_NAMES[root]} major`,
      tonic: NOTE_NAMES[root],
      scale: 'major',
      correlation: rMaj,
      confidence: Math.max(0, Math.min(1, (rMaj + 0.3) / 1.3))
    });

    const rMin = correlation(pitchCounts, rotatedMinor);
    allKeyCorrelations.push({
      key: `${NOTE_NAMES[root]} minor`,
      tonic: NOTE_NAMES[root],
      scale: 'minor',
      correlation: rMin,
      confidence: Math.max(0, Math.min(1, (rMin + 0.3) / 1.3))
    });
  }

  allKeyCorrelations.sort((a, b) => b.correlation - a.correlation);
  const best = allKeyCorrelations[0];
  const alternatives = allKeyCorrelations.slice(1, 4).filter(k => k.correlation > best.correlation * 0.75);

  // Pitch class distribution summary
  const pitchClassWeights = {};
  for (let i = 0; i < 12; i++) {
    if (pitchCounts[i] > 0) {
      pitchClassWeights[NOTE_NAMES[i]] = Math.round(pitchCounts[i] * 10) / 10;
    }
  }

  return {
    estimate: best.key,
    tonic: best.tonic,
    scale: best.scale,
    confidence: Math.round(best.confidence * 100) / 100,
    correlation: Math.round(best.correlation * 1000) / 1000,
    plausibleAlternatives: alternatives.map(a => ({
      key: a.key,
      confidence: Math.round(a.confidence * 100) / 100,
      note: a.scale === best.scale ? 'Parallel/dominant key' : 'Relative or modal counterpart'
    })),
    rawEvidence: {
      pitchClassWeights,
      totalNotesEvaluated: notes.length
    }
  };
}

/**
 * Advisory Chord Recognition: returns primary interpretation, confidence,
 * plausible alternatives (e.g. Dm7 vs F/D), tension score, and notes present.
 */
export function identifyChordAdvisory(notes) {
  if (!notes || notes.length === 0) {
    return {
      estimate: 'N.C.',
      confidence: 1.0,
      bassNote: null,
      plausibleAlternatives: [],
      notesPresent: [],
      tensionScore: 0
    };
  }

  const sortedByPitch = [...notes].sort((a, b) => a.pitch - b.pitch);
  const bassPitch = sortedByPitch[0].pitch;
  const bassName = NOTE_NAMES[bassPitch % 12];

  const presentPCs = new Set(notes.map(n => pitchClass(n.pitch)));
  const noteNamesPresent = [...new Set(notes.map(n => NOTE_NAMES[pitchClass(n.pitch)]))];

  const candidates = [];

  for (let rootPC = 0; rootPC < 12; rootPC++) {
    const rootName = NOTE_NAMES[rootPC];
    for (const cType of CHORD_TYPES) {
      let matches = 0;
      let extra = 0;

      for (const interval of cType.intervals) {
        const targetPC = (rootPC + interval) % 12;
        if (presentPCs.has(targetPC)) matches++;
      }

      for (const pc of presentPCs) {
        const interval = (pc - rootPC + 12) % 12;
        if (!cType.intervals.includes(interval)) extra++;
      }

      const coverage = matches / cType.intervals.length;
      const penalty = extra * 0.15;
      const score = (coverage * cType.weight) - penalty;

      if (coverage >= 0.65 && score > 0.4) {
        const chordName = `${rootName}${cType.name}`;
        const isSlash = bassName !== rootName;
        candidates.push({
          chord: isSlash ? `${chordName}/${bassName}` : chordName,
          root: rootName,
          type: cType.name,
          bass: bassName,
          score,
          coverage
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0] || {
    chord: bassName,
    root: bassName,
    type: '',
    bass: bassName,
    score: 0.5,
    coverage: 0.5
  };

  const alternatives = candidates.slice(1, 3).map(c => ({
    chord: c.chord,
    relativeLikelihood: Math.round((c.score / best.score) * 100) / 100
  }));

  // Harmonic tension estimation (0 = pure consonance, 1 = intense dissonance)
  let tension = 0;
  if (presentPCs.has((bassPitch + 1) % 12) || presentPCs.has((bassPitch + 11) % 12)) tension += 0.4; // minor 2nd / major 7th clash
  if (presentPCs.has((bassPitch + 6) % 12)) tension += 0.35; // tritone clash
  if (best.type.includes('dim') || best.type.includes('alt')) tension += 0.3;
  if (best.type.includes('7') || best.type.includes('9')) tension += 0.15;

  return {
    estimate: best.chord,
    root: best.root,
    bassNote: bassName,
    confidence: Math.min(1.0, Math.round(best.coverage * 100) / 100),
    plausibleAlternatives: alternatives,
    tensionScore: Math.min(1.0, Math.round(tension * 100) / 100),
    notesPresent: noteNamesPresent
  };
}

/**
 * Full Performance Analysis with Advisory Metrics & Phrasing Opportunities
 */
export function analyzePerformance(performance) {
  const {
    notes = [],
    pedals = [],
    bpm = 92,
    timeSignature = [4, 4],
    ppq = 480,
    timingJitterMs = null
  } = performance;

  if (notes.length === 0) {
    return {
      empty: true,
      bpm,
      timeSignature,
      key: { estimate: 'C major', confidence: 0.5, plausibleAlternatives: [] },
      bars: []
    };
  }

  const ticksPerBeat = ppq;
  const beatsPerBar = timeSignature[0];
  const ticksPerBar = ticksPerBeat * beatsPerBar;

  const maxStartTick = Math.max(...notes.map(n => n.startTick || 0));
  const maxEndTick = Math.max(...notes.map(n => (n.startTick || 0) + (n.durationTicks || 480)));
  let totalBars = Math.max(1, Math.ceil(maxStartTick / ticksPerBar) || 1);
  if (maxEndTick > totalBars * ticksPerBar + (ticksPerBar / 4)) {
    totalBars = Math.ceil(maxEndTick / ticksPerBar);
  }

  const keyAnalysis = detectKeyAdvisory(notes);

  const barNotes = Array.from({ length: totalBars }, () => []);
  for (const n of notes) {
    const barIdx = Math.floor((n.startTick || 0) / ticksPerBar);
    if (barIdx >= 0 && barIdx < totalBars) {
      barNotes[barIdx].push(n);
    }
  }

  const bars = [];
  const bassMovement = [];
  const melodyMovement = [];
  const breathingBars = [];

  for (let b = 0; b < totalBars; b++) {
    const barN = barNotes[b];
    const barStartTick = b * ticksPerBar;
    const barEndTick = barStartTick + ticksPerBar;

    if (barN.length === 0) {
      bars.push({
        barNumber: b + 1,
        startTick: barStartTick,
        endTick: barEndTick,
        noteCount: 0,
        harmony: { estimate: 'N.C.', confidence: 1.0, alternatives: [] },
        dynamics: { avg: 0, min: 0, max: 0 },
        bassNote: '-',
        melodyPeak: '-',
        hasBreathingRoom: true,
        advisoryNotes: 'Silence / rest: Ideal moment for solo instrument entry or acoustic fill'
      });
      breathingBars.push(b + 1);
      continue;
    }

    // Advisory harmony for the whole bar and halves
    const half1Notes = barN.filter(n => n.startTick < barStartTick + ticksPerBar / 2);
    const half2Notes = barN.filter(n => n.startTick >= barStartTick + ticksPerBar / 2);

    const harmonyFull = identifyChordAdvisory(barN);
    const harmony1 = identifyChordAdvisory(half1Notes.length > 0 ? half1Notes : barN);
    const harmony2 = half2Notes.length > 0 ? identifyChordAdvisory(half2Notes) : null;

    let harmonyDisplay = harmonyFull.estimate;
    if (harmony2 && harmony2.estimate !== harmony1.estimate && harmony2.estimate !== 'N.C.') {
      harmonyDisplay = `${harmony1.estimate} → ${harmony2.estimate}`;
    }

    const velocities = barN.map(n => n.velocity || 64);
    const avgVel = Math.round(velocities.reduce((a, c) => a + c, 0) / velocities.length);
    const maxVel = Math.max(...velocities);
    const minVel = Math.min(...velocities);

    // Bass note: lowest pitch
    const lowestNote = [...barN].sort((a, b) => a.pitch - b.pitch)[0];
    if (lowestNote) {
      bassMovement.push({
        bar: b + 1,
        pitch: lowestNote.pitch,
        note: midiToNoteName(lowestNote.pitch),
        startTick: lowestNote.startTick,
        velocity: lowestNote.velocity
      });
    }

    // Melodic peak: highest pitch
    const highestNote = [...barN].sort((a, b) => b.pitch - a.pitch)[0];
    if (highestNote) {
      melodyMovement.push({
        bar: b + 1,
        pitch: highestNote.pitch,
        note: midiToNoteName(highestNote.pitch),
        startTick: highestNote.startTick,
        velocity: highestNote.velocity
      });
    }

    const hasSpace = barN.length <= 4;
    if (hasSpace) breathingBars.push(b + 1);

    bars.push({
      barNumber: b + 1,
      startTick: barStartTick,
      endTick: barEndTick,
      noteCount: barN.length,
      chord: harmonyDisplay,
      harmony: {
        estimate: harmonyDisplay,
        fullBarChord: harmonyFull.estimate,
        confidence: harmonyFull.confidence,
        tensionScore: harmonyFull.tensionScore,
        plausibleAlternatives: harmonyFull.plausibleAlternatives,
        notesPresent: harmonyFull.notesPresent
      },
      dynamics: { avg: avgVel, min: minVel, max: maxVel },
      bassPitch: lowestNote ? lowestNote.pitch : null,
      bassNote: lowestNote ? midiToNoteName(lowestNote.pitch) : '-',
      melodyPeak: highestNote ? midiToNoteName(highestNote.pitch) : '-',
      hasBreathingRoom: hasSpace,
      advisoryNotes: hasSpace ? 'Breathing room: Space available for countermelody or bass movement' : 'Dense piano texture: Accompany with restraint'
    });
  }

  // Melodic Range
  const allPitches = notes.map(n => n.pitch);
  const minPitch = Math.min(...allPitches);
  const maxPitch = Math.max(...allPitches);

  // Dynamic Arc
  const barAvgs = bars.map(b => b.dynamics.avg).filter(v => v > 0);
  const overallAvgVel = barAvgs.length ? Math.round(barAvgs.reduce((a, c) => a + c, 0) / barAvgs.length) : 64;

  let dynamicArc = 'balanced and expressive';
  if (bars.length >= 8) {
    const firstHalf = bars.slice(0, Math.floor(bars.length / 2));
    const secondHalf = bars.slice(Math.floor(bars.length / 2));
    const firstHalfAvg = firstHalf.reduce((a, b) => a + b.dynamics.avg, 0) / Math.max(1, firstHalf.length);
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b.dynamics.avg, 0) / Math.max(1, secondHalf.length);
    if (secondHalfAvg > firstHalfAvg + 8) dynamicArc = 'gradual crescendo / building swell towards climax';
    else if (firstHalfAvg > secondHalfAvg + 8) dynamicArc = 'intimate decrescendo / softening towards resolution';
  }

  // Motifs and phrasing
  const motifs = extractMotifs(melodyMovement);

  return {
    bpm,
    timeSignature,
    ppq,
    totalBars,
    key: keyAnalysis,
    range: {
      minPitch,
      maxPitch,
      lowestNote: midiToNoteName(minPitch),
      highestNote: midiToNoteName(maxPitch)
    },
    dynamicArc,
    overallAvgVelocity: overallAvgVel,
    breathingBars,
    motifs,
    bars,
    timingStats: {
      noteCount: notes.length,
      pedalCount: pedals.length,
      measuredJitterMs: timingJitterMs
    }
  };
}

function extractMotifs(melodyPoints) {
  if (melodyPoints.length < 4) return [];
  const motifs = [];
  for (let i = 0; i < melodyPoints.length - 3; i++) {
    const diff1 = melodyPoints[i + 1].pitch - melodyPoints[i].pitch;
    const diff2 = melodyPoints[i + 2].pitch - melodyPoints[i + 1].pitch;
    for (let j = i + 3; j < melodyPoints.length - 2; j++) {
      if (melodyPoints[j + 1].pitch - melodyPoints[j].pitch === diff1 &&
          melodyPoints[j + 2].pitch - melodyPoints[j + 1].pitch === diff2) {
        motifs.push({
          name: `Interval contour [${diff1 > 0 ? '+' + diff1 : diff1}, ${diff2 > 0 ? '+' + diff2 : diff2}]`,
          firstBar: melodyPoints[i].bar,
          firstNote: melodyPoints[i].note,
          secondBar: melodyPoints[j].bar,
          secondNote: melodyPoints[j].note
        });
        if (motifs.length >= 3) break;
      }
    }
    if (motifs.length >= 3) break;
  }
  return motifs;
}
