// src/modules/orders/dto/update-order-status.dto.ts

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OrderStatus {
  PENDING_RUNNER_ACTIVATION = 'PENDING_RUNNER_ACTIVATION',
  AWAITING_RUNNER_ACCEPTANCE = 'AWAITING_RUNNER_ACCEPTANCE',
  CREATED = 'CREATED',
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  BUYING_TRIP_PLANNED = 'BUYING_TRIP_PLANNED',
  BUYING_IN_PROGRESS = 'BUYING_IN_PROGRESS',
  PURCHASED_FROM_SHOPS = 'PURCHASED_FROM_SHOPS',
  ARRIVED_FOR_PACKING = 'ARRIVED_FOR_PACKING',
  BATCHED = 'BATCHED',
  PICKED = 'PICKED',
  PACKED = 'PACKED',
  READY_FOR_HANDOVER = 'READY_FOR_HANDOVER',
  OUT_FOR_HANDOVER = 'OUT_FOR_HANDOVER',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: 'New order status' })
  @IsString()
  @IsNotEmpty()
  status!: OrderStatus;

  @ApiPropertyOptional({ description: 'Runner ID (for assignment)' })
  @IsString()
  @IsOptional()
  runnerId?: string;

  @ApiPropertyOptional({ description: 'Tracking number', required: false })
  @IsString()
  @IsOptional()
  trackingNumber?: string;

  @ApiPropertyOptional({
    description:
      'How the customer will receive the order: PICKUP_AT_RUNNER, DELIVERY_STATION, PUBLIC_TRANSPORT, LOCAL_DELIVERY',
  })
  @IsString()
  @IsOptional()
  fulfillmentMethod?: string;

  @ApiPropertyOptional({
    description: 'Town station, pickup place, transport rank, or delivery area',
  })
  @IsString()
  @IsOptional()
  fulfillmentLocation?: string;

  @ApiPropertyOptional({
    description: 'Station/transport/customer contact details',
  })
  @IsString()
  @IsOptional()
  fulfillmentContact?: string;

  @ApiPropertyOptional({ description: 'Runner fulfillment notes' })
  @IsString()
  @IsOptional()
  fulfillmentNotes?: string;

  @ApiPropertyOptional({
    description: 'Procurement city, usually Durban or Johannesburg',
  })
  @IsString()
  @IsOptional()
  procurementCity?: string;

  @ApiPropertyOptional({ description: 'Runner buying trip reference' })
  @IsString()
  @IsOptional()
  procurementTripCode?: string;

  @ApiPropertyOptional({ description: 'Reason when a runner rejects an order' })
  @IsString()
  @IsOptional()
  rejectionReason?: string;
}
