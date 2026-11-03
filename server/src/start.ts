// One entry point for Railway: ROLE=api (default) serves the dashboard, REST API and MCP; ROLE=worker sends and reads inboxes.
const role = (process.env.ROLE || 'api').toLowerCase();
if (role === 'worker') await import('./worker/index.ts');
else await import('./api/index.ts');
