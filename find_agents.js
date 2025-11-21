const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAllAgents() {
    try {
        const agents = await prisma.player.findMany({
            where: { isAgent: true },
            select: {
                id: true,
                userId: true,
                nickname: true,
                agentCardBalance: true,
                cardCount: true,
            },
        });

        console.log('All agents in database:');
        console.log(JSON.stringify(agents, null, 2));

        // Also check if player "123" exists
        const player123 = await prisma.player.findFirst({
            where: {
                OR: [
                    { userId: '123' },
                    { nickname: '123' },
                ],
            },
        });

        console.log('\nPlayer "123":');
        console.log(JSON.stringify(player123, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

findAllAgents();
