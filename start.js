/**
 * HiveOrigin — start.js
 * Entry point. Loads env, then starts the Express server.
 */

import 'dotenv/config';
import { createServer } from './src/server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = createServer();

server.listen(PORT, () => {
  console.log(`[hiveorigin] listening on port ${PORT}`);
  console.log(`[hiveorigin] version 0.1.0 — model-pedigree certificate surface`);
});

server.on('error', (err) => {
  console.error('[hiveorigin] server error:', err.message);
  process.exit(1);
});
