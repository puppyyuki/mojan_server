const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAgentBalance() {
    try {
        const agent = await prisma.player.findUnique({
            where: { id: 'cmi50k2u90002hw34qagknhnu' },
            select: {
                userId: true,
                nickname: true,
                isAgent: true,
                agentCardBalance: true,
                cardCount: true,
            },
        });

        console.log('Agent status:');
        console.log(JSON.stringify(agent, null, 2));

        // Also check recent sales
        const sales = await prisma.agentRoomCardSale.findMany({
            where: { agentId: 'cmi50k2u90002hw34qagknhnu' },
            orderBy: { createdAt: 'desc' },
            take: 5,
        });

        console.log('\nRecent sales:');
        console.log(JSON.stringify(sales, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkAgentBalance();
