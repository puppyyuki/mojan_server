const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateAgentBalance() {
    try {
        const agent = await prisma.player.update({
            where: { id: 'cmi50k2u90002hw34qagknhnu' },
            data: {
                agentCardBalance: 5000,
            },
        });

        console.log('✅ Agent balance updated:');
        console.log(JSON.stringify(agent, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

updateAgentBalance();
