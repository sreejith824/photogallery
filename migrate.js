const dotenv = require('dotenv');
const { spawnSync } = require('child_process');
const fs = require('fs');

// Load .env.local
const envConfig = dotenv.parse(fs.readFileSync('.env.local'));

// Merge with existing env
const env = { ...process.env, ...envConfig };

// Run with proper env
const result = spawnSync('drizzle-kit', ['migrate', '--config', 'drizzle.config.js'], {
  stdio: 'inherit',
  env: env
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

