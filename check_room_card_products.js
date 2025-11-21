const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRoomCardProducts() {
    try {
        console.log('Checking room card products in database...\n');

        const products = await prisma.roomCardProduct.findMany({
            where: { isActive: true },
            orderBy: { cardAmount: 'asc' },
        });

        console.log(`Found ${products.length} active products:\n`);

        if (products.length === 0) {
            console.log('⚠️  No products found! You need to create products first.');
            console.log('\nTo create products, you can run:');
            console.log('  node create_room_card_products.js');
        } else {
            products.forEach((product, index) => {
                console.log(`${index + 1}. Product ID: ${product.id}`);
                console.log(`   Card Amount: ${product.cardAmount}`);
                console.log(`   Price: NT$ ${product.price}`);
                console.log(`   Active: ${product.isActive}`);
                console.log('');
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkRoomCardProducts();
