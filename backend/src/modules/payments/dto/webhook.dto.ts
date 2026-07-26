// src/modules/payments/dto/webhook.dto.ts

// ✅ Import Stripe types explicitly (not as Stripe.PropertyName)
// ✅ CORRECT: Import Stripe and access types via namespace
import Stripe from 'stripe';

// Payment types
type PaymentIntent = Stripe.PaymentIntent;
type PaymentMethod = Stripe.PaymentMethod;

// Charge types
type Charge = Stripe.Charge;
type Refund = Stripe.Refund;

// Customer types
type Customer = Stripe.Customer;

// Event types
type StripeEvent = Stripe.Event;

// Webhook types
type WebhookEndpoint = Stripe.WebhookEndpoint;

/**
 * Union type for Stripe webhook event objects
 */
export type StripeWebhookObject = PaymentIntent | Charge | Refund;

/**
 * Simplified webhook payload interface for type safety
 */
export interface StripeWebhookPayload {
  /**
   * Event type: 'payment_intent.succeeded', 'charge.refunded', etc.
   */
  type: string;

  /**
   * Event data containing the Stripe object
   */
  data: {
    /**
     * The Stripe object that triggered the event
     */
    object: StripeWebhookObject;
  };

  /**
   * Unix timestamp when event was created
   */
  created: number;

  /**
   * Unique event ID
   */
  id: string;
}

/**
 * Type guard to check if webhook object is a PaymentIntent
 */
export function isPaymentIntent(
  obj: StripeWebhookObject,
): obj is PaymentIntent {
  return (obj as PaymentIntent).object === 'payment_intent';
}

/**
 * Type guard to check if webhook object is a Charge
 */
export function isCharge(obj: StripeWebhookObject): obj is Charge {
  return (obj as Charge).object === 'charge';
}

/**
 * Type guard to check if webhook object is a Refund
 */
export function isRefund(obj: StripeWebhookObject): obj is Refund {
  return (obj as Refund).object === 'refund';
}

/**
 * Helper: Extract PaymentIntent from webhook event with type safety
 */
export function getPaymentIntentFromEvent(
  event: StripeEvent,
): PaymentIntent | null {
  if (
    event.type === 'payment_intent.succeeded' ||
    event.type === 'payment_intent.payment_failed'
  ) {
    return event.data.object;
  }
  return null;
}

/**
 * Helper: Extract Charge from webhook event with type safety
 */
export function getChargeFromEvent(event: StripeEvent): Charge | null {
  if (
    event.type === 'charge.refunded' ||
    event.type === 'charge.succeeded' ||
    event.type === 'charge.failed'
  ) {
    return event.data.object;
  }
  return null;
}
