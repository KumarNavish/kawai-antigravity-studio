// public/midi.js
// Web MIDI API integration for Kawai CA-701 with raw performance capture,
// auto-take capture (zero lost notes), live visualizer activity, and computer keyboard test mode.

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function midiToNoteName(pitch) {
  const octave = Math.floor(pitch / 12) - 1;
  const note = NOTE_NAMES[pitch % 12];
  return `${note}${octave}`;
}

export class KawaiMidiManager {
  constructor(options = {}) {
    this.midiAccess = null;
    this.activeInput = null;
    this.activeOutput = null;

    // Take capture state
    this.isManualRecording = false;
    this.isAutoRecording = false;
    this.recordStartTime = null;
    this.recordedNotes = [];
    this.recordedPedals = [];
    this.activeNoteMap = new Map(); // pitch -> { startTime, velocity, channel }
    this.autoCommitTimer = null;

    // Jitter telemetry
    this.messageTimestamps = [];
    this.measuredJitterStats = {
      sampleCount: 0,
      meanIntervalMs: 0,
      jitterStandardDeviationMs: 0,
      maxJitterMs: 0
    };

    this.renderingMode = options.renderingMode || 'piano_quality'; // 'piano_quality' | 'kawai_multitimbral'
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onNoteActivity = options.onNoteActivity || (() => {});
    this.onNoteOn = options.onNoteOn || (() => {});
    this.onNoteOff = options.onNoteOff || (() => {});
    this.onRecordingComplete = options.onRecordingComplete || (() => {});
    this.bpm = options.bpm || 92;
    this.ppq = options.ppq || 480;

    this.pollingInterval = null;
    this.setupKeyboardFallback();
  }

  setRenderingMode(mode) {
    this.renderingMode = mode;
    console.log(`[Web MIDI] Rendering mode set to: ${mode}`);
  }

  async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('[Web MIDI] navigator.requestMIDIAccess not supported in this browser.');
      this.onStatusChange({ connected: false, error: 'Web MIDI not supported (Use Chrome/Brave)' });
      return false;
    }

    try {
      // First try standard non-sysex MIDI (avoids scary browser permission prompts in Chrome)
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      } catch {
        this.midiAccess = await navigator.requestMIDIAccess();
      }

      this.midiAccess.onstatechange = (e) => this.handleStateChange(e);
      this.scanDevices();

      // Keep polling device state every 2s in case USB cable is plugged in later
      if (!this.pollingInterval) {
        this.pollingInterval = setInterval(() => {
          if (!this.activeInput) this.scanDevices();
        }, 2000);
      }

      return true;
    } catch (err) {
      console.warn('[Web MIDI] Access denied or failed:', err);
      this.onStatusChange({ connected: false, error: err.message });
      return false;
    }
  }

  scanDevices() {
    if (!this.midiAccess) return;

    let kawaiIn = null;
    let anyIn = null;

    for (const input of this.midiAccess.inputs.values()) {
      const name = (input.name || '').toLowerCase();
      console.log(`[Web MIDI] Detected Input: "${input.name}" (State: ${input.state}, Connection: ${input.connection})`);
      if (name.includes('kawai') || name.includes('ca701') || name.includes('ca-701') || name.includes('piano')) {
        kawaiIn = input;
      }
      if (!anyIn && input.state === 'connected') anyIn = input;
    }

    let kawaiOut = null;
    for (const output of this.midiAccess.outputs.values()) {
      const name = (output.name || '').toLowerCase();
      if (name.includes('kawai') || name.includes('ca701') || name.includes('ca-701')) {
        kawaiOut = output;
      }
    }

    const selectedIn = kawaiIn || anyIn;
    if (selectedIn && selectedIn.state === 'connected') {
      if (this.activeInput !== selectedIn) {
        this.connectInput(selectedIn);
      }
      this.activeOutput = kawaiOut;
      this.onStatusChange({
        connected: true,
        device: selectedIn.name,
        isKawai: Boolean(kawaiIn),
        hasOutput: Boolean(kawaiOut),
        jitterStats: this.measuredJitterStats
      });
    } else {
      this.activeInput = null;
      this.activeOutput = null;
      this.onStatusChange({ connected: false, device: null });
    }
  }

  connectInput(input) {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
    }
    this.activeInput = input;
    this.activeInput.onmidimessage = (msg) => this.handleMidiMessage(msg);
    console.log(`[Web MIDI] Active MIDI Input Connected: "${input.name}"`);
  }

  handleStateChange(event) {
    console.log(`[Web MIDI] Device state change: ${event.port.name} (${event.port.type}) -> ${event.port.state}`);
    this.scanDevices();
  }

  handleMidiMessage(event) {
    const [status, data1, data2] = event.data;
    const command = status >> 4;
    const channel = status & 0x0f;
    const now = performance.now();

    this.recordTimingJitter(now);

    // Note On (0x90)
    if (command === 0x09) {
      const pitch = data1;
      const velocity = data2;
      if (velocity > 0) {
        this.handleNoteOn(pitch, velocity, channel, now);
      } else {
        this.handleNoteOff(pitch, 64, channel, now);
      }
    }
    // Note Off (0x80)
    else if (command === 0x08) {
      const pitch = data1;
      const releaseVelocity = data2 || 64;
      this.handleNoteOff(pitch, releaseVelocity, channel, now);
    }
    // Control Change (0xB0) - Pedals
    else if (command === 0x0b) {
      const cc = data1;
      const value = data2;
      this.handleControlChange(cc, value, channel, now);
    }
  }

  recordTimingJitter(now) {
    this.messageTimestamps.push(now);
    if (this.messageTimestamps.length > 100) this.messageTimestamps.shift();

    if (this.messageTimestamps.length >= 4) {
      const intervals = [];
      for (let i = 1; i < this.messageTimestamps.length; i++) {
        intervals.push(this.messageTimestamps[i] - this.messageTimestamps[i - 1]);
      }
      const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);

      this.measuredJitterStats = {
        sampleCount: intervals.length,
        meanIntervalMs: Math.round(mean * 100) / 100,
        jitterStandardDeviationMs: Math.round(stdDev * 100) / 100,
        maxJitterMs: Math.round(Math.max(...intervals) * 100) / 100
      };
    }
  }

  handleNoteOn(pitch, velocity, channel, timestamp) {
    // Notify UI immediately of live note
    const noteName = midiToNoteName(pitch);
    this.onNoteOn(pitch, velocity, channel, noteName);
    this.onNoteActivity({ pitch, velocity, noteName });

    // Auto-Capture Take Management:
    // If not recording, start an auto-take automatically so zero notes are lost
    if (!this.isManualRecording && !this.isAutoRecording) {
      this.isAutoRecording = true;
      this.recordStartTime = timestamp;
      this.recordedNotes = [];
      this.recordedPedals = [];
      this.activeNoteMap.clear();
      console.log('[Web MIDI] Auto-Take started playing at timestamp:', timestamp);
    }

    if (this.isManualRecording || this.isAutoRecording) {
      this.activeNoteMap.set(pitch, {
        startTime: timestamp,
        velocity,
        channel
      });

      // Reset auto-commit silence timer (commits take 2.2 seconds after last note release)
      if (this.isAutoRecording) {
        clearTimeout(this.autoCommitTimer);
      }
    }
  }

  handleNoteOff(pitch, releaseVelocity, channel, timestamp) {
    this.onNoteOff(pitch, channel);

    if ((this.isManualRecording || this.isAutoRecording) && this.activeNoteMap.has(pitch)) {
      const noteStart = this.activeNoteMap.get(pitch);
      this.activeNoteMap.delete(pitch);

      const rawTimeMs = timestamp - this.recordStartTime;
      const rawDurationMs = Math.max(20, timestamp - noteStart.startTime);

      const msPerTick = (60000 / this.bpm) / this.ppq;
      const startTick = Math.max(0, Math.round((noteStart.startTime - this.recordStartTime) / msPerTick));
      const durationTicks = Math.max(20, Math.round(rawDurationMs / msPerTick));

      const ticksPerBar = this.ppq * 4;
      const inferredBar = Math.floor(startTick / ticksPerBar) + 1;
      const tickInBar = startTick % ticksPerBar;
      const inferredBeat = Math.floor(tickInBar / this.ppq) + 1;

      this.recordedNotes.push({
        pitch,
        velocity: noteStart.velocity,
        releaseVelocity,
        channel: noteStart.channel,
        rawTimeMs: Math.round((noteStart.startTime - this.recordStartTime) * 100) / 100,
        rawDurationMs: Math.round(rawDurationMs * 100) / 100,
        startTick,
        durationTicks,
        inferredBar,
        inferredBeat
      });

      // In Auto-Recording mode, start silence countdown to auto-commit take
      if (this.isAutoRecording && !this.isManualRecording) {
        clearTimeout(this.autoCommitTimer);
        this.autoCommitTimer = setTimeout(() => {
          this.commitAutoTake();
        }, 2200);
      }
    }
  }

  handleControlChange(cc, value, channel, timestamp) {
    if (this.isManualRecording || this.isAutoRecording) {
      const rawTimeMs = timestamp - (this.recordStartTime || timestamp);
      const msPerTick = (60000 / this.bpm) / this.ppq;
      const tick = Math.max(0, Math.round(rawTimeMs / msPerTick));

      const ccNames = {
        64: 'damper_sustain',
        66: 'sostenuto',
        67: 'soft_pedal',
        1: 'modulation',
        11: 'expression'
      };

      this.recordedPedals.push({
        cc,
        name: ccNames[cc] || `cc_${cc}`,
        value,
        channel,
        rawTimeMs: Math.round(rawTimeMs * 100) / 100,
        tick
      });
    }
  }

  startRecording(bpm, ppq) {
    if (bpm) this.bpm = bpm;
    if (ppq) this.ppq = ppq;
    clearTimeout(this.autoCommitTimer);
    this.isManualRecording = true;
    this.isAutoRecording = false;
    this.recordStartTime = performance.now();
    this.recordedNotes = [];
    this.recordedPedals = [];
    this.activeNoteMap.clear();
    console.log('[Web MIDI] Manual recording started.');
  }

  stopRecording() {
    clearTimeout(this.autoCommitTimer);
    if (!this.isManualRecording && !this.isAutoRecording) return null;

    const stopTime = performance.now();

    // Close any active ringing notes
    for (const [pitch, noteStart] of this.activeNoteMap.entries()) {
      const rawDurationMs = Math.max(20, stopTime - noteStart.startTime);
      const msPerTick = (60000 / this.bpm) / this.ppq;
      const startTick = Math.max(0, Math.round((noteStart.startTime - this.recordStartTime) / msPerTick));
      const durationTicks = Math.max(20, Math.round(rawDurationMs / msPerTick));
      const ticksPerBar = this.ppq * 4;
      const inferredBar = Math.floor(startTick / ticksPerBar) + 1;
      const inferredBeat = Math.floor((startTick % ticksPerBar) / this.ppq) + 1;

      this.recordedNotes.push({
        pitch,
        velocity: noteStart.velocity,
        releaseVelocity: 64,
        channel: noteStart.channel,
        rawTimeMs: Math.round((noteStart.startTime - this.recordStartTime) * 100) / 100,
        rawDurationMs: Math.round(rawDurationMs * 100) / 100,
        startTick,
        durationTicks,
        inferredBar,
        inferredBeat
      });
    }

    this.activeNoteMap.clear();
    this.isManualRecording = false;
    this.isAutoRecording = false;

    const maxBar = this.recordedNotes.reduce((max, n) => Math.max(max, n.inferredBar), 1);
    const totalBars = Math.max(16, Math.ceil(maxBar / 4) * 4);

    const perfData = {
      title: `Kawai CA-701 Performance (${new Date().toLocaleTimeString()})`,
      bpm: this.bpm,
      timeSignature: [4, 4],
      ppq: this.ppq,
      totalBars,
      notes: this.recordedNotes,
      pedals: this.recordedPedals,
      timingJitterStats: this.measuredJitterStats
    };

    if (this.onRecordingComplete) {
      this.onRecordingComplete(perfData);
    }
    return perfData;
  }

  commitAutoTake() {
    if (!this.isAutoRecording || this.isManualRecording) return;
    if (this.recordedNotes.length === 0) {
      this.isAutoRecording = false;
      return;
    }
    console.log(`[Web MIDI] Auto-committing take with ${this.recordedNotes.length} notes`);
    this.stopRecording();
  }

  // Fallback simulator for testing
  simulateNote(pitch, velocity = 85, durationMs = 400) {
    const now = performance.now();
    this.handleNoteOn(pitch, velocity, 0, now);
    setTimeout(() => {
      this.handleNoteOff(pitch, 64, 0, performance.now());
    }, durationMs);
  }

  setupKeyboardFallback() {
    const keyMap = {
      'a': 60, // C4
      'w': 61, // C#4
      's': 62, // D4
      'e': 63, // Eb4
      'd': 64, // E4
      'f': 65, // F4
      't': 66, // F#4
      'g': 67, // G4
      'y': 68, // Ab4
      'h': 69, // A4
      'u': 70, // Bb4
      'j': 71, // B4
      'k': 72  // C5
    };

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (keyMap[key] && !this.activeNoteMap.has(keyMap[key])) {
        this.handleNoteOn(keyMap[key], 90, 0, performance.now());
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (keyMap[key]) {
        this.handleNoteOff(keyMap[key], 64, 0, performance.now());
      }
    });
  }

  // Emergency Panic
  panic() {
    if (!this.activeOutput) return;
    for (let ch = 0; ch < 16; ch++) {
      this.activeOutput.send([0xb0 | ch, 120, 0]); // All Sound Off
      this.activeOutput.send([0xb0 | ch, 123, 0]); // All Notes Off
    }
    console.log('[Web MIDI] Sent Panic CC120/123 to all 16 channels');
  }

  sendNoteOnToKawai(pitch, velocity = 80, channel = 0) {
    if (!this.activeOutput) return;
    this.activeOutput.send([0x90 | (channel & 0x0f), pitch & 0x7f, velocity & 0x7f]);
  }

  sendNoteOffToKawai(pitch, channel = 0) {
    if (!this.activeOutput) return;
    this.activeOutput.send([0x80 | (channel & 0x0f), pitch & 0x7f, 64]);
  }
}
