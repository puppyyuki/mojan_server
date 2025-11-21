const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAgent() {
    try {
        const agent = await prisma.player.findFirst({
            where: { isAgent: true },
        });

        console.log('Agent found:', JSON.stringify(agent, null, 2));

        if (!agent) {
            console.log('\nNo agent found! Running seed script...');
            // You need to run: node prisma/run_seed.js
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkAgent();
