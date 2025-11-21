const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPlayers() {
    try {
        const players = await prisma.player.findMany({
            take: 5,
            select: {
                id: true,
                userId: true,
                nickname: true,
                isAgent: true,
                agentCardBalance: true,
            },
        });

        console.log('Players in database:');
        console.log(JSON.stringify(players, null, 2));

        console.log('\nLooking for agent with id "agent-placeholder-id":');
        const specificAgent = await prisma.player.findUnique({
            where: { id: 'agent-placeholder-id' },
        });
        console.log(JSON.stringify(specificAgent, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkPlayers();
