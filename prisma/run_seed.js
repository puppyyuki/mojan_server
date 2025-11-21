const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    try {
        const sqlPath = path.join(__dirname, 'seed_agent_data.sql');
        console.log(`Reading SQL file from: ${sqlPath}`);

        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon to get individual statements
        // Filter out empty statements and comments
        const statements = sqlContent
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0);

        console.log(`Found ${statements.length} SQL statements to execute.`);

        for (const statement of statements) {
            // Skip comments if the whole statement is a comment (though split logic might leave some)
            if (statement.startsWith('--')) continue;

            console.log(`Executing statement...`);
            await prisma.$executeRawUnsafe(statement);
        }

        console.log('✅ Seed data executed successfully!');
    } catch (e) {
        console.error('❌ Error executing seed data:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
