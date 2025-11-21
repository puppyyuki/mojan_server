const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showCardCounts() {
    try {
        const agent = await prisma.player.findUnique({
            where: { userId: '955370' }, // Player 123
            select: { userId: true, nickname: true, cardCount: true, agentCardBalance: true }
        });

        console.log('Current Status:');
        console.log(JSON.stringify(agent, null, 2));

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

showCardCounts();
