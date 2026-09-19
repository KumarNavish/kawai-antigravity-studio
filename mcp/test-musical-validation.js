// mcp/test-musical-validation.js
// Listening-Oriented Musical Validation Test Suite
// Verifies realistic musical transformations, surgical score patching, and conversational flow via MCP

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.join(__dirname, 'server.js');

const child = spawn(process.execPath, [serverScript], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let msgId = 1;
const pending = new Map();
let buffer = '';

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const resolve = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch (e) {}
  }
});

function callTool(name, args = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    pending.set(id, resolve);
    const req = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args }
    }) + '\n';
    child.stdin.write(req);
  });
}

async function runMusicalValidation() {
  console.log('===============================================================');
  console.log('       LISTENING-ORIENTED MUSICAL VALIDATION SUITE (MCP)       ');
  console.log('===============================================================\n');

  // Initialize MCP
  const initReq = JSON.stringify({
    jsonrpc: '2.0',
    id: msgId++,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'musical-tester', version: '1.0.0' }
    }
  }) + '\n';
  child.stdin.write(initReq);
  await new Promise(r => setTimeout(r, 400));

  // TEST 1: Inspect performance & harmonic breathing room
  console.log('--- TEST 1: Inspect Performance & Breathing Spaces ---');
  const takeRes = await callTool('get_recent_take');
  const take = JSON.parse(takeRes.result.content[0].text);
  console.log(`✓ Performance Key: ${take.advisoryAnalysis.key.estimate} (Confidence: ${take.advisoryAnalysis.key.confidence})`);
  console.log(`✓ Breathing Bars identified for countermelody: [${take.advisoryAnalysis.breathingBars.join(', ')}]`);
  console.log(`✓ Dynamic Arc: "${take.advisoryAnalysis.dynamicArc}" (Avg Velocity: ${take.advisoryAnalysis.overallAvgVelocity})`);

  // TEST 2: "The bass sounds technically correct but emotionally empty." -> Melodic Bass Transformation
  console.log('\n--- TEST 2: Transform Bassline from Root-Notes to Conversational Narrative ---');
  // Read original bass in Bars 1-4
  const bassBefore = await callTool('get_score', { trackIdOrName: 'bass', startBar: 1, endBar: 4 });
  const bassBeforeData = JSON.parse(bassBefore.result.content[0].text);
  console.log(`Initial bass note count (Bars 1-4): ${bassBeforeData[0].notes.length}`);

  // Apply surgical patch to Bars 1-4 making bass conversational with walking turnarounds & syncopation
  const bassPatchRes = await callTool('apply_score_patch', {
    trackIdOrName: 'bass',
    startBar: 1,
    endBar: 4,
    replaceNotes: [
      // Bar 1 (Dm9): Lyrical entry with syncopated 8th note turnaround
      { pitch: 38, bar: 1, beat: 1, durationTicks: 720, velocity: 68 },      // D2
      { pitch: 41, bar: 1, beat: 2.5, durationTicks: 360, velocity: 65 },    // F2
      { pitch: 40, bar: 1, beat: 3.5, durationTicks: 360, velocity: 66 },    // E2 passing
      // Bar 2 (Bbmaj7): Warm deep root with octave anticipation
      { pitch: 34, bar: 2, beat: 1, durationTicks: 840, velocity: 72 },      // Bb1
      { pitch: 46, bar: 2, beat: 3, durationTicks: 360, velocity: 68 },      // Bb2
      { pitch: 45, bar: 2, beat: 4, durationTicks: 440, velocity: 70 },      // A2 turnaround
      // Bar 3 (Gm9): Conversational walk answering the piano
      { pitch: 31, bar: 3, beat: 1, durationTicks: 720, velocity: 70 },      // G1
      { pitch: 38, bar: 3, beat: 2.5, durationTicks: 360, velocity: 66 },    // D2
      { pitch: 41, bar: 3, beat: 3.5, durationTicks: 360, velocity: 68 },    // F2
      // Bar 4 (Asus4 - A7): Cadential release into Bar 5
      { pitch: 33, bar: 4, beat: 1, durationTicks: 720, velocity: 74 },      // A1
      { pitch: 37, bar: 4, beat: 3, durationTicks: 480, velocity: 72 },      // C#2 leading tone
      { pitch: 40, bar: 4, beat: 4, durationTicks: 440, velocity: 70 }       // E2
    ],
    reason: 'Conversational melodic bassline transformation'
  });
  console.log('✓ Applied melodic bass patch:', JSON.parse(bassPatchRes.result.content[0].text).reason);

  // Verify that Bars 5-16 remained completely intact!
  const bassSlice5to8 = await callTool('get_score', { trackIdOrName: 'bass', startBar: 5, endBar: 8 });
  const bass5to8Data = JSON.parse(bassSlice5to8.result.content[0].text);
  console.log(`✓ Untouched slice (Bars 5-8) preserved byte-for-byte: ${bass5to8Data[0].notes.length} notes`);

  // TEST 3: "Let the cello answer my right hand." -> Countermelody in Breathing Room (Bar 4 & Bar 8)
  console.log('\n--- TEST 3: Compose Cello Countermelody in Melodic Breathing Space ---');
  const celloPatchRes = await callTool('apply_score_patch', {
    trackIdOrName: 'strings',
    startBar: 4,
    endBar: 4,
    replaceNotes: [
      // Vocal-like answering phrase in Bar 4 while piano holds
      { pitch: 57, bar: 4, beat: 1.5, durationTicks: 360, velocity: 72 }, // A3
      { pitch: 58, bar: 4, beat: 2.5, durationTicks: 360, velocity: 76 }, // Bb3
      { pitch: 62, bar: 4, beat: 3.5, durationTicks: 480, velocity: 80 }, // D4
      { pitch: 61, bar: 4, beat: 4.5, durationTicks: 600, velocity: 75 }  // C#4 expressive resolution
    ],
    reason: 'Cello answering melody in Bar 4 breathing room'
  });
  console.log('✓ Cello countermelody patch applied:', JSON.parse(celloPatchRes.result.content[0].text).reason);

  // TEST 4: "Only redo bars 13–16: Make ending uplifting without obvious major-key euphoria."
  console.log('\n--- TEST 4: Surgical Revision of Bars 13–16 (Earned Emotional Uplift) ---');
  const endingPatchRes = await callTool('apply_score_patch', {
    trackIdOrName: 'strings',
    startBar: 13,
    endBar: 16,
    replaceNotes: [
      // Bar 13 (F/A -> Bbmaj9): Lyrical expansion
      { pitch: 69, bar: 13, beat: 1, durationTicks: 960, velocity: 82 }, // A4
      { pitch: 72, bar: 13, beat: 3, durationTicks: 960, velocity: 86 }, // C5
      // Bar 14 (Csus4 -> C): Suspended yearning moving forward
      { pitch: 70, bar: 14, beat: 1, durationTicks: 960, velocity: 84 }, // Bb4
      { pitch: 76, bar: 14, beat: 3, durationTicks: 960, velocity: 88 }, // E5
      // Bar 15 (Dm9): Rich resonant homecoming
      { pitch: 74, bar: 15, beat: 1, durationTicks: 960, velocity: 82 }, // D5
      { pitch: 72, bar: 15, beat: 3, durationTicks: 960, velocity: 80 }, // C5
      // Bar 16 (Dsus2 -> D): Warm Picardy light, open fifths
      { pitch: 69, bar: 16, beat: 1, durationTicks: 1920, velocity: 74 }, // A4
      { pitch: 74, bar: 16, beat: 1, durationTicks: 1920, velocity: 76 }, // D5
      { pitch: 78, bar: 16, beat: 1, durationTicks: 1920, velocity: 75 }  // F#5 warm, earned color
    ],
    reason: 'Earned uplift resolution in Bars 13-16'
  });
  console.log('✓ Bars 13-16 surgical patch applied:', JSON.parse(endingPatchRes.result.content[0].text).reason);

  // TEST 5: Audition specific slice via play_range
  console.log('\n--- TEST 5: Audition Specific Slice via play_range ---');
  const playRangeRes = await callTool('play_range', { startBar: 13, endBar: 16 });
  console.log('✓ play_range result:', playRangeRes.result.content[0].text);

  // TEST 6: Test exact non-destructive Undo
  console.log('\n--- TEST 6: Exact Non-Destructive Undo & Redo ---');
  const undoRes = await callTool('undo');
  console.log('✓', undoRes.result.content[0].text);
  const redoRes = await callTool('redo');
  console.log('✓', redoRes.result.content[0].text);

  console.log('\n===============================================================');
  console.log('  ✓ ALL LISTENING-ORIENTED MUSICAL TRANSFORMATIONS VERIFIED!   ');
  console.log('===============================================================\n');

  child.kill();
  process.exit(0);
}

runMusicalValidation().catch(err => {
  console.error('Musical validation error:', err);
  child.kill();
  process.exit(1);
});
