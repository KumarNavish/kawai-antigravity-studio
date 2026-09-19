#!/usr/bin/env node
// studio-cli.mjs
// Antigravity Command Line Tool to Observe, Arrange, and Control the Studio

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 4321;
const BASE_URL = `http://localhost:${PORT}/api`;

async function fetchJson(endpoint, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API Error (${res.status}): ${errText}`);
    }
    return await res.json();
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error(`\n[!] Studio server not responding at http://localhost:${PORT}.`);
      console.error(`    Run 'npm start' to start the studio.\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function inspect() {
  const data = await fetchJson('/performance');
  const { performance, analysis } = data;

  console.log('\n======================================================');
  console.log('   KAWAI CA-701 PERFORMANCE INSPECTION FOR ANTIGRAVITY');
  console.log('======================================================\n');
  console.log(`Title:              ${performance.title || 'Untitled Performance'}`);
  console.log(`Key & Scale:        ${analysis.key.name} (Tonic: ${analysis.key.tonic}, confidence: ${(analysis.key.correlation * 100).toFixed(1)}%)`);
  console.log(`Tempo & Meter:      ${analysis.bpm} BPM | ${analysis.timeSignature.join('/')} | ${analysis.totalBars} Bars`);
  console.log(`Dynamic Profile:    ${analysis.dynamicArc} (Avg Velocity: ${analysis.overallAvgVelocity})`);
  console.log(`Pitch Range:        ${analysis.range.lowestNote} (${analysis.range.minPitch}) to ${analysis.range.highestNote} (${analysis.range.maxPitch})`);
  console.log(`Pedal Activity:     ${analysis.pedalCount} damper/soft pedal events`);
  console.log(`Note Count:         ${analysis.noteCount} notes recorded from Kawai\n`);

  console.log('--- HARMONIC & SECTIONAL TIMELINE ---');
  for (const b of analysis.bars) {
    const barStr = `Bar ${b.barNumber.toString().padStart(2)}:`;
    const chordStr = `[${b.chord.padEnd(20)}]`;
    const bassStr = `Bass: ${b.bassNote.padEnd(4)}`;
    const melStr = `Melody Peak: ${b.melodyPeak.padEnd(4)}`;
    const velStr = `Vel: ${b.dynamics.avg.toString().padStart(3)}`;
    const spaceStr = b.hasSpace ? '• Space available for counterpoint' : '';
    console.log(`  ${barStr} ${chordStr} | ${bassStr} | ${melStr} | ${velStr} ${spaceStr}`);
  }

  if (analysis.motifs && analysis.motifs.length > 0) {
    console.log('\n--- IDENTIFIED MOTIFS ---');
    for (const m of analysis.motifs) {
      console.log(`  * ${m.name} (First heard Bar ${m.firstBar}, returns Bar ${m.secondBar})`);
    }
  }

  const proj = await fetchJson('/project');
  console.log('\n--- ACTIVE PROJECT TRACKS ---');
  for (const t of proj.tracks) {
    const anchorTag = t.isAnchor ? ' [ANCHOR - Kawai Performance]' : '';
    console.log(`  * ${t.name.padEnd(24)} (${t.instrument}) - ${t.notes.length} notes | Vol: ${t.volume.toFixed(2)}${anchorTag}`);
  }
  console.log('');
}

async function arrange(args) {
  let tracks = null;
  let reason = 'Arrangement update';

  const fileIdx = args.indexOf('--file');
  const jsonIdx = args.indexOf('--json');
  const reasonIdx = args.indexOf('--reason');

  if (reasonIdx !== -1 && args[reasonIdx + 1]) {
    reason = args[reasonIdx + 1];
  }

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = path.resolve(process.cwd(), args[fileIdx + 1]);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    tracks = Array.isArray(parsed) ? parsed : (parsed.tracks || []);
  } else if (jsonIdx !== -1 && args[jsonIdx + 1]) {
    const parsed = JSON.parse(args[jsonIdx + 1]);
    tracks = Array.isArray(parsed) ? parsed : (parsed.tracks || []);
  } else {
    console.error('Error: specify --file <path> or --json \'<json>\'');
    process.exit(1);
  }

  const res = await fetchJson('/project/tracks', {
    method: 'POST',
    body: JSON.stringify({ tracks, reason })
  });

  console.log(`\n✓ Successfully applied arrangement (${res.project.tracks.length} tracks active)`);
  for (const t of res.project.tracks) {
    const anchorStr = t.isAnchor ? ' [Anchor - Preserved]' : '';
    console.log(`  - ${t.name} (${t.instrument}): ${t.notes.length} notes${anchorStr}`);
  }
  console.log('');
}

async function updateTrack(args) {
  const trackIdx = args.indexOf('--track');
  if (trackIdx === -1 || !args[trackIdx + 1]) {
    console.error('Error: specify --track <nameOrId>');
    process.exit(1);
  }
  const trackId = args[trackIdx + 1];

  let patch = {};
  const fileIdx = args.indexOf('--file');
  const jsonIdx = args.indexOf('--json');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    patch = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), args[fileIdx + 1]), 'utf8'));
  } else if (jsonIdx !== -1 && args[jsonIdx + 1]) {
    patch = JSON.parse(args[jsonIdx + 1]);
  }

  const res = await fetchJson(`/project/tracks/${encodeURIComponent(trackId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  console.log(`\n✓ Updated track: ${res.track.name} (${res.track.notes.length} notes)\n`);
}

async function removeTrack(args) {
  const trackIdx = args.indexOf('--track');
  if (trackIdx === -1 || !args[trackIdx + 1]) {
    console.error('Error: specify --track <nameOrId>');
    process.exit(1);
  }
  const trackId = args[trackIdx + 1];

  const res = await fetchJson(`/project/tracks/${encodeURIComponent(trackId)}`, {
    method: 'DELETE'
  });
  console.log(`\n✓ Removed track matching "${trackId}". Active tracks: ${res.project.tracks.length}\n`);
}

async function play(args) {
  let fromBar = 1;
  let loop = false;
  const barIdx = args.indexOf('--bar');
  if (barIdx !== -1 && args[barIdx + 1]) fromBar = parseInt(args[barIdx + 1], 10);
  if (args.includes('--loop')) loop = true;

  await fetchJson('/playback/play', {
    method: 'POST',
    body: JSON.stringify({ fromBar, loop })
  });
  console.log(`\n▶ Playback started from Bar ${fromBar}${loop ? ' (Looping)' : ''} in browser studio.\n`);
}

async function stop() {
  await fetchJson('/playback/stop', { method: 'POST' });
  console.log('\n⏹ Playback stopped.\n');
}

async function seek(args) {
  const barIdx = args.indexOf('--bar');
  const bar = barIdx !== -1 && args[barIdx + 1] ? parseInt(args[barIdx + 1], 10) : 1;
  await fetchJson('/playback/seek', {
    method: 'POST',
    body: JSON.stringify({ bar })
  });
  console.log(`\n⏩ Seeked to Bar ${bar}.\n`);
}

async function snapshot(args) {
  const nameIdx = args.indexOf('--name');
  const name = nameIdx !== -1 && args[nameIdx + 1] ? args[nameIdx + 1] : 'Snapshot';
  const res = await fetchJson('/project/snapshot', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  console.log(`\n✓ Created snapshot: "${res.snapshot.name}" (${res.snapshot.id})\n`);
}

async function undo() {
  const res = await fetchJson('/project/undo', { method: 'POST' });
  console.log(`\n↩ Undone: ${res.undone}\n`);
}

async function redo() {
  const res = await fetchJson('/project/redo', { method: 'POST' });
  console.log(`\n↪ Redone: ${res.redone}\n`);
}

async function status() {
  const s = await fetchJson('/status');
  console.log('\n--- STUDIO STATUS ---');
  console.log(`Server:            Online (Port ${PORT})`);
  console.log(`Connected Tabs:    ${s.connectedClients}`);
  console.log(`Kawai CA-701:      ${s.kawaiConnected ? 'CONNECTED' : 'NOT CONNECTED (Ready for Web MIDI)'}`);
  console.log(`Playback:          ${s.playbackState.isPlaying ? `PLAYING (Bar ${s.playbackState.currentBar})` : 'STOPPED'}`);
  console.log(`BPM / Bars:        ${s.bpm} BPM / ${s.totalBars} Bars\n`);
}

// CLI Dispatcher
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'inspect':
    await inspect();
    break;
  case 'arrange':
    await arrange(args);
    break;
  case 'update-track':
    await updateTrack(args);
    break;
  case 'remove-track':
    await removeTrack(args);
    break;
  case 'play':
    await play(args);
    break;
  case 'stop':
    await stop();
    break;
  case 'seek':
    await seek(args);
    break;
  case 'snapshot':
    await snapshot(args);
    break;
  case 'undo':
    await undo();
    break;
  case 'redo':
    await redo();
    break;
  case 'status':
    await status();
    break;
  default:
    console.log(`
Kawai CA-701 to Antigravity Studio CLI

Commands:
  node studio-cli.mjs inspect                     Inspect latest performance & harmonic analysis
  node studio-cli.mjs arrange --file <path>       Apply arranged multi-tracks
  node studio-cli.mjs update-track --track <id>   Update specific track notes or params
  node studio-cli.mjs remove-track --track <id>   Remove a track (e.g. 'strings')
  node studio-cli.mjs play [--bar <n>] [--loop]   Start playback in browser studio
  node studio-cli.mjs stop                        Stop playback
  node studio-cli.mjs seek --bar <n>              Seek to specific bar
  node studio-cli.mjs snapshot --name "<desc>"    Save checkpoint
  node studio-cli.mjs undo                        Undo last arrangement change
  node studio-cli.mjs redo                        Redo
  node studio-cli.mjs status                      Check connection & playback state
`);
}
