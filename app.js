// public/app.js
// Main Studio Application Controller with Dual Rendering Modes, Auto-Take Capture,
// Real-time Live Piano Input Monitor, and Direct Antigravity Prompting.

import { audioEngine } from './audio.js';
import { KawaiMidiManager } from './midi.js';
import { StudioVisualizer } from './visualizer.js';

class StudioApp {
  constructor() {
    this.ws = null;
    this.project = null;
    this.midi = null;
    this.visualizer = null;

    this.isPlaying = false;
    this.isRecording = false;
    this.isLooping = false;

    this.currentTick = 0;
    this.totalTicks = 16 * 1920;
    this.playbackStartAudioTime = 0;
    this.playbackStartTick = 0;
    this.scheduledNotesSet = new Set();
    this.activeSoundingNotes = new Map();

    this.dom = {
      btnPlay: document.getElementById('btn-play'),
      btnStop: document.getElementById('btn-stop'),
      btnRecord: document.getElementById('btn-record'),
      btnLoop: document.getElementById('btn-loop'),
      btnConnectMidi: document.getElementById('btn-request-midi'),
      btnLoadDemo: document.getElementById('btn-load-demo'),
      btnPanic: document.getElementById('btn-panic'),
      renderingModeSelect: document.getElementById('rendering-mode-select'),
      barCounter: document.getElementById('bar-counter'),
      tempoDisplay: document.getElementById('tempo-display'),
      midiLabel: document.getElementById('midi-label'),
      midiDot: document.getElementById('midi-dot'),
      detectedKeyBadge: document.getElementById('detected-key-badge'),
      totalBarsBadge: document.getElementById('total-bars-badge'),
      jitterBadge: document.getElementById('jitter-badge'),
      footerStatus: document.getElementById('footer-status-text'),
      masterVolume: document.getElementById('master-volume'),

      // Prompt UI
      promptInput: document.getElementById('prompt-input'),
      btnSubmitPrompt: document.getElementById('btn-submit-prompt'),
      promptStatusTag: document.getElementById('prompt-status-tag'),

      // Live Piano Monitor UI
      liveIndicator: document.getElementById('live-indicator'),
      liveNoteDisplay: document.getElementById('live-note-display'),
      btnTestPiano: document.getElementById('btn-test-piano'),
      btnOpenSetup: document.getElementById('btn-open-setup'),

      // Setup Modal
      modalSetupGuide: document.getElementById('modal-setup-guide'),
      btnCloseSetup: document.getElementById('btn-close-setup'),
      btnDismissModal: document.getElementById('btn-dismiss-modal'),
      btnReconnectMidiModal: document.getElementById('btn-reconnect-midi-modal')
    };

    this.animFrameId = null;
  }

  async init() {
    this.setupWebSocket();
    this.setupVisualizer();
    this.setupMidi();
    this.setupEvents();
    console.log('[Studio App] Ready with auto-take capture and live input monitoring.');
  }

  setupWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected to Studio Server');
      // Transmit active status immediately on connect
      if (this.midi) {
        this.sendWs('KAWAI_STATUS', {
          connected: Boolean(this.midi.activeInput),
          device: this.midi.activeInput?.name || null
        });
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handleServerMessage(msg);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('[WS] Disconnected, retrying in 2s...');
      setTimeout(() => this.setupWebSocket(), 2000);
    };
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'INIT_STATE':
        this.onProjectLoaded(msg.payload.project);
        break;

      case 'PROJECT_UPDATED':
        this.onProjectLoaded(msg.payload.project);
        break;

      case 'NEW_PROMPT':
        if (this.dom.promptStatusTag) {
          this.dom.promptStatusTag.textContent = `Active prompt: "${msg.payload.prompt.slice(0, 32)}..."`;
        }
        break;

      case 'PLAY':
        this.play(msg.payload.fromBar || 1, Boolean(msg.payload.loop));
        break;

      case 'STOP':
        this.stop();
        break;

      case 'SEEK':
        this.seek(msg.payload.bar || 1);
        break;

      case 'SOLO_PREVIEW':
        audioEngine.renderSoloPreview(msg.payload.instrument, msg.payload.barCount);
        break;
    }
  }

  setupVisualizer() {
    this.visualizer = new StudioVisualizer({
      onTrackChange: (trackId, patch) => {
        fetch(`/api/project/tracks/${encodeURIComponent(trackId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch)
        }).catch(err => console.error(err));
      }
    });
  }

  setupMidi() {
    this.midi = new KawaiMidiManager({
      renderingMode: this.project?.renderingMode || 'piano_quality',
      onStatusChange: (status) => {
        if (status.connected) {
          this.dom.midiDot.classList.add('connected');
          this.dom.midiLabel.textContent = status.device;
          this.dom.btnConnectMidi.style.display = 'none';
          this.sendWs('KAWAI_STATUS', { connected: true, device: status.device });

          if (status.jitterStats && status.jitterStats.sampleCount > 0) {
            this.dom.jitterBadge.textContent = `Jitter: ±${status.jitterStats.jitterStandardDeviationMs}ms`;
          }
        } else {
          this.dom.midiDot.classList.remove('connected');
          this.dom.midiLabel.textContent = status.error ? `MIDI: ${status.error}` : 'Kawai CA-701: Not Connected';
          this.dom.btnConnectMidi.style.display = 'inline-block';
          this.sendWs('KAWAI_STATUS', { connected: false });
        }
      },
      onNoteOn: (pitch, velocity, channel, noteName) => {
        this.activeSoundingNotes.set(pitch, noteName);
        this.dom.liveIndicator.classList.add('active');

        const activeChordList = Array.from(this.activeSoundingNotes.values()).join('  ');
        this.dom.liveNoteDisplay.innerHTML = `Playing: <span class="active-chord">[ ${activeChordList} ]</span> (Velocity: ${velocity})`;

        // In browser fallback (or when Kawai physical audio isn't sounding): sound note
        if (audioEngine.ctx && !this.midi.activeOutput) {
          audioEngine.playNote('piano', pitch, audioEngine.ctx.currentTime, 1.0, velocity);
        }
      },
      onNoteOff: (pitch) => {
        this.activeSoundingNotes.delete(pitch);
        if (this.activeSoundingNotes.size === 0) {
          this.dom.liveIndicator.classList.remove('active');
        }
      },
      onNoteActivity: (info) => {
        this.dom.midiDot.classList.add('pulse');
        setTimeout(() => this.dom.midiDot.classList.remove('pulse'), 150);

        if (this.midi.measuredJitterStats.sampleCount > 0) {
          this.dom.jitterBadge.textContent = `Jitter: ±${this.midi.measuredJitterStats.jitterStandardDeviationMs}ms`;
        }
      },
      onRecordingComplete: (perfData) => {
        this.dom.footerStatus.textContent = `✓ Take captured (${perfData.notes.length} notes). Ready for prompt!`;
        this.sendWs('RECORDING_FINISHED', perfData);

        // Update anchor track in visualizer immediately so notes appear live
        if (this.project) {
          const anchor = this.project.tracks.find(t => t.isAnchor);
          if (anchor) {
            anchor.notes = perfData.notes;
            this.visualizer.setProject(this.project);
          }
        }

        fetch('/api/performance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(perfData)
        }).then(() => {
          this.refreshAnalysis();
        });
      }
    });

    this.midi.init();
  }

  setupEvents() {
    this.dom.btnPlay.addEventListener('click', () => {
      if (this.isPlaying) this.stop();
      else this.play(1, this.isLooping);
    });

    this.dom.btnStop.addEventListener('click', () => this.stop());
    this.dom.btnRecord.addEventListener('click', () => this.toggleRecord());

    this.dom.btnLoop.addEventListener('click', () => {
      this.isLooping = !this.isLooping;
      this.dom.btnLoop.classList.toggle('active', this.isLooping);
    });

    this.dom.btnConnectMidi.addEventListener('click', () => this.midi.init());

    // Prompt Bar Events
    if (this.dom.btnSubmitPrompt && this.dom.promptInput) {
      this.dom.btnSubmitPrompt.addEventListener('click', () => this.submitPrompt());
      this.dom.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submitPrompt();
        }
      });
    }

    // Test Chord button
    if (this.dom.btnTestPiano) {
      this.dom.btnTestPiano.addEventListener('click', () => this.playTestChord());
    }

    // Setup Guide Modal
    if (this.dom.btnOpenSetup && this.dom.modalSetupGuide) {
      this.dom.btnOpenSetup.addEventListener('click', () => {
        this.dom.modalSetupGuide.style.display = 'flex';
      });
      this.dom.btnCloseSetup.addEventListener('click', () => {
        this.dom.modalSetupGuide.style.display = 'none';
      });
      this.dom.btnDismissModal.addEventListener('click', () => {
        this.dom.modalSetupGuide.style.display = 'none';
      });
      this.dom.btnReconnectMidiModal.addEventListener('click', () => {
        this.midi.init();
        this.dom.modalSetupGuide.style.display = 'none';
      });
    }

    // Emergency Panic Button
    this.dom.btnPanic.addEventListener('click', () => this.panic());

    // Rendering Mode selector
    this.dom.renderingModeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      if (this.project) this.project.renderingMode = mode;
      this.midi.setRenderingMode(mode);
      this.dom.footerStatus.textContent = `Rendering Mode: ${mode === 'piano_quality' ? 'Piano Quality (SK-EX + Browser Audio)' : 'Kawai Multi-Timbral (GM2 Module)'}`;
    });

    this.dom.btnLoadDemo.addEventListener('click', async () => {
      const res = await fetch('/api/performance');
      if (res.ok) {
        const data = await res.json();
        this.dom.footerStatus.textContent = 'Loaded 16-Bar Kawai Performance Demo';
        this.refreshAnalysis();
      }
    });

    this.dom.masterVolume.addEventListener('input', (e) => {
      audioEngine.setMasterVolume(parseFloat(e.target.value));
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (this.isPlaying) this.stop();
        else this.play(1, this.isLooping);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        this.toggleRecord();
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        this.isLooping = !this.isLooping;
        this.dom.btnLoop.classList.toggle('active', this.isLooping);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.panic();
      }
    });
  }

  async submitPrompt() {
    const text = (this.dom.promptInput.value || '').trim();
    if (!text) return;

    this.dom.promptStatusTag.textContent = `✨ Transforming music: "${text}"...`;
    this.dom.footerStatus.textContent = `Arranging: "${text}"...`;
    
    try {
      // Resume audio context on user gesture
      audioEngine.resume();

      const res = await fetch('/api/arrange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.dom.promptStatusTag.textContent = `✓ Transformed: ${data.tracksCount} tracks (${data.detectedKey})! Playing now...`;
        this.dom.footerStatus.textContent = data.reason || `Transformed for: "${text}"`;
        this.onProjectLoaded(data.project);
        this.play(1, true);
      } else {
        // Fallback: send prompt to queue for Antigravity
        await fetch('/api/prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text })
        });
        this.dom.promptStatusTag.textContent = data.error || '✓ Prompt queued for Antigravity!';
      }
    } catch (err) {
      console.error('Arrange error:', err);
      this.dom.promptStatusTag.textContent = 'Error during transformation.';
    }
  }

  playTestChord() {
    // Plays a rich Dm9 jazz chord to test sound, visualizer, and auto-capture
    audioEngine.resume();
    this.midi.simulateNote(62, 90, 700); // D4
    setTimeout(() => this.midi.simulateNote(65, 85, 700), 60);  // F4
    setTimeout(() => this.midi.simulateNote(69, 88, 700), 120); // A4
    setTimeout(() => this.midi.simulateNote(72, 82, 700), 180); // C5
    setTimeout(() => this.midi.simulateNote(76, 80, 800), 240); // E5
  }

  panic() {
    this.stop();
    this.midi.panic();
    this.dom.footerStatus.textContent = '● Panic triggered: Reset all 16 MIDI channels';
    console.log('[Studio App] Panic executed.');
  }

  sendWs(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  onProjectLoaded(project) {
    this.project = project;
    this.totalTicks = (project.totalBars || 16) * ((project.ppq || 480) * 4);
    this.dom.tempoDisplay.textContent = `${project.bpm || 92} BPM`;
    this.dom.totalBarsBadge.textContent = `${project.totalBars || 16} Bars`;

    if (project.renderingMode && this.dom.renderingModeSelect) {
      this.dom.renderingModeSelect.value = project.renderingMode;
      this.midi.setRenderingMode(project.renderingMode);
    }

    this.visualizer.setProject(project);
    this.refreshAnalysis();
  }

  async refreshAnalysis() {
    try {
      const res = await fetch('/api/performance');
      if (res.ok) {
        const data = await res.json();
        if (data.analysis && data.analysis.key && data.analysis.key.tonic) {
          this.dom.detectedKeyBadge.textContent = `Key: ${data.analysis.key.tonic} ${data.analysis.key.scale}`;
        } else {
          this.dom.detectedKeyBadge.textContent = 'Key: Awaiting Take';
        }
      }
    } catch {}
  }

  toggleRecord() {
    if (this.isRecording) {
      this.isRecording = false;
      this.dom.btnRecord.classList.remove('active');
      const take = this.midi.stopRecording();
      this.dom.footerStatus.textContent = `Recording stopped. Captured ${take?.notes.length || 0} notes.`;
    } else {
      audioEngine.resume();
      this.isRecording = true;
      this.dom.btnRecord.classList.add('active');
      this.midi.startRecording(this.project?.bpm || 92, this.project?.ppq || 480);
      this.dom.footerStatus.textContent = 'Recording active. Play your Kawai CA-701...';
    }
  }

  play(fromBar = 1, loop = false) {
    audioEngine.resume();
    this.isPlaying = true;
    this.isLooping = loop;
    this.dom.btnPlay.classList.add('active');

    const ppq = this.project?.ppq || 480;
    const ticksPerBar = ppq * 4;
    this.currentTick = (fromBar - 1) * ticksPerBar;

    this.playbackStartAudioTime = audioEngine.ctx.currentTime;
    this.playbackStartTick = this.currentTick;
    this.scheduledNotesSet.clear();

    this.sendWs('PLAYBACK_STATUS', { isPlaying: true, currentBar: fromBar });
    this.dom.footerStatus.textContent = `Playing from Bar ${fromBar}...`;

    this.startPlaybackLoop();
  }

  stop() {
    this.isPlaying = false;
    this.dom.btnPlay.classList.remove('active');
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.scheduledNotesSet.clear();

    this.currentTick = 0;
    this.updateTimelineUI(0);
    this.sendWs('PLAYBACK_STATUS', { isPlaying: false, currentBar: 1 });
    this.dom.footerStatus.textContent = 'Stopped';
  }

  seek(bar = 1) {
    const ppq = this.project?.ppq || 480;
    const ticksPerBar = ppq * 4;
    this.currentTick = (bar - 1) * ticksPerBar;
    this.updateTimelineUI(this.currentTick);
  }

  startPlaybackLoop() {
    const loopStep = () => {
      if (!this.isPlaying) return;

      const bpm = this.project?.bpm || 92;
      const ppq = this.project?.ppq || 480;
      const msPerTick = (60000 / bpm) / ppq;

      const elapsedSec = audioEngine.ctx.currentTime - this.playbackStartAudioTime;
      const elapsedTicks = Math.floor((elapsedSec * 1000) / msPerTick);

      this.currentTick = this.playbackStartTick + elapsedTicks;

      // Handle loop or end of song
      if (this.currentTick >= this.totalTicks) {
        if (this.isLooping) {
          this.playbackStartAudioTime = audioEngine.ctx.currentTime;
          this.playbackStartTick = 0;
          this.currentTick = 0;
          this.scheduledNotesSet.clear();
        } else {
          this.stop();
          return;
        }
      }

      this.scheduleUpcomingNotes();
      this.updateTimelineUI(this.currentTick);

      this.animFrameId = requestAnimationFrame(loopStep);
    };

    this.animFrameId = requestAnimationFrame(loopStep);
  }

  scheduleUpcomingNotes() {
    if (!this.project || !this.project.tracks) return;

    const bpm = this.project.bpm || 92;
    const ppq = this.project.ppq || 480;
    const msPerTick = (60000 / bpm) / ppq;

    const scheduleWindowTicks = ppq * 2; // 2 beats ahead lookahead
    const windowEndTick = this.currentTick + scheduleWindowTicks;

    const isMultiTimbral = (this.project.renderingMode === 'kawai_multitimbral');

    for (const track of this.project.tracks) {
      if (track.muted) continue;

      const isPianoAnchor = track.isAnchor;

      for (const note of track.notes) {
        if (note.startTick >= this.currentTick && note.startTick < windowEndTick) {
          const noteKey = `${track.id}-${note.pitch}-${note.startTick}`;
          if (!this.scheduledNotesSet.has(noteKey)) {
            this.scheduledNotesSet.add(noteKey);

            const ticksUntilStart = note.startTick - this.currentTick;
            const noteStartTime = audioEngine.ctx.currentTime + (ticksUntilStart * msPerTick) / 1000;
            const noteDurationSec = (note.durationTicks * msPerTick) / 1000;

            // Audio Routing:
            if (!isMultiTimbral || !this.midi.activeOutput) {
              audioEngine.playNote(
                track.instrument,
                note.pitch,
                noteStartTime,
                noteDurationSec,
                note.velocity || 75,
                track.pan || 0,
                track.volume != null ? track.volume : 0.85
              );
            }

            // MIDI Output Routing to Kawai CA-701:
            if (this.midi.activeOutput) {
              const delayMs = Math.max(0, (noteStartTime - audioEngine.ctx.currentTime) * 1000);
              const channel = isMultiTimbral ? (track.midiChannel != null ? track.midiChannel : 0) : 0;

              if (isMultiTimbral || isPianoAnchor) {
                setTimeout(() => {
                  this.midi.sendNoteOnToKawai(note.pitch, note.velocity || 80, channel);
                  setTimeout(() => {
                    this.midi.sendNoteOffToKawai(note.pitch, channel);
                  }, noteDurationSec * 1000);
                }, delayMs);
              }
            }
          }
        }
      }
    }
  }

  updateTimelineUI(tick) {
    const ppq = this.project?.ppq || 480;
    const ticksPerBar = ppq * 4;

    const currentBar = Math.floor(tick / ticksPerBar) + 1;
    const beatInBar = Math.floor((tick % ticksPerBar) / ppq) + 1;

    this.dom.barCounter.textContent = `${currentBar.toString().padStart(2, '0')} . ${beatInBar}`;

    const progressNorm = Math.min(1.0, Math.max(0, tick / this.totalTicks));
    this.visualizer.updatePlayhead(progressNorm);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new StudioApp();
  app.init();
});
