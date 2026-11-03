// Creates an API token for the MCP server: pnpm token:create "Claude Code laptop". The token is printed once.
import { createToken } from '../api/auth.ts';
import { closeDb } from '../core/db.ts';

const t = await createToken(process.argv.slice(2).join(' ') || 'Claude');
console.log(`Token "${t.name}" created. Copy it now, it is not shown again:\n\n${t.token}\n`);
await closeDb();
