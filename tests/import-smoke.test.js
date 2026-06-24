// Node import smoke test: these modules must not throw on import in non-browser environments
import assert from 'node:assert/strict';

const modules = [
  '../src/ui/pwaTutorial.js',
  '../src/ui/splash.js',
];

for (const mod of modules) {
  try {
    await import(mod);
  } catch (e) {
    assert.fail(`import('${mod}') threw: ${e.message}`);
  }
}

console.log('import smoke tests passed');
