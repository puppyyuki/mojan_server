const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSalesAndBalance() {
    try {
        // Check agent 123's current balance
        const agent123 = await prisma.player.findUnique({
            where: { id: 'cmi7yvcpl0000hwych65ps2mn' },
            select: {
                userId: true,
                nickname: true,
                agentCardBalance: true,
                cardCount: true,
            },
        });

        console.log('Agent 123 current status:');
        console.log(JSON.stringify(agent123, null, 2));

        // Check all sales records
        const allSales = await prisma.agentRoomCardSale.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        console.log('\nAll sales records (last 10):');
        console.log(JSON.stringify(allSales, null, 2));

        // Check player 222's balance
        const player222 = await prisma.player.findUnique({
            where: { id: 'cmi50k0mu0001hw343qyu1efy' },
            select: {
                userId: true,
                nickname: true,
                cardCount: true,
            },
        });

        console.log('\nPlayer 222 current balance:');
        console.log(JSON.stringify(player222, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkSalesAndBalance();
