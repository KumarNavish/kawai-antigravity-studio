// server/project-store.js
// State store for multi-track project, patch-oriented score editing, and dual Kawai rendering modes

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { midiToNoteName, analyzePerformance } from './analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDir = path.join(__dirname, '..', 'session');
const projectFile = path.join(sessionDir, 'project.json');

// Kawai CA-701 GM2 / Multi-Timbral Instrument Map
export const KAWAI_INSTRUMENT_MAP = {
  piano: { midiChannel: 0, programChange: 0, bankMSB: 0, bankLSB: 0, name: 'SK-EX Concert Grand' },
  grand_piano: { midiChannel: 0, programChange: 0, bankMSB: 0, bankLSB: 0, name: 'SK-EX Concert Grand' },
  upright_bass: { midiChannel: 1, programChange: 32, bankMSB: 0, bankLSB: 0, name: 'Acoustic Bass' },
  bass: { midiChannel: 1, programChange: 32, bankMSB: 0, bankLSB: 0, name: 'Acoustic Bass' },
  cello: { midiChannel: 2, programChange: 42, bankMSB: 0, bankLSB: 0, name: 'Cello' },
  violin: { midiChannel: 3, programChange: 40, bankMSB: 0, bankLSB: 0, name: 'Violin' },
  strings: { midiChannel: 4, programChange: 48, bankMSB: 0, bankLSB: 0, name: 'String Ensemble' },
  string_ensemble: { midiChannel: 4, programChange: 48, bankMSB: 0, bankLSB: 0, name: 'String Ensemble' },
  acoustic_guitar: { midiChannel: 5, programChange: 24, bankMSB: 0, bankLSB: 0, name: 'Nylon String Guitar' },
  flute: { midiChannel: 6, programChange: 73, bankMSB: 0, bankLSB: 0, name: 'Flute' },
  woodwinds: { midiChannel: 6, programChange: 73, bankMSB: 0, bankLSB: 0, name: 'Flute' },
  warm_pad: { midiChannel: 7, programChange: 89, bankMSB: 0, bankLSB: 0, name: 'Warm Pad' },
  synth: { midiChannel: 7, programChange: 89, bankMSB: 0, bankLSB: 0, name: 'Warm Pad' },
  drums: { midiChannel: 9, programChange: 0, bankMSB: 120, bankLSB: 0, name: 'Standard Drum Kit' },
  acoustic_drums: { midiChannel: 9, programChange: 0, bankMSB: 120, bankLSB: 0, name: 'Standard Drum Kit' },
  percussion: { midiChannel: 9, programChange: 40, bankMSB: 120, bankLSB: 0, name: 'Brush Kit' }
};

class ProjectStore {
  constructor() {
    this.project = null;
    this.undoStack = [];
    this.redoStack = [];
    this.load();
  }

  load() {
    if (fs.existsSync(projectFile)) {
      try {
        this.project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        if (!this.project.renderingMode) {
          this.project.renderingMode = 'piano_quality';
        }
        return;
      } catch (err) {
        console.error('Error reading project.json, reinitializing...', err);
      }
    }
    this.initDefault();
  }

  initDefault() {
    const demoPerfFile = path.join(sessionDir, 'demo_performance.json');
    let perf = null;
    if (fs.existsSync(demoPerfFile)) {
      perf = JSON.parse(fs.readFileSync(demoPerfFile, 'utf8'));
    }

    this.project = {
      id: 'proj-' + Date.now(),
      title: 'Kawai CA-701 Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      renderingMode: 'piano_quality', // 'piano_quality' | 'kawai_multitimbral'
      bpm: perf ? perf.bpm : 92,
      timeSignature: perf ? perf.timeSignature : [4, 4],
      ppq: perf ? perf.ppq : 480,
      totalBars: perf ? perf.totalBars : 16,
      sections: [
        { name: 'Intro / Mystery', startBar: 1, endBar: 4, mood: 'Restrained, yearning' },
        { name: 'A / Flow', startBar: 5, endBar: 8, mood: 'Melodic movement' },
        { name: 'Suspense Build', startBar: 9, endBar: 12, mood: 'Harmonic tension' },
        { name: 'Liberation / Uplift', startBar: 13, endBar: 16, mood: 'Earned resolution' }
      ],
      tracks: [
        {
          id: 'track-kawai-piano',
          name: 'Kawai CA-701 Piano',
          instrument: 'piano',
          isAnchor: true,
          volume: 0.88,
          pan: 0,
          muted: false,
          solo: false,
          notes: perf ? perf.notes : [],
          pedals: perf ? perf.pedals : []
        }
      ],
      snapshots: []
    };
    this.save();
  }

  save() {
    this.project.updatedAt = new Date().toISOString();
    fs.writeFileSync(projectFile, JSON.stringify(this.project, null, 2));
  }

  getProject() {
    return this.project;
  }

  setRenderingMode(mode) {
    if (mode !== 'piano_quality' && mode !== 'kawai_multitimbral') {
      throw new Error(`Invalid rendering mode: ${mode}. Must be 'piano_quality' or 'kawai_multitimbral'`);
    }
    this.project.renderingMode = mode;
    this.save();
    return this.project.renderingMode;
  }

  /**
   * Set performance anchor track when user plays/records on Kawai
   */
  setPerformance(perf) {
    this.pushUndo('Record new performance');
    this.project.bpm = perf.bpm || this.project.bpm;
    this.project.timeSignature = perf.timeSignature || this.project.timeSignature;
    this.project.totalBars = perf.totalBars || this.project.totalBars;

    let pianoTrack = this.project.tracks.find(t => t.isAnchor);
    if (!pianoTrack) {
      pianoTrack = {
        id: 'track-kawai-piano',
        name: 'Kawai CA-701 Piano',
        instrument: 'piano',
        isAnchor: true,
        volume: 0.88,
        pan: 0,
        muted: false,
        solo: false,
        notes: [],
        pedals: []
      };
      this.project.tracks.unshift(pianoTrack);
    }
    pianoTrack.notes = perf.notes || [];
    pianoTrack.pedals = perf.pedals || [];
    this.save();
  }

  /**
   * Replace or initialize entire arrangement tracks (preserving anchor)
   */
  setArrangementTracks(newTracks, reason = 'Antigravity Arrangement') {
    this.pushUndo(reason);

    const anchorTrack = this.project.tracks.find(t => t.isAnchor);
    const sanitizedTracks = [];
    if (anchorTrack) sanitizedTracks.push(anchorTrack);

    for (const t of newTracks) {
      if (t.isAnchor) continue;
      const inst = t.instrument || 'piano';
      const kawaiMap = KAWAI_INSTRUMENT_MAP[inst] || KAWAI_INSTRUMENT_MAP.piano;

      sanitizedTracks.push({
        id: t.id || `track-${inst}-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        name: t.name || inst,
        instrument: inst,
        isAnchor: false,
        midiChannel: t.midiChannel != null ? t.midiChannel : kawaiMap.midiChannel,
        programChange: t.programChange != null ? t.programChange : kawaiMap.programChange,
        volume: t.volume != null ? t.volume : 0.80,
        pan: t.pan != null ? t.pan : 0,
        muted: Boolean(t.muted),
        solo: Boolean(t.solo),
        notes: t.notes || [],
        pedals: t.pedals || []
      });
    }

    this.project.tracks = sanitizedTracks;
    this.save();
    return this.project;
  }

  findTrack(trackIdOrName) {
    if (!trackIdOrName) return null;
    const query = trackIdOrName.toLowerCase();
    return this.project.tracks.find(t =>
      t.id.toLowerCase() === query ||
      t.name.toLowerCase() === query ||
      t.name.toLowerCase().includes(query) ||
      t.instrument.toLowerCase().includes(query)
    );
  }

  /**
   * Compact Musical Score Reader
   */
  getScore(options = {}) {
    const { trackIdOrName, range } = options;
    const ppq = this.project.ppq || 480;
    const ticksPerBar = ppq * 4;

    let targetTracks = this.project.tracks;
    if (trackIdOrName) {
      const single = this.findTrack(trackIdOrName);
      if (!single) throw new Error(`Track matching "${trackIdOrName}" not found`);
      targetTracks = [single];
    }

    let startTick = 0;
    let endTick = (this.project.totalBars || 16) * ticksPerBar;

    if (range) {
      if (range.startBar != null) startTick = (range.startBar - 1) * ticksPerBar;
      if (range.endBar != null) endTick = range.endBar * ticksPerBar;
      if (range.startTick != null) startTick = range.startTick;
      if (range.endTick != null) endTick = range.endTick;
    }

    const result = [];

    for (const track of targetTracks) {
      const filteredNotes = track.notes.filter(n => n.startTick >= startTick && n.startTick < endTick);
      const scoreNotes = filteredNotes.map(n => {
        const bar = Math.floor(n.startTick / ticksPerBar) + 1;
        const tickInBar = n.startTick % ticksPerBar;
        const beat = Math.floor(tickInBar / ppq) + 1;
        const tickInBeat = tickInBar % ppq;

        return {
          pitch: n.pitch,
          note: midiToNoteName(n.pitch),
          bar,
          beat: tickInBeat === 0 ? beat : `${beat}+${tickInBeat}t`,
          startTick: n.startTick,
          durationTicks: n.durationTicks,
          velocity: n.velocity || 75
        };
      });

      result.push({
        trackId: track.id,
        trackName: track.name,
        instrument: track.instrument,
        isAnchor: track.isAnchor,
        range: {
          startBar: Math.floor(startTick / ticksPerBar) + 1,
          endBar: Math.ceil(endTick / ticksPerBar)
        },
        noteCount: scoreNotes.length,
        notes: scoreNotes
      });
    }

    return result;
  }

  /**
   * Surgical, Patch-Oriented Score Editor
   */
  applyScorePatch(trackIdOrName, patch, reason = 'Score patch') {
    this.pushUndo(reason);

    const track = this.findTrack(trackIdOrName);
    if (!track) throw new Error(`Track matching "${trackIdOrName}" not found`);

    const ppq = this.project.ppq || 480;
    const ticksPerBar = ppq * 4;

    // 1. Parameter updates
    if (patch.name != null) track.name = patch.name;
    if (patch.instrument != null) {
      track.instrument = patch.instrument;
      const kMap = KAWAI_INSTRUMENT_MAP[patch.instrument];
      if (kMap) {
        track.midiChannel = kMap.midiChannel;
        track.programChange = kMap.programChange;
      }
    }
    if (patch.volume != null) track.volume = Math.max(0, Math.min(1, patch.volume));
    if (patch.pan != null) track.pan = Math.max(-1, Math.min(1, patch.pan));
    if (patch.muted != null) track.muted = Boolean(patch.muted);
    if (patch.solo != null) track.solo = Boolean(patch.solo);

    // 2. Note slice modifications
    if (patch.range || patch.replaceNotes || patch.insertNotes || patch.deleteNotes || patch.alterVelocity || patch.alterDuration) {
      let sliceStartTick = 0;
      let sliceEndTick = (this.project.totalBars || 16) * ticksPerBar;

      if (patch.range) {
        if (patch.range.startBar != null) sliceStartTick = (patch.range.startBar - 1) * ticksPerBar;
        if (patch.range.endBar != null) sliceEndTick = patch.range.endBar * ticksPerBar;
        if (patch.range.startTick != null) sliceStartTick = patch.range.startTick;
        if (patch.range.endTick != null) sliceEndTick = patch.range.endTick;
      }

      // Partition notes: untouched outside range vs notes inside range
      let outsideNotes = track.notes.filter(n => n.startTick < sliceStartTick || n.startTick >= sliceEndTick);
      let insideNotes = track.notes.filter(n => n.startTick >= sliceStartTick && n.startTick < sliceEndTick);

      // If replacing notes in range
      if (Array.isArray(patch.replaceNotes)) {
        insideNotes = patch.replaceNotes.map(n => ({
          pitch: n.pitch,
          startTick: n.startTick != null ? n.startTick : (n.bar ? (n.bar - 1) * ticksPerBar + ((n.beat - 1) || 0) * ppq : sliceStartTick),
          durationTicks: n.durationTicks || ppq,
          velocity: n.velocity != null ? n.velocity : 75
        }));
      }

      // If deleting notes in range
      if (patch.deleteNotes === true) {
        insideNotes = [];
      } else if (Array.isArray(patch.deleteNotes)) {
        // delete matching pitches
        const deletePitches = new Set(patch.deleteNotes);
        insideNotes = insideNotes.filter(n => !deletePitches.has(n.pitch));
      }

      // If inserting notes
      if (Array.isArray(patch.insertNotes)) {
        const inserted = patch.insertNotes.map(n => ({
          pitch: n.pitch,
          startTick: n.startTick != null ? n.startTick : (n.bar ? (n.bar - 1) * ticksPerBar + ((n.beat - 1) || 0) * ppq : sliceStartTick),
          durationTicks: n.durationTicks || ppq,
          velocity: n.velocity != null ? n.velocity : 75
        }));
        insideNotes = [...insideNotes, ...inserted];
      }

      // If altering velocity
      if (patch.alterVelocity) {
        const { delta = 0, factor = 1.0, min = 1, max = 127 } = patch.alterVelocity;
        insideNotes = insideNotes.map(n => ({
          ...n,
          velocity: Math.max(min, Math.min(max, Math.round((n.velocity * factor) + delta)))
        }));
      }

      // If altering duration
      if (patch.alterDuration) {
        const { deltaTicks = 0, factor = 1.0 } = patch.alterDuration;
        insideNotes = insideNotes.map(n => ({
          ...n,
          durationTicks: Math.max(30, Math.round((n.durationTicks * factor) + deltaTicks))
        }));
      }

      // Combine and sort
      track.notes = [...outsideNotes, ...insideNotes].sort((a, b) => a.startTick - b.startTick);
    }

    this.save();
    return {
      success: true,
      trackId: track.id,
      trackName: track.name,
      totalNotes: track.notes.length,
      reason
    };
  }

  createTrack(options = {}) {
    const { name, instrument = 'piano', volume = 0.8, pan = 0, notes = [] } = options;
    this.pushUndo(`Create track "${name || instrument}"`);

    const inst = instrument.toLowerCase();
    const kMap = KAWAI_INSTRUMENT_MAP[inst] || KAWAI_INSTRUMENT_MAP.piano;

    const newTrack = {
      id: `track-${inst}-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      name: name || kMap.name || inst,
      instrument: inst,
      isAnchor: false,
      midiChannel: kMap.midiChannel,
      programChange: kMap.programChange,
      volume: Math.max(0, Math.min(1, volume)),
      pan: Math.max(-1, Math.min(1, pan)),
      muted: false,
      solo: false,
      notes: notes || [],
      pedals: []
    };

    this.project.tracks.push(newTrack);
    this.save();
    return newTrack;
  }

  deleteTrack(trackIdOrName) {
    this.pushUndo(`Delete track "${trackIdOrName}"`);
    const track = this.findTrack(trackIdOrName);
    if (!track) throw new Error(`Track matching "${trackIdOrName}" not found`);
    if (track.isAnchor) throw new Error(`Cannot delete protected Kawai piano performance anchor.`);

    this.project.tracks = this.project.tracks.filter(t => t.id !== track.id);
    this.save();
    return { success: true, deletedTrack: track.name };
  }

  setInstrument(trackIdOrName, instrument) {
    this.pushUndo(`Change instrument of "${trackIdOrName}" to ${instrument}`);
    const track = this.findTrack(trackIdOrName);
    if (!track) throw new Error(`Track matching "${trackIdOrName}" not found`);

    const inst = instrument.toLowerCase();
    const kMap = KAWAI_INSTRUMENT_MAP[inst] || KAWAI_INSTRUMENT_MAP.piano;
    track.instrument = inst;
    track.name = track.isAnchor ? track.name : (kMap.name || inst);
    track.midiChannel = kMap.midiChannel;
    track.programChange = kMap.programChange;

    this.save();
    return track;
  }

  setMix(options = {}) {
    const { trackIdOrName, volume, pan, muted, solo, masterVolume } = options;
    this.pushUndo(`Update mix`);

    if (trackIdOrName) {
      const track = this.findTrack(trackIdOrName);
      if (!track) throw new Error(`Track matching "${trackIdOrName}" not found`);
      if (volume != null) track.volume = Math.max(0, Math.min(1, volume));
      if (pan != null) track.pan = Math.max(-1, Math.min(1, pan));
      if (muted != null) track.muted = Boolean(muted);
      if (solo != null) track.solo = Boolean(solo);
    }

    if (masterVolume != null) {
      this.project.masterVolume = Math.max(0, Math.min(1, masterVolume));
    }

    this.save();
    return this.project;
  }

  createSnapshot(name) {
    const snapshot = {
      id: 'snap-' + Date.now(),
      name: name || `Snapshot ${this.project.snapshots.length + 1}`,
      timestamp: new Date().toISOString(),
      tracks: JSON.parse(JSON.stringify(this.project.tracks)),
      renderingMode: this.project.renderingMode
    };
    this.project.snapshots.push(snapshot);
    this.save();
    return snapshot;
  }

  restoreSnapshot(snapshotId) {
    const snap = this.project.snapshots.find(s => s.id === snapshotId || s.name.toLowerCase() === snapshotId.toLowerCase());
    if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);
    this.pushUndo(`Restore snapshot "${snap.name}"`);
    this.project.tracks = JSON.parse(JSON.stringify(snap.tracks));
    if (snap.renderingMode) this.project.renderingMode = snap.renderingMode;
    this.save();
    return this.project;
  }

  pushUndo(desc) {
    const state = {
      desc,
      tracks: JSON.parse(JSON.stringify(this.project.tracks)),
      renderingMode: this.project.renderingMode,
      time: Date.now()
    };
    this.undoStack.push(state);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return null;
    const currentState = {
      desc: 'Redo',
      tracks: JSON.parse(JSON.stringify(this.project.tracks)),
      renderingMode: this.project.renderingMode,
      time: Date.now()
    };
    this.redoStack.push(currentState);

    const prev = this.undoStack.pop();
    this.project.tracks = prev.tracks;
    if (prev.renderingMode) this.project.renderingMode = prev.renderingMode;
    this.save();
    return { undone: prev.desc, project: this.project };
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const currentState = {
      desc: 'Undo',
      tracks: JSON.parse(JSON.stringify(this.project.tracks)),
      renderingMode: this.project.renderingMode,
      time: Date.now()
    };
    this.undoStack.push(currentState);

    const next = this.redoStack.pop();
    this.project.tracks = next.tracks;
    if (next.renderingMode) this.project.renderingMode = next.renderingMode;
    this.save();
    return { redone: next.desc, project: this.project };
  }
}

export const projectStore = new ProjectStore();
