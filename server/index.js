// server/index.js
// Local Studio Server & WebSocket Hub for Kawai CA-701 to Antigravity

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { projectStore } from './project-store.js';
import { analyzePerformance } from './analyzer.js';
import { arrangeFromPerformance } from './auto-arranger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const sessionDir = path.join(__dirname, '..', 'session');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(publicDir));

let activeClients = new Set();
let kawaiConnected = false;
let playbackState = { isPlaying: false, currentBar: 1, currentTick: 0 };

// Broadcast helper
function broadcast(type, payload = {}) {
  const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
  for (const client of activeClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on('connection', (ws, req) => {
  activeClients.add(ws);
  const ua = req.headers['user-agent'] || 'Unknown UA';
  console.log(`[Studio WS] Client connected (Total: ${activeClients.size}) - UA: ${ua}`);

  // Send initial state to newly connected client
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    payload: {
      project: projectStore.getProject(),
      kawaiConnected,
      playbackState
    }
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      console.log(`[Studio WS Inbound] ${msg.type}`, msg.payload || '');
      handleClientMessage(msg, ws);
    } catch (err) {
      console.error('[Studio WS] Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    activeClients.delete(ws);
    console.log(`[Studio WS] Client disconnected (Remaining: ${activeClients.size})`);
  });
});

app.post('/api/log', (req, res) => {
  console.log('[Browser Client Log]', req.body);
  res.json({ status: 'ok' });
});

function handleClientMessage(msg, senderWs) {
  switch (msg.type) {
    case 'KAWAI_STATUS':
      kawaiConnected = Boolean(msg.payload.connected);
      console.log(`[Studio] Kawai CA-701 status: ${kawaiConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
      broadcast('KAWAI_STATUS', { connected: kawaiConnected, device: msg.payload.device });
      break;

    case 'PLAYBACK_STATUS':
      playbackState = { ...playbackState, ...msg.payload };
      broadcast('PLAYBACK_STATUS', playbackState);
      break;

    case 'RECORDING_FINISHED':
      console.log(`[Studio] Received recorded performance with ${msg.payload.notes?.length || 0} notes`);
      savePerformance(msg.payload);
      broadcast('PROJECT_UPDATED', { project: projectStore.getProject() });
      break;
  }
}

function savePerformance(perfData) {
  const perfFile = path.join(sessionDir, 'performance.json');
  fs.writeFileSync(perfFile, JSON.stringify(perfData, null, 2));
  projectStore.setPerformance(perfData);
}

// REST API
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    connectedClients: activeClients.size,
    kawaiConnected,
    playbackState,
    totalBars: projectStore.getProject().totalBars,
    bpm: projectStore.getProject().bpm
  });
});

app.get('/api/project', (req, res) => {
  res.json(projectStore.getProject());
});

let latestUserPrompt = null;

app.post('/api/prompt', (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt string required' });
  }
  latestUserPrompt = {
    prompt: prompt.trim(),
    timestamp: Date.now(),
    iso: new Date().toISOString()
  };
  const promptFile = path.join(sessionDir, 'latest_prompt.json');
  fs.writeFileSync(promptFile, JSON.stringify(latestUserPrompt, null, 2));
  console.log(`[Studio] New Prompt from user: "${latestUserPrompt.prompt}"`);
  broadcast('NEW_PROMPT', latestUserPrompt);
  res.json({ status: 'ok', prompt: latestUserPrompt });
});

app.get('/api/prompt', (req, res) => {
  const promptFile = path.join(sessionDir, 'latest_prompt.json');
  if (fs.existsSync(promptFile)) {
    try {
      latestUserPrompt = JSON.parse(fs.readFileSync(promptFile, 'utf8'));
    } catch {}
  }
  res.json({ latestPrompt: latestUserPrompt });
});

app.post('/api/arrange', (req, res) => {
  const { prompt } = req.body || {};
  const promptStr = (typeof prompt === 'string' && prompt.trim()) ? prompt.trim() : (latestUserPrompt?.prompt || 'Orchestral arrangement');

  // Save prompt
  latestUserPrompt = {
    prompt: promptStr,
    timestamp: Date.now(),
    iso: new Date().toISOString()
  };
  fs.writeFileSync(path.join(sessionDir, 'latest_prompt.json'), JSON.stringify(latestUserPrompt, null, 2));
  broadcast('NEW_PROMPT', latestUserPrompt);

  // Get performance
  let perfData = null;
  const perfFile = path.join(sessionDir, 'performance.json');
  const demoFile = path.join(sessionDir, 'demo_performance.json');
  if (fs.existsSync(perfFile)) {
    perfData = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
  } else if (fs.existsSync(demoFile)) {
    perfData = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
  }

  if (!perfData) {
    return res.status(400).json({ error: 'No performance recorded to arrange. Play some notes first!' });
  }

  // Generate arrangement
  const { tracks, reason, detectedKey } = arrangeFromPerformance(perfData, promptStr);
  projectStore.setArrangementTracks(tracks, reason);
  const updatedProject = projectStore.getProject();

  // Broadcast update and auto-play
  broadcast('PROJECT_UPDATED', { project: updatedProject });
  broadcast('PLAY', { fromBar: 1, loop: true });

  console.log(`[Studio Arranger] Transformed into ${tracks.length} tracks (${detectedKey}) for prompt: "${promptStr}"`);
  res.json({
    status: 'ok',
    reason,
    detectedKey,
    tracksCount: tracks.length,
    project: updatedProject
  });
});

app.get('/api/performance', (req, res) => {
  const perfFile = path.join(sessionDir, 'performance.json');
  let perfData = null;
  if (fs.existsSync(perfFile)) {
    perfData = JSON.parse(fs.readFileSync(perfFile, 'utf8'));
  } else {
    const demoFile = path.join(sessionDir, 'demo_performance.json');
    if (fs.existsSync(demoFile)) {
      perfData = JSON.parse(fs.readFileSync(demoFile, 'utf8'));
    }
  }

  if (!perfData) {
    return res.status(404).json({ error: 'No performance recorded yet.' });
  }

  const analysis = analyzePerformance(perfData);
  res.json({
    performance: perfData,
    analysis
  });
});

app.post('/api/performance', (req, res) => {
  const perfData = req.body;
  if (!perfData || !Array.isArray(perfData.notes)) {
    return res.status(400).json({ error: 'Invalid performance payload' });
  }
  savePerformance(perfData);
  broadcast('PROJECT_UPDATED', { project: projectStore.getProject() });
  res.json({ status: 'saved', noteCount: perfData.notes.length });
});

app.post('/api/project/tracks', (req, res) => {
  const { tracks, reason } = req.body;
  if (!Array.isArray(tracks)) {
    return res.status(400).json({ error: 'tracks array required' });
  }
  const updatedProject = projectStore.setArrangementTracks(tracks, reason);
  broadcast('PROJECT_UPDATED', { project: updatedProject });
  res.json({ status: 'ok', project: updatedProject });
});

app.patch('/api/project/tracks/:id', (req, res) => {
  try {
    const track = projectStore.updateTrack(req.params.id, req.body || {}, req.body?.reason || 'Modify track');
    broadcast('PROJECT_UPDATED', { project: projectStore.getProject() });
    res.json({ status: 'ok', track });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/project/tracks/:id', (req, res) => {
  try {
    const updated = projectStore.removeTrack(req.params.id, req.body?.reason || 'Remove track');
    broadcast('PROJECT_UPDATED', { project: updated });
    res.json({ status: 'ok', project: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/playback/play', (req, res) => {
  const { fromBar = 1, loop = false } = req.body || {};
  broadcast('PLAY', { fromBar, loop });
  playbackState.isPlaying = true;
  playbackState.currentBar = fromBar;
  res.json({ status: 'playing', fromBar, loop });
});

app.post('/api/playback/stop', (req, res) => {
  broadcast('STOP');
  playbackState.isPlaying = false;
  res.json({ status: 'stopped' });
});

app.post('/api/playback/seek', (req, res) => {
  const { bar = 1 } = req.body || {};
  broadcast('SEEK', { bar });
  playbackState.currentBar = bar;
  res.json({ status: 'seeked', bar });
});

app.post('/api/playback/solo_preview', (req, res) => {
  const { instrument = 'upright_bass', barCount = 2 } = req.body || {};
  broadcast('SOLO_PREVIEW', { instrument, barCount });
  res.json({ status: 'previewing', instrument, barCount });
});

app.post('/api/project/snapshot', (req, res) => {
  const { name } = req.body || {};
  const snapshot = projectStore.createSnapshot(name);
  broadcast('PROJECT_UPDATED', { project: projectStore.getProject() });
  res.json({ status: 'ok', snapshot });
});

app.post('/api/project/restore/:id', (req, res) => {
  try {
    const updated = projectStore.restoreSnapshot(req.params.id);
    broadcast('PROJECT_UPDATED', { project: updated });
    res.json({ status: 'ok', project: updated });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/project/undo', (req, res) => {
  const result = projectStore.undo();
  if (!result) return res.status(400).json({ error: 'Nothing to undo' });
  broadcast('PROJECT_UPDATED', { project: result.project });
  res.json({ status: 'ok', undone: result.undone });
});

app.post('/api/project/redo', (req, res) => {
  const result = projectStore.redo();
  if (!result) return res.status(400).json({ error: 'Nothing to redo' });
  broadcast('PROJECT_UPDATED', { project: result.project });
  res.json({ status: 'ok', redone: result.redone });
});

const PORT = process.env.PORT || 4321;
server.listen(PORT, () => {
  console.log(`[Studio Server] Running at http://localhost:${PORT}`);
});
