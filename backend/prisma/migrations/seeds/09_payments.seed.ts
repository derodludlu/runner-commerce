import { PrismaClient } from '@prisma/client';

type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends'
>;

export default async function seedPayments(prisma: PrismaTransaction) {
  const orders = await prisma.order.findMany();

  if (orders.length === 0) {
    console.log('⚠ Skipping payments - no orders found');
    return;
  }

  const payments = [
    {
      orderId: orders.find((o) => o.status === 'COMPLETED')?.id!,
      amount: 25.44,
      currency: 'usd',
      method: 'CARD',
      status: 'COMPLETED',
      stripePaymentIntentId: 'pi_completed_001',
      stripeChargeId: 'ch_completed_001',
      transactionId: 'txn_001',
      metadata: JSON.stringify({ cardLast4: '4242' }),
      refundedAmount: 0,
    },
    {
      orderId: orders.find((o) => o.status === 'IN_PROGRESS')?.id!,
      amount: 94.48,
      currency: 'usd',
      method: 'APPLE_PAY',
      status: 'COMPLETED',
      stripePaymentIntentId: 'pi_pending_002',
      stripeChargeId: null,
      transactionId: 'txn_002',
      metadata: JSON.stringify({ device: 'iPhone' }),
      refundedAmount: 0,
    },
    {
      orderId: orders.find((o) => o.status === 'PENDING')?.id!,
      amount: 35.66,
      currency: 'usd',
      method: 'CARD',
      status: 'PENDING',
      stripePaymentIntentId: 'pi_processing_003',
      stripeChargeId: null,
      transactionId: null,
      metadata: JSON.stringify({ cardLast4: '5555' }),
      refundedAmount: 0,
    },
  ];

  for (const paymentData of payments) {
    if (paymentData.orderId) {
      await prisma.payment.upsert({
        where: { orderId: paymentData.orderId },
        update: {},
        create: paymentData,
      });
    }
  }

  console.log('✓ Payments seeded');
}
