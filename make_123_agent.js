const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function makePlayer123Agent() {
    try {
        // Find player "123"
        const player = await prisma.player.findFirst({
            where: {
                OR: [
                    { userId: '955370' },
                    { nickname: '123' },
                ],
            },
        });

        if (!player) {
            console.log('❌ Player "123" not found');
            return;
        }

        console.log('Found player "123":');
        console.log(JSON.stringify(player, null, 2));

        // Make them an agent with 5000 cards
        const updatedPlayer = await prisma.player.update({
            where: { id: player.id },
            data: {
                isAgent: true,
                agentCardBalance: 5000,
            },
        });

        console.log('\n✅ Player "123" is now an agent:');
        console.log(JSON.stringify(updatedPlayer, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

makePlayer123Agent();
