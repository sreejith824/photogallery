const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  try {
    const migrationFile = fs.readFileSync(
      path.join(__dirname, 'migrations/0000_furry_energizer.sql'),
      'utf-8'
    );

    // Split by statement-breakpoint
    const statements = migrationFile
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Running ${statements.length} SQL statements...`);

    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
        console.log('✓ Executed statement');
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log('⊘ Table already exists, skipping...');
        } else {
          throw err;
        }
      }
    }

    console.log('✓ Migrations complete!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
