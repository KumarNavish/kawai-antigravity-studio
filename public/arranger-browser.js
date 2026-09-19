// public/arranger-browser.js
// Client-side Arrangement Engine for Standalone / GitHub Pages Deployments

(function(root) {
  function pitchClass(midi) {
    return ((midi % 12) + 12) % 12;
  }

  function arrangeLocally(project, promptText = '') {
    const prompt = (promptText || '').toLowerCase();
    const ppq = project?.ppq || 480;
    const ticksPerBar = ppq * 4;
    const totalBars = project?.totalBars || 16;
    const bpm = project?.bpm || 92;

    const pianoTrack = project.tracks.find(t => t.isAnchor || t.instrument === 'piano') || project.tracks[0];
    const notes = pianoTrack ? pianoTrack.notes : [];

    // Group notes by bar to find chord roots & pitch classes
    const bars = [];
    for (let b = 0; b < totalBars; b++) {
      const barStart = b * ticksPerBar;
      const barEnd = barStart + ticksPerBar;
      const barNotes = notes.filter(n => n.startTick >= barStart && n.startTick < barEnd);
      
      let rootMidi = 38; // D by default
      const pcs = new Set();
      if (barNotes.length > 0) {
        // Lowest note is typically the bass root
        const sorted = [...barNotes].sort((a, b) => a.pitch - b.pitch);
        rootMidi = sorted[0].pitch;
        for (const n of barNotes) pcs.add(pitchClass(n.pitch));
      }
      bars.push({ bar: b + 1, rootMidi, pitchClasses: Array.from(pcs) });
    }

    const isOrchestral = /orchestra|cinematic|ghibli|film|soundtrack|symphon|lush|strings/i.test(prompt);
    const isLofi = /lofi|lo-fi|chill|beat|hiphop|hip hop|groove|downtempo/i.test(prompt);
    const isJazz = /jazz|swing|trio|blues/i.test(prompt);
    const needsDrums = isLofi || /drum|beat|percussion|rhythm/i.test(prompt);
    const isAcoustic = /acoustic|folk|guitar/i.test(prompt);

    const tracks = [];

    // 1. Bass Track
    const bassInstrument = isOrchestral ? 'cello' : 'acoustic_bass';
    const bassNotes = [];
    for (let b = 0; b < totalBars; b++) {
      const barInfo = bars[b] || { rootMidi: 38 };
      const barStart = b * ticksPerBar;
      let root = barInfo.rootMidi || 38;
      while (root > 46) root -= 12;
      while (root < 33) root += 12;
      const fifth = root + 7;

      if (isLofi) {
        bassNotes.push({ pitch: root, startTick: barStart, durationTicks: ppq * 1.5, velocity: 85 });
        bassNotes.push({ pitch: root, startTick: barStart + Math.floor(ppq * 1.75), durationTicks: ppq * 0.8, velocity: 75 });
        bassNotes.push({ pitch: fifth, startTick: barStart + ppq * 3, durationTicks: ppq * 0.9, velocity: 80 });
      } else if (isOrchestral) {
        bassNotes.push({ pitch: root, startTick: barStart, durationTicks: ppq * 2.8, velocity: 72 });
        bassNotes.push({ pitch: fifth, startTick: barStart + ppq * 3, durationTicks: ppq * 0.9, velocity: 68 });
      } else {
        bassNotes.push({ pitch: root, startTick: barStart, durationTicks: ppq * 1.8, velocity: 80 });
        bassNotes.push({ pitch: fifth, startTick: barStart + ppq * 2, durationTicks: ppq * 1.8, velocity: 75 });
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

    // 2. Sustained Strings / Pad
    const padNotes = [];
    for (let b = 0; b < totalBars; b++) {
      const barInfo = bars[b] || { pitchClasses: [2, 5, 9] };
      const barStart = b * ticksPerBar;
      const pcs = (barInfo.pitchClasses && barInfo.pitchClasses.length > 0) ? barInfo.pitchClasses : [2, 5, 9];

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

    // 3. Counter-melody / Lead
    const leadInstrument = isAcoustic ? 'acoustic_guitar' : 'flute';
    const leadNotes = [];
    for (let b = 0; b < totalBars; b++) {
      const barInfo = bars[b] || {};
      const barStart = b * ticksPerBar;
      const pcs = barInfo.pitchClasses || [2, 9];
      if (b % 2 === 1 || isOrchestral) {
        const top1 = 72 + ((pcs[0] || 2) % 12);
        const top2 = 72 + (((pcs[1] || pcs[0] || 2) + 2) % 12);
        leadNotes.push({ pitch: top1, startTick: barStart + ppq * 1.5, durationTicks: ppq * 1.2, velocity: 75 });
        leadNotes.push({ pitch: top2, startTick: barStart + ppq * 3, durationTicks: ppq * 0.9, velocity: 70 });
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

    // 4. Drums / Percussion
    if (needsDrums || isLofi) {
      const drumNotes = [];
      const KICK = 36;
      const SNARE = 38;
      const HIHAT = 42;

      for (let b = 0; b < totalBars; b++) {
        const barStart = b * ticksPerBar;
        drumNotes.push({ pitch: KICK, startTick: barStart, durationTicks: 120, velocity: 90 });
        if (b % 2 === 1) {
          drumNotes.push({ pitch: KICK, startTick: barStart + Math.floor(ppq * 2.5), durationTicks: 120, velocity: 82 });
        }
        drumNotes.push({ pitch: SNARE, startTick: barStart + ppq, durationTicks: 120, velocity: 85 });
        drumNotes.push({ pitch: SNARE, startTick: barStart + ppq * 3, durationTicks: 120, velocity: 85 });

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

    // Preserve the original piano anchor track
    const preservedAnchor = pianoTrack || {
      id: 'track-kawai-piano',
      name: 'Kawai CA-701 Piano',
      instrument: 'piano',
      isAnchor: true,
      volume: 0.88,
      pan: 0,
      muted: false,
      solo: false,
      notes: []
    };

    const newProject = {
      ...project,
      updatedAt: new Date().toISOString(),
      tracks: [preservedAnchor, ...tracks]
    };

    return {
      project: newProject,
      tracksCount: tracks.length,
      reason: `Arranged "${promptText || 'full ensemble'}" for ${totalBars} bars (${bpm} BPM)`
    };
  }

  root.arrangeClientSide = arrangeLocally;
})(typeof window !== 'undefined' ? window : globalThis);
