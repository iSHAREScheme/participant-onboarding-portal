const fs = require('fs');
const path = require('path');

const publicEnvKeys = require('./public-env-keys');

const targetPath = path.join(__dirname, '..', 'public', 'env.js');

const envPayload = {};
for (const key of publicEnvKeys) {
  const value = process.env[key];
  if (typeof value === 'string') {
    envPayload[key] = value;
  }
}

const contents = `window.__ENV = ${JSON.stringify(envPayload, null, 2)};\n`;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, contents, 'utf8');

console.log(`Wrote ${targetPath}`);
