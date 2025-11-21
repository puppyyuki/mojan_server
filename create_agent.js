const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAgent() {
    try {
        // Use player "333" as the agent
        const playerId = 'cmi50k2u90002hw34qagknhnu';

        const agent = await prisma.player.update({
            where: { id: playerId },
            data: {
                isAgent: true,
                agentCardBalance: 500,
            },
        });

        console.log('✅ Agent created successfully:');
        console.log(JSON.stringify(agent, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

createAgent();
