import http from 'node:http';
import { openProfile, browserLookup } from './browser.mjs';
import { createLookupService } from './service.mjs';
import { createHandler } from './http.mjs';

// Validate before launching a browser. Neither credentials nor registrations are logged.
const token = process.env.HAYNES_WORKER_TOKEN;
if (!token || token.length < 32) throw Error('Configure HAYNES_WORKER_TOKEN (minimum 32 characters).');
const context = await openProfile();
const server = http.createServer(createHandler(createLookupService(browserLookup(context)), token));
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () => console.log('Haynes worker listening.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(async () => { await context.close(); process.exit(0); }));
