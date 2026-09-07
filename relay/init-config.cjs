'use strict';
const {randomBytes} = require('node:crypto');
const {writeFileSync} = require('node:fs');
const {join} = require('node:path');
const {homedir} = require('node:os');
const filename = process.argv[2] || join(homedir(), '.caption-ninja-relay.private.json');
const key = () => randomBytes(32).toString('base64url');
const config = {origins: ['http://localhost:8765', 'http://127.0.0.1:8765',
  'http://localhost:8080', 'http://127.0.0.1:8080', 'https://caption.ninja'],
  rooms: {source: {read: key(), write: key()}, output: {read: key(), write: key()}}};
writeFileSync(filename, JSON.stringify(config, null, 2) + '\n', {flag: 'wx', mode: 0o600});
console.log('Private configuration created: ' + filename + '\nKeep it outside any web root. Open it locally to obtain room tokens.');
