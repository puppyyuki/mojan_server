const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkProducts() {
    try {
        const products = await prisma.roomCardProduct.findMany();
        console.log('=== Room Card Products ===');
        console.log(`Total products: ${products.length}`);
        products.forEach(p => {
            console.log(`- ID: ${p.id}, Amount: ${p.cardAmount}, Price: ${p.price}, Active: ${p.isActive}`);
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkProducts();
