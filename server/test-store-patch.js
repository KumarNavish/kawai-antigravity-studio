// server/test-store-patch.js
import { projectStore } from './project-store.js';

console.log('--- TESTING PATCH & SCORE API ---');
const score = projectStore.getScore({ trackIdOrName: 'bass', range: { startBar: 9, endBar: 12 } });
console.log('Fetched score slice for bass (Bars 9-12):', score[0]?.notes?.length, 'notes');
console.log('Sample notes in range:', score[0]?.notes?.slice(0, 3));

// Test surgical patch: alter velocity in Bars 9-12 by +5
const patchRes = projectStore.applyScorePatch('bass', {
  range: { startBar: 9, endBar: 12 },
  alterVelocity: { delta: 5 }
}, 'Test velocity boost');
console.log('Patch result:', patchRes);

const scoreAfter = projectStore.getScore({ trackIdOrName: 'bass', range: { startBar: 9, endBar: 12 } });
console.log('Sample note velocity after patch:', scoreAfter[0]?.notes?.[0]?.velocity);

// Test undo
const undoRes = projectStore.undo();
console.log('Undo result:', undoRes?.undone);
