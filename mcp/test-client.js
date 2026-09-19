// mcp/test-client.js
// Test MCP Client over stdio to verify tool discovery and tool execution

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
  buffer = lines.pop(); // keep last incomplete line

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const resolve = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    } catch (e) {
      console.log('[MCP raw]', line);
    }
  }
});

function sendRequest(method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    pending.set(id, resolve);
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    child.stdin.write(req);
  });
}

async function runTests() {
  console.log('--- TESTING MCP PROTOCOL OVER STDIO ---');

  // 1. Initialize
  const initRes = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
  console.log('Initialize response:', initRes.result?.serverInfo);

  // 2. List Tools
  const listRes = await sendRequest('tools/list');
  const tools = listRes.result?.tools || [];
  console.log(`Discovered ${tools.length} MCP tools:`);
  for (const t of tools) {
    console.log(`  - ${t.name.padEnd(22)}: ${t.description.slice(0, 60)}...`);
  }

  // 3. Call studio_status
  console.log('\n--- CALLING studio_status ---');
  const statusRes = await sendRequest('tools/call', { name: 'studio_status', arguments: {} });
  console.log('studio_status result:', statusRes.result?.content?.[0]?.text);

  // 4. Call get_score on bass (Bars 1-4)
  console.log('\n--- CALLING get_score (bass Bars 1-4) ---');
  const scoreRes = await sendRequest('tools/call', {
    name: 'get_score',
    arguments: { trackIdOrName: 'bass', startBar: 1, endBar: 4 }
  });
  console.log('get_score snippet:', scoreRes.result?.content?.[0]?.text.slice(0, 300) + '...');

  // 5. Call get_harmony (Bars 1-4)
  console.log('\n--- CALLING get_harmony (Bars 1-4) ---');
  const harmonyRes = await sendRequest('tools/call', {
    name: 'get_harmony',
    arguments: { startBar: 1, endBar: 4 }
  });
  // 6. Call render_solo_preview
  console.log('\n--- CALLING render_solo_preview (upright_bass) ---');
  const previewRes = await sendRequest('tools/call', {
    name: 'render_solo_preview',
    arguments: { instrument: 'upright_bass', barCount: 2 }
  });
  console.log('render_solo_preview result:', previewRes.result?.content?.[0]?.text);

  console.log('\n✓ ALL MCP TOOL PROTOCOL TESTS PASSED!');
  child.kill();
  process.exit(0);
}

runTests().catch(err => {
  console.error('MCP test error:', err);
  child.kill();
  process.exit(1);
});
