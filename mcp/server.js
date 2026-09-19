#!/usr/bin/env node
// mcp/server.js
// Workspace-Local Model Context Protocol (MCP) Server for Kawai CA-701 Music Studio

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { projectStore, KAWAI_INSTRUMENT_MAP } from '../server/project-store.js';
import { analyzePerformance, midiToNoteName } from '../server/analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDir = path.join(__dirname, '..', 'session');
const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}/api`;

// Ensure local studio server is running in the background
async function ensureStudioServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/api/status`, (res) => {
      resolve(true);
    });
    req.on('error', () => {
      // Server not running, spawn it in background
      try {
        const serverScript = path.join(__dirname, '..', 'server', 'index.js');
        const child = spawn(process.execPath, [serverScript], {
          detached: true,
          stdio: 'ignore',
          cwd: path.join(__dirname, '..')
        });
        child.unref();
        setTimeout(() => resolve(true), 800);
      } catch (err) {
        console.error('[MCP] Could not auto-spawn studio server:', err);
        resolve(false);
      }
    });
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function notifyServer(endpoint, payload = {}) {
  await ensureStudioServerRunning();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    // If HTTP fails, local state is still persisted directly in projectStore
    return { error: err.message };
  }
}

function getPerformanceData() {
  const perfFile = path.join(sessionDir, 'performance.json');
  if (fs.existsSync(perfFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
      if (data && Array.isArray(data.notes) && data.notes.length > 0) {
        return data;
      }
    } catch {}
  }
  const demoFile = path.join(sessionDir, 'demo_performance.json');
  if (fs.existsSync(demoFile)) {
    try {
      return JSON.parse(fs.readFileSync(demoFile, 'utf8'));
    } catch {}
  }
  return null;
}

// Initialize MCP Server
const server = new McpServer({
  name: 'kawai-studio',
  version: '2.0.0'
});

// 1. studio_status
server.tool(
  'studio_status',
  'Checks studio health, connected Kawai CA-701 device, browser tabs, playback state, and active rendering mode.',
  {},
  async () => {
    await ensureStudioServerRunning();
    let apiStatus = { connectedClients: 0, kawaiConnected: false, playbackState: { isPlaying: false } };
    try {
      const res = await fetch(`${BASE_URL}/status`);
      if (res.ok) apiStatus = await res.json();
    } catch {}

    const project = projectStore.getProject();
    const anchor = project.tracks.find(t => t.isAnchor);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'online',
          port: PORT,
          connectedBrowserTabs: apiStatus.connectedClients,
          kawaiCA701Connected: apiStatus.kawaiConnected,
          renderingMode: project.renderingMode,
          playback: apiStatus.playbackState,
          song: {
            title: project.title,
            bpm: project.bpm,
            totalBars: project.totalBars,
            tracksCount: project.tracks.length,
            pianoAnchorNotes: anchor ? anchor.notes.length : 0
          }
        }, null, 2)
      }]
    };
  }
);

// 2. get_recent_take
server.tool(
  'get_recent_take',
  'Returns the latest Kawai CA-701 performance take with raw timing data, note count, velocity stats, pedal usage, measured jitter, user prompt, and advisory analysis.',
  {},
  async () => {
    const perf = getPerformanceData();
    if (!perf) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No performance recorded yet.' }) }] };
    }
    const analysis = analyzePerformance(perf);
    const promptFile = path.join(sessionDir, 'latest_prompt.json');
    let promptInfo = null;
    if (fs.existsSync(promptFile)) {
      try { promptInfo = JSON.parse(fs.readFileSync(promptFile, 'utf8')); } catch {}
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          performanceId: perf.id,
          title: perf.title,
          bpm: perf.bpm,
          timeSignature: perf.timeSignature,
          totalBars: analysis.totalBars,
          noteCount: perf.notes.length,
          pedalCount: perf.pedals.length,
          userPrompt: promptInfo?.prompt || null,
          timingTelemetry: {
            measuredJitterStats: perf.timingJitterStats || { note: 'Direct USB-MIDI stream' },
            rawTimestampSample: perf.notes[0]?.rawTimeMs != null ? `${perf.notes[0].rawTimeMs}ms` : 'Recorded'
          },
          advisoryAnalysis: {
            key: analysis.key,
            dynamicArc: analysis.dynamicArc,
            overallAvgVelocity: analysis.overallAvgVelocity,
            range: analysis.range,
            breathingBars: analysis.breathingBars,
            motifs: analysis.motifs
          }
        }, null, 2)
      }]
    };
  }
);

// 3. get_project_summary
server.tool(
  'get_project_summary',
  'Returns high-level musical overview of the active project (BPM, meter, key estimate, sections, track list, and mix).',
  {},
  async () => {
    const proj = projectStore.getProject();
    const perf = getPerformanceData();
    const analysis = perf ? analyzePerformance(perf) : null;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: proj.title,
          bpm: proj.bpm,
          meter: `${proj.timeSignature[0]}/${proj.timeSignature[1]}`,
          totalBars: proj.totalBars,
          renderingMode: proj.renderingMode,
          keyEstimate: analysis ? analysis.key.estimate : 'Unknown',
          keyConfidence: analysis ? analysis.key.confidence : null,
          sections: proj.sections,
          tracks: proj.tracks.map(t => ({
            id: t.id,
            name: t.name,
            instrument: t.instrument,
            isAnchor: t.isAnchor,
            notesCount: t.notes.length,
            volume: t.volume,
            pan: t.pan,
            muted: t.muted,
            solo: t.solo
          }))
        }, null, 2)
      }]
    };
  }
);

// 4. get_tracks
server.tool(
  'get_tracks',
  'Returns detailed descriptors of all tracks in the active project.',
  {},
  async () => {
    const proj = projectStore.getProject();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(proj.tracks.map(t => {
          const pitches = t.notes.map(n => n.pitch);
          return {
            id: t.id,
            name: t.name,
            instrument: t.instrument,
            isAnchor: t.isAnchor,
            midiChannel: t.midiChannel,
            programChange: t.programChange,
            volume: t.volume,
            pan: t.pan,
            muted: t.muted,
            solo: t.solo,
            noteCount: t.notes.length,
            pitchRange: pitches.length ? `${midiToNoteName(Math.min(...pitches))} to ${midiToNoteName(Math.max(...pitches))}` : 'None'
          };
        }), null, 2)
      }]
    };
  }
);

// 5. get_score
server.tool(
  'get_score',
  'Returns compact, readable score representation of notes in a given range or track (pitches, musical coordinates: bar, beat, tickOffset, duration, velocity).',
  {
    trackIdOrName: z.string().optional().describe('Filter by track name or ID (e.g. "bass", "strings", "piano").'),
    startBar: z.number().int().min(1).optional().describe('Starting bar (1-indexed).'),
    endBar: z.number().int().min(1).optional().describe('Ending bar inclusive.')
  },
  async ({ trackIdOrName, startBar, endBar }) => {
    const range = (startBar != null || endBar != null) ? { startBar, endBar } : undefined;
    const score = projectStore.getScore({ trackIdOrName, range });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(score, null, 2)
      }]
    };
  }
);

// 6. get_harmony
server.tool(
  'get_harmony',
  'Returns bar-by-bar harmonic advisory: estimated chord, confidence, tension score, plausible alternatives, and notes present.',
  {
    startBar: z.number().int().min(1).optional().describe('Start bar (default 1)'),
    endBar: z.number().int().min(1).optional().describe('End bar (default all bars)')
  },
  async ({ startBar = 1, endBar }) => {
    const perf = getPerformanceData();
    if (!perf) return { content: [{ type: 'text', text: 'No performance available.' }] };

    const analysis = analyzePerformance(perf);
    const lastBar = endBar || analysis.totalBars;
    const barsSlice = analysis.bars.filter(b => b.barNumber >= startBar && b.barNumber <= lastBar);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          keyEstimate: analysis.key,
          bars: barsSlice.map(b => ({
            bar: b.barNumber,
            harmony: b.harmony,
            bassNote: b.bassNote,
            melodyPeak: b.melodyPeak,
            hasBreathingRoom: b.hasBreathingRoom,
            advisoryNotes: b.advisoryNotes
          }))
        }, null, 2)
      }]
    };
  }
);

// 7. get_phrase_analysis
server.tool(
  'get_phrase_analysis',
  'Returns melodic motifs, phrasing contours, dynamic arc, and breathing bars available for countermelody.',
  {},
  async () => {
    const perf = getPerformanceData();
    if (!perf) return { content: [{ type: 'text', text: 'No performance available.' }] };

    const analysis = analyzePerformance(perf);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          dynamicArc: analysis.dynamicArc,
          overallAvgVelocity: analysis.overallAvgVelocity,
          range: analysis.range,
          breathingBars: analysis.breathingBars,
          motifs: analysis.motifs,
          totalBars: analysis.totalBars
        }, null, 2)
      }]
    };
  }
);

// 8. get_section
server.tool(
  'get_section',
  'Returns section markers, mood description, and note events for all tracks within the specified section.',
  {
    sectionNameOrIndex: z.union([z.string(), z.number()]).describe('Name of section (e.g. "Intro", "Suspense Build") or 1-based index.')
  },
  async ({ sectionNameOrIndex }) => {
    const proj = projectStore.getProject();
    let sec = null;
    if (typeof sectionNameOrIndex === 'number') {
      sec = proj.sections[sectionNameOrIndex - 1];
    } else {
      const q = sectionNameOrIndex.toLowerCase();
      sec = proj.sections.find(s => s.name.toLowerCase().includes(q));
    }

    if (!sec) throw new Error(`Section "${sectionNameOrIndex}" not found.`);

    const score = projectStore.getScore({ range: { startBar: sec.startBar, endBar: sec.endBar } });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          section: sec,
          tracksScore: score
        }, null, 2)
      }]
    };
  }
);

// 9. create_track
server.tool(
  'create_track',
  'Creates a new arranged track (e.g. upright_bass, cello, strings, acoustic_drums, flute, acoustic_guitar).',
  {
    name: z.string().describe('Track display name (e.g. "Acoustic Upright Bass")'),
    instrument: z.string().describe('Instrument sound type (e.g. "upright_bass", "cello", "strings", "acoustic_drums", "acoustic_guitar", "flute", "warm_pad")'),
    volume: z.number().min(0).max(1).optional().describe('Track volume (0.0 to 1.0, default 0.8)'),
    pan: z.number().min(-1).max(1).optional().describe('Pan (-1.0 left to 1.0 right, default 0)'),
    notes: z.array(z.object({
      pitch: z.number().int().min(0).max(127),
      startTick: z.number().int().min(0).optional(),
      bar: z.number().int().min(1).optional(),
      beat: z.number().min(1).optional(),
      durationTicks: z.number().int().min(1).optional(),
      velocity: z.number().int().min(1).max(127).optional()
    })).optional().describe('Initial notes array')
  },
  async ({ name, instrument, volume, pan, notes }) => {
    const newTrack = projectStore.createTrack({ name, instrument, volume, pan, notes });
    await notifyServer('/project/tracks', { tracks: projectStore.getProject().tracks, reason: `Create track ${name}` });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, track: newTrack }, null, 2)
      }]
    };
  }
);

// 10. delete_track
server.tool(
  'delete_track',
  'Deletes a non-anchor track (e.g. "strings", "drums", "cello"). The original Kawai piano anchor cannot be deleted.',
  {
    trackIdOrName: z.string().describe('Track name or ID to remove')
  },
  async ({ trackIdOrName }) => {
    const res = projectStore.deleteTrack(trackIdOrName);
    await notifyServer('/project/tracks', { tracks: projectStore.getProject().tracks, reason: `Delete track ${trackIdOrName}` });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(res, null, 2)
      }]
    };
  }
);

// 11. set_instrument
server.tool(
  'set_instrument',
  'Changes the instrument sound type and GM2 routing for a track.',
  {
    trackIdOrName: z.string().describe('Track name or ID'),
    instrument: z.string().describe('New instrument (e.g. "cello", "upright_bass", "strings", "acoustic_guitar", "flute", "warm_pad")')
  },
  async ({ trackIdOrName, instrument }) => {
    const track = projectStore.setInstrument(trackIdOrName, instrument);
    await notifyServer('/project/tracks', { tracks: projectStore.getProject().tracks, reason: `Change instrument to ${instrument}` });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, track: { id: track.id, name: track.name, instrument: track.instrument } }, null, 2)
      }]
    };
  }
);

// 12. apply_score_patch
server.tool(
  'apply_score_patch',
  'Surgically patches a track score slice (insert, replace within bar range, delete, alter velocity/duration). Preserves all notes outside the range untouched.',
  {
    trackIdOrName: z.string().describe('Track to patch (e.g. "bass", "strings", "drums")'),
    startBar: z.number().int().min(1).optional().describe('Slice start bar (inclusive)'),
    endBar: z.number().int().min(1).optional().describe('Slice end bar (inclusive)'),
    replaceNotes: z.array(z.object({
      pitch: z.number().int().min(0).max(127),
      bar: z.number().int().min(1).optional(),
      beat: z.number().min(1).optional(),
      startTick: z.number().int().min(0).optional(),
      durationTicks: z.number().int().min(1).optional(),
      velocity: z.number().int().min(1).max(127).optional()
    })).optional().describe('Replacement notes for the specified range'),
    insertNotes: z.array(z.object({
      pitch: z.number().int().min(0).max(127),
      bar: z.number().int().min(1).optional(),
      beat: z.number().min(1).optional(),
      startTick: z.number().int().min(0).optional(),
      durationTicks: z.number().int().min(1).optional(),
      velocity: z.number().int().min(1).max(127).optional()
    })).optional().describe('Notes to insert'),
    deleteNotes: z.union([z.boolean(), z.array(z.number().int())]).optional().describe('True to delete all notes in range, or array of MIDI pitches to remove'),
    alterVelocity: z.object({
      delta: z.number().optional().describe('Add/subtract velocity (e.g. +8 or -10)'),
      factor: z.number().optional().describe('Scale velocity by factor (e.g. 1.2 or 0.8)'),
      min: z.number().optional(),
      max: z.number().optional()
    }).optional(),
    alterDuration: z.object({
      deltaTicks: z.number().optional().describe('Add/subtract duration ticks'),
      factor: z.number().optional().describe('Scale duration by factor')
    }).optional(),
    volume: z.number().min(0).max(1).optional(),
    pan: z.number().min(-1).max(1).optional(),
    reason: z.string().optional().describe('Description of musical intent')
  },
  async ({ trackIdOrName, startBar, endBar, replaceNotes, insertNotes, deleteNotes, alterVelocity, alterDuration, volume, pan, reason }) => {
    const range = (startBar != null || endBar != null) ? { startBar, endBar } : undefined;
    const res = projectStore.applyScorePatch(trackIdOrName, {
      range,
      replaceNotes,
      insertNotes,
      deleteNotes,
      alterVelocity,
      alterDuration,
      volume,
      pan
    }, reason || 'Score patch');

    await notifyServer('/project/tracks', { tracks: projectStore.getProject().tracks, reason: reason || 'Score patch' });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(res, null, 2)
      }]
    };
  }
);

// 13. set_mix
server.tool(
  'set_mix',
  'Adjusts track or master mix parameters (volume, pan, mute, solo, master volume).',
  {
    trackIdOrName: z.string().optional().describe('Target track'),
    volume: z.number().min(0).max(1).optional(),
    pan: z.number().min(-1).max(1).optional(),
    muted: z.boolean().optional(),
    solo: z.boolean().optional(),
    masterVolume: z.number().min(0).max(1).optional()
  },
  async (args) => {
    const proj = projectStore.setMix(args);
    await notifyServer('/project/tracks', { tracks: proj.tracks, reason: 'Mix update' });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, masterVolume: proj.masterVolume, tracks: proj.tracks.map(t => ({ name: t.name, volume: t.volume, pan: t.pan, muted: t.muted, solo: t.solo })) }, null, 2)
      }]
    };
  }
);

// 14. set_automation
server.tool(
  'set_automation',
  'Applies dynamic/expression automation (e.g. tempo change or dynamic swell).',
  {
    bpm: z.number().min(40).max(240).optional(),
    renderingMode: z.enum(['piano_quality', 'kawai_multitimbral']).optional()
  },
  async ({ bpm, renderingMode }) => {
    if (bpm) projectStore.project.bpm = bpm;
    if (renderingMode) projectStore.setRenderingMode(renderingMode);
    projectStore.save();
    await notifyServer('/project/tracks', { tracks: projectStore.getProject().tracks, reason: 'Automation/mode update' });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, bpm: projectStore.project.bpm, renderingMode: projectStore.project.renderingMode }, null, 2)
      }]
    };
  }
);

// 15. play
server.tool(
  'play',
  'Starts real-time audio playback in the browser studio from a specified bar.',
  {
    fromBar: z.number().int().min(1).optional().describe('Bar to begin playback (default 1)'),
    loop: z.boolean().optional().describe('Whether to loop continuously')
  },
  async ({ fromBar = 1, loop = false }) => {
    await notifyServer('/playback/play', { fromBar, loop });
    return {
      content: [{
        type: 'text',
        text: `▶ Playback started from Bar ${fromBar}${loop ? ' (Looping)' : ''} in browser studio.`
      }]
    };
  }
);

// 16. play_range
server.tool(
  'play_range',
  'Auditions a specific slice/section of the song (e.g. Bars 9 to 12) so the user can immediately hear the modified passage.',
  {
    startBar: z.number().int().min(1).describe('Start bar of audition slice'),
    endBar: z.number().int().min(1).describe('End bar of audition slice'),
    loop: z.boolean().optional().describe('Loop audition slice')
  },
  async ({ startBar, endBar, loop = false }) => {
    await notifyServer('/playback/play', { fromBar: startBar, loop });
    return {
      content: [{
        type: 'text',
        text: `▶ Auditioning Bars ${startBar}–${endBar}${loop ? ' (Looping)' : ''} in browser studio.`
      }]
    };
  }
);

// 17. stop
server.tool(
  'stop',
  'Stops audio playback in the browser studio.',
  {},
  async () => {
    await notifyServer('/playback/stop');
    return {
      content: [{
        type: 'text',
        text: '⏹ Playback stopped.'
      }]
    };
  }
);

// 18. snapshot
server.tool(
  'snapshot',
  'Creates a named checkpoint/version snapshot of the current arrangement.',
  {
    name: z.string().describe('Description or title for the snapshot')
  },
  async ({ name }) => {
    const snap = projectStore.createSnapshot(name);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, snapshot: { id: snap.id, name: snap.name, timestamp: snap.timestamp } }, null, 2)
      }]
    };
  }
);

// 19. undo
server.tool(
  'undo',
  'Reverts the last musical or mix modification non-destructively.',
  {},
  async () => {
    const res = projectStore.undo();
    if (!res) return { content: [{ type: 'text', text: 'Nothing to undo.' }] };
    await notifyServer('/project/tracks', { tracks: res.project.tracks, reason: 'Undo' });
    return {
      content: [{
        type: 'text',
        text: `↩ Reverted: "${res.undone}". Current active tracks: ${res.project.tracks.length}`
      }]
    };
  }
);

// 20. redo
server.tool(
  'redo',
  'Re-applies the previously undone modification.',
  {},
  async () => {
    const res = projectStore.redo();
    if (!res) return { content: [{ type: 'text', text: 'Nothing to redo.' }] };
    await notifyServer('/project/tracks', { tracks: res.project.tracks, reason: 'Redo' });
    return {
      content: [{
        type: 'text',
        text: `↪ Re-applied: "${res.redone}". Current active tracks: ${res.project.tracks.length}`
      }]
    };
  }
);

// 21. render_preview
server.tool(
  'render_preview',
  'Returns the active score rendered as a timeline summary with dynamic levels and track balance.',
  {},
  async () => {
    const proj = projectStore.getProject();
    const summary = proj.tracks.map(t => ({
      name: t.name,
      instrument: t.instrument,
      volume: t.volume,
      notes: t.notes.length
    }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ project: proj.title, renderingMode: proj.renderingMode, tracks: summary }, null, 2)
      }]
    };
  }
);

// 22. open_studio
server.tool(
  'open_studio',
  'Opens or refocuses the browser studio UI at http://localhost:4321 on the Mac.',
  {},
  async () => {
    await ensureStudioServerRunning();
    spawn('open', ['http://localhost:4321'], { detached: true, stdio: 'ignore' });
    return {
      content: [{
        type: 'text',
        text: '✓ Browser studio opened at http://localhost:4321.'
      }]
    };
  }
);

// 23. render_solo_preview
server.tool(
  'render_solo_preview',
  'Triggers an isolated audition clip in the browser studio for critical listening of a specific instrument.',
  {
    instrument: z.enum(['upright_bass', 'acoustic_drums', 'cello', 'strings', 'acoustic_guitar', 'flute']).describe('Instrument to audition'),
    barCount: z.number().default(2).describe('Number of bars to audition')
  },
  async ({ instrument, barCount }) => {
    await ensureStudioServerRunning();
    await notifyServer('/playback/solo_preview', { instrument, barCount });
    return {
      content: [{
        type: 'text',
        text: `▶ Triggered isolated audition preview for ${instrument} (${barCount} bars) in browser studio.`
      }]
    };
  }
);

// Start Stdio Transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[kawai-studio MCP] Server running on stdio');
