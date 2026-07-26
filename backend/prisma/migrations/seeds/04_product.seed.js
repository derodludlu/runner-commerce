'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.default = seedProducts;
async function seedProducts(prisma) {
  const shops = await prisma.shop.findMany();
  const shopMap = new Map(shops.map((s) => [s.name, s.id]));
  const products = [
    // Maria Grocery Store products
    {
      shopId: shopMap.get('Maria Grocery Store'),
      name: 'Fresh Milk 1L',
      description: 'Organic whole milk',
      basePrice: 3.99,
      stockQty: 100,
      category: 'Dairy',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/e0f2fe/0369a1?text=Fresh+Milk',
      ],
    },
    {
      shopId: shopMap.get('Maria Grocery Store'),
      name: 'Whole Wheat Bread',
      description: 'Freshly baked whole wheat bread',
      basePrice: 2.49,
      stockQty: 50,
      category: 'Bakery',
      status: 'ACTIVE',
      images: ['https://dummyjson.com/image/400x300/fef3c7/b45309?text=Bread'],
    },
    {
      shopId: shopMap.get('Maria Grocery Store'),
      name: 'Free Range Eggs (12 pack)',
      description: 'Farm fresh eggs',
      basePrice: 4.99,
      stockQty: 80,
      category: 'Dairy',
      status: 'ACTIVE',
      images: ['https://dummyjson.com/image/400x300/fef9c3/a16207?text=Eggs'],
    },
    {
      shopId: shopMap.get('Maria Grocery Store'),
      name: 'Organic Bananas 1kg',
      description: 'Sweet organic bananas',
      basePrice: 1.99,
      stockQty: 200,
      category: 'Produce',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/fef9c3/a16207?text=Bananas',
      ],
    },
    {
      shopId: shopMap.get('Maria Grocery Store'),
      name: 'Chicken Breast 500g',
      description: 'Fresh chicken breast',
      basePrice: 7.99,
      stockQty: 60,
      category: 'Meat',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/fecaca/dc2626?text=Chicken',
      ],
    },
    // Maria Organic Market products
    {
      shopId: shopMap.get('Maria Organic Market'),
      name: 'Organic Quinoa 500g',
      description: 'Premium organic quinoa',
      basePrice: 6.99,
      stockQty: 40,
      category: 'Grains',
      status: 'ACTIVE',
      images: ['https://dummyjson.com/image/400x300/d1fae5/047857?text=Quinoa'],
    },
    {
      shopId: shopMap.get('Maria Organic Market'),
      name: 'Cold Pressed Olive Oil 500ml',
      description: 'Extra virgin olive oil',
      basePrice: 12.99,
      stockQty: 30,
      category: 'Oils',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/d1fae5/047857?text=Olive+Oil',
      ],
    },
    {
      shopId: shopMap.get('Maria Organic Market'),
      name: 'Organic Honey 350g',
      description: 'Pure raw honey',
      basePrice: 9.99,
      stockQty: 25,
      category: 'Condiments',
      status: 'ACTIVE',
      images: ['https://dummyjson.com/image/400x300/fef3c7/b45309?text=Honey'],
    },
    // David Electronics products
    {
      shopId: shopMap.get('David Electronics'),
      name: 'Wireless Bluetooth Headphones',
      description: 'Noise cancelling over-ear headphones',
      basePrice: 79.99,
      stockQty: 20,
      category: 'Audio',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/e0e7ff/3730a3?text=Headphones',
      ],
    },
    {
      shopId: shopMap.get('David Electronics'),
      name: 'USB-C Hub 7-in-1',
      description: 'Multi-port USB-C adapter',
      basePrice: 34.99,
      stockQty: 35,
      category: 'Accessories',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/e0e7ff/3730a3?text=USB+Hub',
      ],
    },
    {
      shopId: shopMap.get('David Electronics'),
      name: 'Portable Power Bank 20000mAh',
      description: 'Fast charging power bank',
      basePrice: 44.99,
      stockQty: 45,
      category: 'Accessories',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/e0e7ff/3730a3?text=Power+Bank',
      ],
    },
    {
      shopId: shopMap.get('David Electronics'),
      name: 'Smart Watch Series 5',
      description: 'Fitness tracking smartwatch',
      basePrice: 199.99,
      stockQty: 15,
      category: 'Wearables',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/e0e7ff/3730a3?text=Smartwatch',
      ],
    },
    // David Phone Hub products
    {
      shopId: shopMap.get('David Phone Hub'),
      name: 'iPhone 15 Pro Max 256GB',
      description: 'Latest iPhone model',
      basePrice: 1199.99,
      stockQty: 10,
      category: 'Phones',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/f3e8ff/6b21a8?text=iPhone+15',
      ],
    },
    {
      shopId: shopMap.get('David Phone Hub'),
      name: 'Samsung Galaxy S24 Ultra',
      description: 'Flagship Android phone',
      basePrice: 1099.99,
      stockQty: 12,
      category: 'Phones',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/f3e8ff/6b21a8?text=Galaxy+S24',
      ],
    },
    {
      shopId: shopMap.get('David Phone Hub'),
      name: 'Phone Case - Universal',
      description: 'Protective silicone case',
      basePrice: 14.99,
      stockQty: 100,
      category: 'Accessories',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/f3e8ff/6b21a8?text=Phone+Case',
      ],
    },
    {
      shopId: shopMap.get('David Phone Hub'),
      name: 'Screen Protector Pack',
      description: 'Tempered glass screen protectors (3 pack)',
      basePrice: 9.99,
      stockQty: 150,
      category: 'Accessories',
      status: 'ACTIVE',
      images: [
        'https://dummyjson.com/image/400x300/f3e8ff/6b21a8?text=Screen+Protector',
      ],
    },
  ];
  for (const productData of products) {
    await prisma.product.create({
      data: productData,
    });
  }
  console.log('✓ Products seeded');
}
