const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSearch() {
    try {
        console.log('Testing search for "333"...');

        const results = await prisma.player.findMany({
            where: {
                OR: [
                    { userId: { contains: '333' } },
                    { nickname: { contains: '333' } },
                ],
            },
            select: {
                id: true,
                userId: true,
                nickname: true,
            },
        });

        console.log('Search results:', JSON.stringify(results, null, 2));
        console.log('Total found:', results.length);

        // Also try to find all players to see what's in the database
        console.log('\nAll players in database:');
        const allPlayers = await prisma.player.findMany({
            select: {
                id: true,
                userId: true,
                nickname: true,
            },
            take: 10,
        });
        console.log(JSON.stringify(allPlayers, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testSearch();
