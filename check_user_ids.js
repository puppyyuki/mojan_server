const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPlayerUserIds() {
    try {
        console.log('Checking player userId values...\n');

        // Get all players
        const players = await prisma.player.findMany({
            select: {
                id: true,
                userId: true,
                nickname: true,
            },
            take: 20,
        });

        console.log(`Found ${players.length} players:\n`);

        players.forEach((player, index) => {
            const userIdLength = player.userId.length;
            const isNumeric = /^\d+$/.test(player.userId);
            const isCuid = player.userId.startsWith('c') && player.userId.length > 20;

            console.log(`${index + 1}. ${player.nickname}`);
            console.log(`   ID (database): ${player.id}`);
            console.log(`   userId: ${player.userId}`);
            console.log(`   userId length: ${userIdLength}`);
            console.log(`   Is numeric: ${isNumeric}`);
            console.log(`   Is CUID (database ID): ${isCuid}`);
            console.log(`   ❌ PROBLEM: userId should be 6-digit number, but it's ${isCuid ? 'a database ID' : 'something else'}\n`);
        });

        // Check if any userId is actually a CUID (database ID)
        const problematicPlayers = players.filter(p =>
            p.userId.startsWith('c') && p.userId.length > 20
        );

        if (problematicPlayers.length > 0) {
            console.log(`\n⚠️  FOUND ${problematicPlayers.length} PLAYERS WITH DATABASE ID AS userId:`);
            problematicPlayers.forEach(p => {
                console.log(`   - ${p.nickname}: userId = ${p.userId}`);
            });
        } else {
            console.log('\n✅ All players have proper 6-digit userId values');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPlayerUserIds();
