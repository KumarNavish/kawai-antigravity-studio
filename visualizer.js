// public/visualizer.js
// Arranger timeline, tracks rendering, and piano roll canvas visualizer

const INSTRUMENT_COLORS = {
  piano: { primary: '#d4af37', glow: 'rgba(212, 175, 55, 0.4)', bg: 'rgba(212, 175, 55, 0.15)' },
  upright_bass: { primary: '#e09f3e', glow: 'rgba(224, 159, 62, 0.4)', bg: 'rgba(224, 159, 62, 0.15)' },
  bass: { primary: '#e09f3e', glow: 'rgba(224, 159, 62, 0.4)', bg: 'rgba(224, 159, 62, 0.15)' },
  acoustic_drums: { primary: '#e05353', glow: 'rgba(224, 83, 83, 0.4)', bg: 'rgba(224, 83, 83, 0.15)' },
  drums: { primary: '#e05353', glow: 'rgba(224, 83, 83, 0.4)', bg: 'rgba(224, 83, 83, 0.15)' },
  percussion: { primary: '#e05353', glow: 'rgba(224, 83, 83, 0.4)', bg: 'rgba(224, 83, 83, 0.15)' },
  cello: { primary: '#9b72cf', glow: 'rgba(155, 114, 207, 0.4)', bg: 'rgba(155, 114, 207, 0.15)' },
  violin: { primary: '#5b92e5', glow: 'rgba(91, 146, 229, 0.4)', bg: 'rgba(91, 146, 229, 0.15)' },
  string_ensemble: { primary: '#3dd68c', glow: 'rgba(61, 214, 140, 0.4)', bg: 'rgba(61, 214, 140, 0.15)' },
  strings: { primary: '#3dd68c', glow: 'rgba(61, 214, 140, 0.4)', bg: 'rgba(61, 214, 140, 0.15)' },
  acoustic_guitar: { primary: '#f4a261', glow: 'rgba(244, 162, 97, 0.4)', bg: 'rgba(244, 162, 97, 0.15)' },
  flute: { primary: '#48cae4', glow: 'rgba(72, 202, 228, 0.4)', bg: 'rgba(72, 202, 228, 0.15)' },
  warm_pad: { primary: '#b5838d', glow: 'rgba(181, 131, 141, 0.4)', bg: 'rgba(181, 131, 141, 0.15)' }
};

export class StudioVisualizer {
  constructor(options = {}) {
    this.rulerEl = document.getElementById('ruler-sections-track');
    this.tracksListEl = document.getElementById('tracks-list');
    this.playheadEl = document.getElementById('playhead');
    this.viewportEl = document.getElementById('tracks-viewport');
    this.onTrackChange = options.onTrackChange || (() => {});

    this.project = null;
    this.canvases = new Map(); // trackId -> { canvas, ctx }
    this.sidebarWidth = 240;

    window.addEventListener('resize', () => this.handleResize());
  }

  setProject(project) {
    this.project = project;
    this.renderRuler();
    this.renderTracks();
    this.drawAllCanvases();
  }

  renderRuler() {
    if (!this.project || !this.rulerEl) return;
    this.rulerEl.innerHTML = '';

    const sections = this.project.sections || [
      { name: 'Full Performance', startBar: 1, endBar: this.project.totalBars }
    ];

    const totalBars = this.project.totalBars || 16;

    for (const sec of sections) {
      const secBars = (sec.endBar - sec.startBar + 1);
      const widthPct = (secBars / totalBars) * 100;

      const secEl = document.createElement('div');
      secEl.className = 'ruler-section';
      secEl.style.flex = `${secBars} 0 0%`;

      secEl.innerHTML = `
        <span class="ruler-section-name">${sec.name}</span>
        <span class="ruler-section-bars">Bars ${sec.startBar}–${sec.endBar}${sec.mood ? ' · ' + sec.mood : ''}</span>
      `;
      this.rulerEl.appendChild(secEl);
    }
  }

  renderTracks() {
    if (!this.project || !this.tracksListEl) return;
    this.tracksListEl.innerHTML = '';
    this.canvases.clear();

    for (const track of this.project.tracks) {
      const lane = document.createElement('div');
      lane.className = `track-lane ${track.isAnchor ? 'is-anchor' : ''}`;
      lane.dataset.trackId = track.id;

      const anchorTag = track.isAnchor ? '<span class="badge-anchor">ANCHOR</span>' : '';

      lane.innerHTML = `
        <div class="track-sidebar">
          <div class="track-meta">
            <div class="track-name-box">
              <span class="track-name">${track.name} ${anchorTag}</span>
              <span class="track-instrument-tag">${track.instrument.replace(/_/g, ' ')} (${track.notes.length} notes)</span>
            </div>
          </div>
          <div class="track-controls">
            <div class="track-buttons">
              <button class="btn-track-toggle ${track.muted ? 'muted' : ''}" data-action="mute" title="Mute">M</button>
              <button class="btn-track-toggle ${track.solo ? 'solo' : ''}" data-action="solo" title="Solo">S</button>
            </div>
            <input type="range" class="track-vol-slider" min="0" max="1" step="0.01" value="${track.volume}" title="Track Volume">
          </div>
        </div>
        <div class="track-canvas-container" id="canvas-cont-${track.id}">
          <canvas class="track-canvas" id="canvas-${track.id}"></canvas>
        </div>
      `;

      // Event listeners for track controls
      const btnMute = lane.querySelector('[data-action="mute"]');
      const btnSolo = lane.querySelector('[data-action="solo"]');
      const volSlider = lane.querySelector('.track-vol-slider');

      btnMute.addEventListener('click', () => {
        track.muted = !track.muted;
        btnMute.classList.toggle('muted', track.muted);
        this.onTrackChange(track.id, { muted: track.muted });
      });

      btnSolo.addEventListener('click', () => {
        track.solo = !track.solo;
        btnSolo.classList.toggle('solo', track.solo);
        this.onTrackChange(track.id, { solo: track.solo });
      });

      volSlider.addEventListener('input', (e) => {
        track.volume = parseFloat(e.target.value);
        this.onTrackChange(track.id, { volume: track.volume });
      });

      this.tracksListEl.appendChild(lane);

      const canvas = lane.querySelector(`#canvas-${track.id}`);
      this.canvases.set(track.id, { canvas, ctx: canvas.getContext('2d'), track });
    }

    this.handleResize();
  }

  handleResize() {
    for (const [trackId, item] of this.canvases.entries()) {
      const container = document.getElementById(`canvas-cont-${trackId}`);
      if (container && item.canvas) {
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        item.canvas.width = rect.width * dpr;
        item.canvas.height = rect.height * dpr;
        item.ctx.scale(dpr, dpr);
        item.width = rect.width;
        item.height = rect.height;
      }
    }
    this.drawAllCanvases();
  }

  drawAllCanvases() {
    for (const item of this.canvases.values()) {
      this.drawTrackCanvas(item);
    }
  }

  drawTrackCanvas(item) {
    const { ctx, track, width, height } = item;
    if (!ctx || !width || !height) return;

    ctx.clearRect(0, 0, width, height);

    if (!track.notes || track.notes.length === 0) return;

    const totalBars = this.project.totalBars || 16;
    const ticksPerBar = (this.project.ppq || 480) * 4;
    const totalTicks = totalBars * ticksPerBar;

    // Pitch bounds
    const pitches = track.notes.map(n => n.pitch);
    const minP = Math.min(...pitches) - 2;
    const maxP = Math.max(...pitches) + 2;
    const pitchSpan = Math.max(12, maxP - minP);

    const colors = INSTRUMENT_COLORS[track.instrument] || INSTRUMENT_COLORS.piano;

    for (const note of track.notes) {
      const startX = (note.startTick / totalTicks) * width;
      const noteW = Math.max(3, (note.durationTicks / totalTicks) * width - 1);

      // Y position (higher pitch = higher up)
      const pitchNorm = (note.pitch - minP) / pitchSpan;
      const noteY = height - (pitchNorm * (height - 14)) - 10;
      const noteH = Math.max(4, Math.min(8, height / pitchSpan));

      const velAlpha = Math.max(0.4, (note.velocity || 70) / 127);

      ctx.fillStyle = colors.primary;
      ctx.globalAlpha = velAlpha;
      ctx.beginPath();
      ctx.roundRect(startX, noteY, noteW, noteH, 2);
      ctx.fill();

      // Subtle top highlight
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = velAlpha * 0.5;
      ctx.fillRect(startX, noteY, noteW, 1);
    }

    ctx.globalAlpha = 1.0;
  }

  /**
   * Updates playhead position based on current tick progress (0.0 to 1.0)
   */
  updatePlayhead(progressNorm) {
    if (!this.playheadEl || !this.viewportEl) return;
    const tracksWidth = this.viewportEl.clientWidth - this.sidebarWidth;
    const xPos = this.sidebarWidth + (progressNorm * tracksWidth);
    this.playheadEl.style.transform = `translateX(${xPos}px)`;
  }
}
