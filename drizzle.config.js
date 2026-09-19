console.log('=== drizzle.config.js loading ===');
console.log('process.env.DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'UNDEFINED');
console.log('process.env keys with DB:', Object.keys(process.env).filter(k => k.includes('DATABASE')));

module.exports = {
  schema: "./lib/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || "NO-URL-SET",
  },
};



