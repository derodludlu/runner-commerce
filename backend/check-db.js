require('dotenv').config({ path: './.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

async function check() {
  try {
    console.log('Checking Cart table...');
    const carts = await prisma.cart.findMany({ take: 5 });
    console.log('Carts found:', carts.length);

    console.log('Checking CartItem table...');
    const items = await prisma.cartItem.findMany({
      take: 5,
      include: { listing: true },
    });
    console.log('CartItems found:', items.length);
    if (items[0]) {
      console.log('Sample item:', JSON.stringify(items[0], null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  } finally {
    await prisma.$disconnect();
  }
}

check();
