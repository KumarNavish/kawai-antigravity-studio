// server/test-analyzer.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzePerformance } from './analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const perfData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'session', 'demo_performance.json'), 'utf8'));

const analysis = analyzePerformance(perfData);
console.log('--- ANALYSIS RESULT ---');
console.log('Key detected:', analysis.key);
console.log('BPM:', analysis.bpm, 'Time Signature:', analysis.timeSignature);
console.log('Total bars:', analysis.totalBars);
console.log('Melodic range:', analysis.range);
console.log('Dynamic arc:', analysis.dynamicArc);
console.log('Overall average velocity:', analysis.overallAvgVelocity);
console.log('Motifs found:', analysis.motifs.length);
console.log('Bar-by-bar progression:');
for (const b of analysis.bars) {
  console.log(`  Bar ${b.barNumber.toString().padStart(2)}: [${b.chord.padEnd(16)}] | Bass: ${b.bassNote.padEnd(4)} | Mel: ${b.melodyPeak.padEnd(4)} | Vel: ${b.dynamics.avg}`);
}
