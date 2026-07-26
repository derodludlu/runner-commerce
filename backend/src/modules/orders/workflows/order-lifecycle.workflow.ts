// src/modules/orders/workflows/order-lifecycle.workflow.ts

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OrderLifecycleWorkflow {
  constructor(private eventEmitter: EventEmitter2) {}

  /**
   * Emit events based on status transitions
   */
  async handleStatusChange(
    orderId: string,
    previousStatus: string,
    newStatus: string,
    orderData: any,
  ) {
    // Log transition
    console.log(`[Order ${orderId}] ${previousStatus} → ${newStatus}`);

    // Emit appropriate event based on new status
    switch (newStatus) {
      case 'PAID':
        await this.eventEmitter.emitAsync('order.paid', {
          orderId,
          order: orderData,
        });
        break;

      case 'BATCHED':
        await this.eventEmitter.emitAsync('order.batched', {
          orderId,
          order: orderData,
        });
        break;

      case 'COMPLETED':
        await this.eventEmitter.emitAsync('order.completed', {
          orderId,
          order: orderData,
        });
        break;

      case 'CANCELLED':
        await this.eventEmitter.emitAsync('order.cancelled', {
          orderId,
          order: orderData,
        });
        break;
    }
  }

  /**
   * Validate status transition
   */
  isValidTransition(fromStatus: string, toStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      PENDING_RUNNER_ACTIVATION: ['AWAITING_RUNNER_ACCEPTANCE', 'CANCELLED'],
      AWAITING_RUNNER_ACCEPTANCE: ['PENDING_PAYMENT', 'CANCELLED'],
      CREATED: ['ORDER_CONFIRMED', 'PENDING_PAYMENT', 'CANCELLED'],
      ORDER_CONFIRMED: ['PENDING_PAYMENT', 'BUYING_TRIP_PLANNED', 'CANCELLED'],
      PENDING_PAYMENT: ['PAID', 'CANCELLED'],
      PAID: ['BUYING_TRIP_PLANNED', 'BATCHED', 'CANCELLED'],
      BUYING_TRIP_PLANNED: ['BUYING_IN_PROGRESS', 'CANCELLED'],
      BUYING_IN_PROGRESS: ['PURCHASED_FROM_SHOPS', 'CANCELLED'],
      PURCHASED_FROM_SHOPS: ['ARRIVED_FOR_PACKING', 'CANCELLED'],
      ARRIVED_FOR_PACKING: ['PACKED', 'CANCELLED'],
      BATCHED: ['PICKED', 'BUYING_IN_PROGRESS'],
      PICKED: ['PACKED', 'PURCHASED_FROM_SHOPS'],
      PACKED: ['READY_FOR_HANDOVER', 'SHIPPED'],
      READY_FOR_HANDOVER: ['OUT_FOR_HANDOVER', 'COMPLETED', 'CANCELLED'],
      OUT_FOR_HANDOVER: ['COMPLETED', 'CANCELLED'],
      SHIPPED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
      REFUNDED: [],
    };

    return validTransitions[fromStatus]?.includes(toStatus) || false;
  }

  /**
   * Calculate total with taxes and fees
   */
  calculateTotals(
    items: any[],
    shippingFee: number = 50,
    taxRate: number = 0.1,
  ): {
    subtotal: number;
    tax: number;
    shippingFee: number;
    totalAmount: number;
  } {
    const subtotal = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const tax = subtotal * taxRate;

    return {
      subtotal,
      tax,
      shippingFee,
      totalAmount: subtotal + tax + shippingFee,
    };
  }
}
