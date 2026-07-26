// src/modules/orders/orders.service.ts

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { CreateOrderDto } from './dto/create-order.dto';
import {
  UpdateOrderStatusDto,
  OrderStatus,
} from './dto/update-order-status.dto';
import { UpdateManualOrderTrackingDto } from './dto/update-manual-order-tracking.dto';
import { SubmitCustomerPaymentDto } from './dto/submit-customer-payment.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { OrderLifecycleWorkflow } from './workflows/order-lifecycle.workflow';

const TAX_RATE = 0;
const TRANSPORT_FEE_RATE = 0;
const MAX_PAGE_SIZE = 100;

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private workflow: OrderLifecycleWorkflow,
  ) {}

  /**
   * Create Order
   */
  async create(createOrderDto: CreateOrderDto, userId: string): Promise<any> {
    // Using any temporarily due to missing type definition
    const { items, shippingAddress, notes, customerPhone } = createOrderDto;

    if (!items || items.length === 0) {
      throw new BadRequestException('Order must have at least one item');
    }

    // Validate items and extract listing IDs
    const listingIds = items.map((item) => item.listingId);
    const listings = await this.prisma.runnerListing.findMany({
      where: { id: { in: listingIds } },
      include: {
        product: { include: { shop: true } },
        runner: true,
      },
    });

    if (listings.length !== listingIds.length) {
      throw new NotFoundException('One or more listings not found');
    }

    const listingMap = new Map(listings.map((l: any) => [l.id, l]));
    const runnerIds = [
      ...new Set(listings.map((listing: any) => listing.runnerId)),
    ];

    if (runnerIds.length !== 1) {
      throw new BadRequestException(
        'Each order must contain listings from one runner. Split the basket by runner.',
      );
    }
    const procurementCities = [
      ...new Set(
        listings.map((listing: any) =>
          String(
            listing.product?.shop?.procurementCity || 'DURBAN',
          ).toUpperCase(),
        ),
      ),
    ];
    if (procurementCities.length !== 1) {
      throw new BadRequestException(
        'Each order must contain products from one procurement city',
      );
    }
    const procurementCity = procurementCities[0];
    const preference = await this.prisma.customerRunnerPreference.findUnique({
      where: { customerId_city: { customerId: userId, city: procurementCity } },
    });

    const selectedRunnerId = runnerIds[0];
    const matchedRunnerId =
      preference?.status === 'MATCHED' ? preference.runnerId : null;
    const trustedRunnerMismatch = Boolean(
      !preference ||
        preference.status === 'INACTIVE' ||
        (matchedRunnerId && matchedRunnerId !== selectedRunnerId),
    );

    if (matchedRunnerId && !trustedRunnerMismatch) {
      const cityAssignment = await this.prisma.runnerServiceCity.findUnique({
        where: {
          runnerId_city: { runnerId: matchedRunnerId, city: procurementCity },
        },
      });
      if (!cityAssignment?.active) {
        throw new BadRequestException(
          `Your runner is not currently enabled for ${this.cityLabel(procurementCity)}`,
        );
      }
    }

    const runnerWorkflowEnabled = await this.runnerHasOrderWorkflow(selectedRunnerId);
    const initialStatus = runnerWorkflowEnabled
      ? OrderStatus.AWAITING_RUNNER_ACCEPTANCE
      : OrderStatus.PENDING_RUNNER_ACTIVATION;
    const orderRunnerId = selectedRunnerId;
    const trustedRunnerOverrideNote = trustedRunnerMismatch
      ? [
          `Customer confirmed checkout outside matched trusted runner for ${this.cityLabel(procurementCity)}.`,
          preference?.runnerId ? `Trusted runner id: ${preference.runnerId}` : '',
          `Selected runner id: ${selectedRunnerId}`,
          this.cleanOptionalText(createOrderDto.trustedRunnerOverrideReason),
        ]
          .filter(Boolean)
          .join('\n')
      : null;
    const pendingActivationNote =
      initialStatus === OrderStatus.PENDING_RUNNER_ACTIVATION
        ? `Runner Commerce captured this order as customer-managed because the selected ${this.cityLabel(procurementCity)} runner is not active on the Phase 2 order workflow.`
        : null;
    const shopIds = [
      ...new Set(
        listings
          .map((listing: any) => listing.shopId || listing.product?.shopId)
          .filter(Boolean),
      ),
    ];

    let subtotal = 0;
    let totalCommission = 0;
    let transportFee = 0;

    for (const item of items) {
      const listing: any = listingMap.get(item.listingId);

      if (!listing) {
        throw new BadRequestException(`Invalid listing ${item.listingId}`);
      }

      if (listing.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Listing ${item.listingId} is not available`,
        );
      }

      if (listing.runner?.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Runner unavailable for listing ${item.listingId}`,
        );
      }

      if (listing.product.stockQty < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${listing.product.name}"`,
        );
      }

      subtotal += listing.runnerPrice * item.quantity;
      transportFee +=
        listing.product.basePrice * TRANSPORT_FEE_RATE * item.quantity;

      totalCommission +=
        (listing.runnerPrice - listing.product.basePrice) * item.quantity;
    }

    subtotal = roundMoney(subtotal);
    const tax = roundMoney(subtotal * TAX_RATE);
    const shippingFee = roundMoney(transportFee);
    const totalAmount = roundMoney(subtotal + tax + shippingFee);

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          customerPhone: createOrderDto.customerPhone,
          customerId: userId || null,
          runnerId: orderRunnerId,
          shopId: shopIds.length === 1 ? shopIds[0] : null,
          status: initialStatus,
          totalAmount,
          subtotal,
          tax,
          shippingFee,
          shippingAddress,
          notes:
            [notes, trustedRunnerOverrideNote, pendingActivationNote]
              .filter(Boolean)
              .join('\n\n') || null,
          fulfillmentMethod: createOrderDto.fulfillmentMethod,
          fulfillmentLocation: createOrderDto.fulfillmentLocation,
          fulfillmentContact: this.cleanOptionalText(
            createOrderDto.fulfillmentContact,
          ),
          fulfillmentNotes: this.cleanOptionalText(
            createOrderDto.fulfillmentNotes,
          ),
          procurementCity,

          items: {
            create: items.map((item) => {
              const listing: any = listingMap.get(item.listingId);

              return {
                listingId: item.listingId,
                productId: listing.productId,
                quantity: item.quantity,
                unitPrice: listing.runnerPrice,
                shopPrice: listing.product.basePrice,
                commission: listing.runnerPrice - listing.product.basePrice,
                customerImageUrls: this.cleanCustomerImageUrls(
                  item.customerImageUrls,
                ),
                selectedSize: this.cleanOptionalText(item.selectedSize),
                selectedColor: this.cleanOptionalText(item.selectedColor),
                customerNote: this.cleanOptionalText(item.customerNote),
              };
            }),
          },
        },

        include: {
          items: {
            include: {
              listing: {
                include: {
                  product: true,
                  runner: {
                    select: {
                      id: true,
                      rating: true,
                      user: {
                        select: { name: true, phone: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (trustedRunnerMismatch) {
        await tx.adminAuditLog.create({
          data: {
            actorUserId: userId || null,
            action: 'CUSTOMER_TRUSTED_RUNNER_OVERRIDE',
            entityType: 'Order',
            entityId: createdOrder.id,
            summary: 'Customer checked out through a non-matched runner',
            metadata: {
              procurementCity,
              selectedRunnerId,
              matchedRunnerId,
              preferenceStatus: preference?.status || null,
            },
          },
        });
      }

      for (const item of items) {
        const listing: any = listingMap.get(item.listingId);
        const updated = await tx.product.updateMany({
          where: {
            id: listing.productId,
            stockQty: { gte: item.quantity },
          },
          data: {
            stockQty: { decrement: item.quantity },
          },
        });

        if (updated.count !== 1) {
          throw new BadRequestException(
            `Insufficient stock for "${listing.product.name}"`,
          );
        }

        await tx.inventoryReservation.create({
          data: {
            productId: listing.productId,
            orderId: createdOrder.id,
            quantity: item.quantity,
            status: 'CONFIRMED',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      return createdOrder;
    });

    await this.notifyOrderUpdate(order, initialStatus);
    return this.withPermittedActions(order, 'CUSTOMER');
  }

  /**
   * List Orders
   */
  async findAll(
    query: QueryOrderDto,
    userId?: string,
    role?: string,
    runnerId?: string | null,
  ) {
    const { status, customerPhone, limit = 10, offset = 0 } = query;

    const take = Math.min(Number(limit), MAX_PAGE_SIZE);
    const skip = Math.max(0, Number(offset));

    const where: Prisma.OrderWhereInput = {};

    if (role === 'CUSTOMER') {
      where.customerId = userId;
    }

    if (role === 'RUNNER') {
      if (!runnerId) {
        throw new ForbiddenException('Runner profile required');
      }

      where.runnerId = runnerId;
    }

    if (role === 'SHOP_OWNER' && userId) {
      where.OR = [
        {
          items: {
            some: { listing: { product: { shop: { ownerId: userId } } } },
          },
        },
      ];
    }

    if (customerPhone) {
      where.customerPhone = {
        contains: customerPhone,
        mode: 'insensitive',
      };
    }

    if (status) {
      where.status = status;
    }

    const orders = await this.prisma.order.findMany({
      where,

      include: {
        items: {
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
                runner: {
                  select: {
                    id: true,
                    user: {
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        },

        payment: true,

        batchOrders: {
          include: { batch: true },
        },
      },

      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    const total = await this.prisma.order.count({ where });

    return {
      data: orders.map((order) =>
        this.withPermittedActions(order, role || 'CUSTOMER'),
      ),
      meta: {
        total,
        limit: take,
        offset: skip,
        hasNext: skip + take < total,
      },
    };
  }

  /**
   * Get Single Order
   */
  async findOne(
    id: string,
    userId?: string,
    role?: string,
    runnerId?: string | null,
  ) {
    if (!id) {
      throw new BadRequestException('Order ID required');
    }

    const where: Prisma.OrderWhereInput = { id };

    if (role === 'CUSTOMER') {
      where.customerId = userId;
    }

    if (role === 'RUNNER') {
      if (!runnerId) {
        throw new ForbiddenException('Runner profile required');
      }

      where.runnerId = runnerId;
    }

    const order = await this.prisma.order.findFirst({
      where,

      include: {
        items: {
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                        phone: true,
                        address: true,
                      },
                    },
                  },
                },
                runner: {
                  include: {
                    user: {
                      select: { name: true, phone: true },
                    },
                    wallet: true,
                  },
                },
              },
            },
          },
        },

        payment: true,

        runner: {
          include: {
            user: {
              select: { name: true, phone: true },
            },
          },
        },

        batchOrders: {
          include: { batch: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return this.withPermittedActions(order, role || 'CUSTOMER');
  }

  /**
   * Update Order Status
   */
  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    userId: string,
    role: string,
    actorRunnerId?: string | null,
  ) {
    const {
      status,
      runnerId,
      trackingNumber,
      fulfillmentMethod,
      fulfillmentLocation,
      fulfillmentContact,
      fulfillmentNotes,
      procurementCity,
      procurementTripCode,
      rejectionReason,
    } = dto;

    const order = await this.findOne(id, userId, role, actorRunnerId);

    if (role === 'RUNNER' && order.runnerId !== actorRunnerId) {
      throw new ForbiddenException('Runner not assigned to this order');
    }

    if (role === 'RUNNER') {
      await this.assertRunnerOrderWorkflowAccess(actorRunnerId);
    }

    const previousStatus = order.status;

    if (!this.workflow.isValidTransition(previousStatus, status)) {
      throw new BadRequestException(
        `Invalid transition ${previousStatus} -> ${status}`,
      );
    }

    if (
      role === 'RUNNER' &&
      ![
        'PENDING_PAYMENT',
        'CANCELLED',
        'BUYING_TRIP_PLANNED',
        'BUYING_IN_PROGRESS',
        'PURCHASED_FROM_SHOPS',
        'ARRIVED_FOR_PACKING',
        'PACKED',
        'READY_FOR_HANDOVER',
        'OUT_FOR_HANDOVER',
        'SHIPPED',
        'COMPLETED',
      ].includes(status)
    ) {
      throw new ForbiddenException(
        'Runners can only update operational fulfillment statuses',
      );
    }

    if (
      role === 'CUSTOMER' &&
      ![
        OrderStatus.ORDER_CONFIRMED,
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.CANCELLED,
      ].includes(status)
    ) {
      throw new ForbiddenException(
        'Customers cannot update operational order statuses',
      );
    }

    if (runnerId && order.runnerId !== runnerId) {
      const runner = await this.prisma.runner.findUnique({
        where: { id: runnerId },
      });

      if (!runner || runner.status !== 'ACTIVE') {
        throw new BadRequestException('Invalid runner');
      }
    }

    const updateData: Prisma.OrderUpdateInput = { status };

    if (role === 'RUNNER' && status === 'PENDING_PAYMENT') {
      updateData.acceptedAt = new Date();
      updateData.rejectionReason = null;
    }
    if (role === 'RUNNER' && status === 'CANCELLED') {
      updateData.rejectedAt = new Date();
      updateData.rejectionReason =
        this.cleanOptionalText(rejectionReason) || 'Rejected by runner';
    }

    if (runnerId) {
      updateData.runner = { connect: { id: runnerId } };
    }

    if (trackingNumber) {
      const existing =
        typeof order.shippingAddress === 'object' &&
        order.shippingAddress !== null
          ? order.shippingAddress
          : {};

      updateData.shippingAddress = {
        ...(existing as Prisma.JsonObject),
        trackingNumber,
      };
    }

    if (fulfillmentMethod !== undefined) {
      updateData.fulfillmentMethod = this.cleanOptionalText(fulfillmentMethod);
    }

    if (fulfillmentLocation !== undefined) {
      updateData.fulfillmentLocation =
        this.cleanOptionalText(fulfillmentLocation);
    }

    if (fulfillmentContact !== undefined) {
      updateData.fulfillmentContact =
        this.cleanOptionalText(fulfillmentContact);
    }

    if (fulfillmentNotes !== undefined) {
      updateData.fulfillmentNotes = this.cleanOptionalText(fulfillmentNotes);
    }

    if (procurementCity !== undefined) {
      updateData.procurementCity = this.cleanOptionalText(procurementCity);
    }

    if (procurementTripCode !== undefined) {
      updateData.procurementTripCode =
        this.cleanOptionalText(procurementTripCode);
    }

    if (status === 'PURCHASED_FROM_SHOPS') {
      updateData.procuredAt = new Date();
    }

    if (status === 'PACKED') {
      updateData.packedAt = new Date();
    }

    if (['OUT_FOR_HANDOVER', 'COMPLETED'].includes(status)) {
      updateData.handedOverAt = new Date();
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: updateData,

      include: {
        items: {
          include: {
            listing: {
              include: {
                product: true,
                runner: {
                  select: { id: true, user: { select: { name: true } } },
                },
              },
            },
          },
        },

        payment: true,

        runner: {
          include: {
            user: { select: { name: true } },
          },
        },

        batchOrders: {
          include: { batch: true },
        },
      },
    });

    await this.workflow.handleStatusChange(
      id,
      previousStatus,
      status,
      updatedOrder,
    );

    await this.notifyOrderUpdate(updatedOrder, status);

    return this.withPermittedActions(updatedOrder, role);
  }

  private cleanOptionalText(value?: string | null) {
    const clean = String(value || '').trim();
    return clean || null;
  }

  async updateManualTracking(
    id: string,
    dto: UpdateManualOrderTrackingDto,
    userId: string,
    role: string,
    actorRunnerId?: string | null,
  ) {
    const order = await this.findOne(id, userId, role, actorRunnerId);

    if (role === 'RUNNER' && order.runnerId !== actorRunnerId) {
      throw new ForbiddenException('Runner not assigned to this order');
    }

    if (role === 'RUNNER') {
      await this.assertRunnerOrderWorkflowAccess(actorRunnerId);
    }

    if (!['RUNNER', 'ADMIN', 'SUPERUSER'].includes(role)) {
      throw new ForbiddenException(
        'Only runners or admins can update manual order tracking',
      );
    }

    if (
      role === 'RUNNER' &&
      dto.customerPaymentStatus === 'PAID' &&
      order.customerPaymentStatus !== 'SUBMITTED'
    ) {
      throw new BadRequestException(
        'Customer payment must be submitted before verification',
      );
    }

    const data: Prisma.OrderUpdateInput = {};
    const now = new Date();

    if (dto.customerPaymentStatus !== undefined) {
      const status = this.cleanStatus(dto.customerPaymentStatus);
      data.customerPaymentStatus = status;
      if (status === 'PAID') {
        data.customerPaidAt = now;
        data.paymentVerifiedAt = now;
        data.paymentVerifiedById = userId;
        if (
          [OrderStatus.CREATED, OrderStatus.PENDING_PAYMENT].includes(
            order.status as OrderStatus,
          )
        ) {
          data.status = OrderStatus.PAID;
        }
      }
    }

    if (dto.customerPaymentMethod !== undefined) {
      data.customerPaymentMethod = this.cleanOptionalText(
        dto.customerPaymentMethod,
      );
    }

    if (dto.customerPaymentReference !== undefined) {
      data.customerPaymentReference = this.cleanOptionalText(
        dto.customerPaymentReference,
      );
    }

    if (dto.customerPaymentProofUrl !== undefined) {
      data.customerPaymentProofUrl = this.cleanOptionalText(
        dto.customerPaymentProofUrl,
      );
    }

    if (dto.shopPaymentStatus !== undefined) {
      const status = this.cleanStatus(dto.shopPaymentStatus);
      data.shopPaymentStatus = status;
      if (status === 'PAID') data.shopPaidAt = now;
    }

    if (dto.shopPaymentMethod !== undefined) {
      data.shopPaymentMethod = this.cleanOptionalText(dto.shopPaymentMethod);
    }

    if (dto.shopPaymentReference !== undefined) {
      data.shopPaymentReference = this.cleanOptionalText(
        dto.shopPaymentReference,
      );
    }

    if (dto.shopPaymentProofUrl !== undefined) {
      data.shopPaymentProofUrl = this.cleanOptionalText(
        dto.shopPaymentProofUrl,
      );
    }

    if (dto.runnerPurchaseStatus !== undefined) {
      const status = this.cleanStatus(dto.runnerPurchaseStatus);
      data.runnerPurchaseStatus = status;
      if (status === 'BOUGHT') data.runnerBoughtAt = now;
    }

    if (dto.handoverStatus !== undefined) {
      const status = this.cleanStatus(dto.handoverStatus);
      data.handoverStatus = status;
      if (['DELIVERED', 'COLLECTED', 'SENT'].includes(status)) {
        data.deliveredCollectedAt = now;
      }
    }

    if (dto.shippingMode !== undefined) {
      data.shippingMode = this.cleanStatus(dto.shippingMode);
    }

    if (dto.shippingProvider !== undefined) {
      data.shippingProvider = this.cleanOptionalText(dto.shippingProvider);
    }

    if (dto.trackingNumber !== undefined) {
      data.trackingNumber = this.cleanOptionalText(dto.trackingNumber);
    }

    if (dto.shippingProviderMetadata !== undefined) {
      data.shippingProviderMetadata =
        dto.shippingProviderMetadata as Prisma.InputJsonValue;
    }

    const operationalBlockers = this.buildOperationalBlockers(order, data);
    data.operationalBlockers = operationalBlockers;
    data.automationConfidence = this.calculateAutomationConfidence(
      operationalBlockers,
      order,
      data,
    );
    data.supervisionMode = 'SUPERVISED';

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data,
      include: {
        items: {
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                        phone: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        manualPayments: true,
      },
    });

    if (dto.customerPaymentStatus === 'PAID') {
      await this.prisma.manualPaymentRecord.updateMany({
        where: { orderId: id, status: 'PENDING' },
        data: { status: 'VERIFIED', verifiedAt: now, verifiedById: userId },
      });
      await this.recordPlatformOrderFee(updatedOrder);
    } else if (dto.customerPaymentStatus === 'REJECTED') {
      await this.prisma.manualPaymentRecord.updateMany({
        where: { orderId: id, status: 'PENDING' },
        data: { status: 'REJECTED', verifiedAt: now, verifiedById: userId },
      });
    }

    if (order.status !== updatedOrder.status) {
      await this.workflow.handleStatusChange(
        id,
        order.status,
        updatedOrder.status,
        updatedOrder,
      );
    }

    if (dto.customerPaymentStatus === 'PAID') {
      await this.notifyOrderUpdate(updatedOrder, 'PAID');
    } else if (dto.customerPaymentStatus === 'REJECTED') {
      await this.notifyOrderUpdate(updatedOrder, 'PAYMENT_REJECTED');
    }

    if (dto.trackingNumber || dto.shippingProvider) {
      await this.notifyOrderUpdate(updatedOrder, 'TRACKING_UPDATED');
    }
    if (dto.handoverStatus === 'DELIVERED') {
      await this.notifyOrderUpdate(updatedOrder, 'HANDOVER_DELIVERED');
    } else if (dto.handoverStatus === 'COLLECTED') {
      await this.notifyOrderUpdate(updatedOrder, 'HANDOVER_COLLECTED');
    }

    return this.withPermittedActions(updatedOrder, role);
  }

  private buildOperationalBlockers(order: any, data: Prisma.OrderUpdateInput) {
    const next = {
      status: data.status || order.status,
      customerPaymentStatus:
        data.customerPaymentStatus || order.customerPaymentStatus,
      customerPaymentReference:
        data.customerPaymentReference ?? order.customerPaymentReference,
      customerPaymentProofUrl:
        data.customerPaymentProofUrl ?? order.customerPaymentProofUrl,
      runnerPurchaseStatus:
        data.runnerPurchaseStatus || order.runnerPurchaseStatus,
      handoverStatus: data.handoverStatus || order.handoverStatus,
      shippingMode: data.shippingMode || order.shippingMode,
      trackingNumber: data.trackingNumber ?? order.trackingNumber,
    };
    const blockers: string[] = [];

    if (next.customerPaymentStatus === 'SUBMITTED') {
      blockers.push('Customer payment proof needs runner verification');
    }
    if (next.customerPaymentStatus === 'REJECTED') {
      blockers.push('Customer payment proof was rejected');
    }
    if (
      next.customerPaymentStatus === 'PAID' &&
      !next.customerPaymentReference &&
      !next.customerPaymentProofUrl
    ) {
      blockers.push('Payment marked paid without reference or proof');
    }
    if (next.runnerPurchaseStatus === 'UNAVAILABLE') {
      blockers.push('One or more requested items are unavailable');
    }
    if (next.runnerPurchaseStatus === 'PARTIAL') {
      blockers.push('Runner purchase is partial and needs customer follow-up');
    }
    if (
      ['READY_FOR_HANDOVER', 'OUT_FOR_HANDOVER', 'SHIPPED'].includes(
        String(next.status),
      ) &&
      next.handoverStatus === 'PENDING'
    ) {
      blockers.push('Handover still needs runner confirmation');
    }
    if (
      ['PROVIDER_RATE_QUOTE', 'PROVIDER_LABELS'].includes(
        String(next.shippingMode),
      ) &&
      !next.trackingNumber
    ) {
      blockers.push(
        'Provider shipping selected without validated tracking metadata',
      );
    }

    return blockers;
  }

  private calculateAutomationConfidence(
    blockers: string[],
    order: any,
    data: Prisma.OrderUpdateInput,
  ) {
    if (blockers.length > 0) return 0.35;
    const paymentPaid =
      (data.customerPaymentStatus || order.customerPaymentStatus) === 'PAID';
    const purchased =
      (data.runnerPurchaseStatus || order.runnerPurchaseStatus) === 'BOUGHT';
    const handedOver = ['DELIVERED', 'COLLECTED', 'SENT'].includes(
      String(data.handoverStatus || order.handoverStatus),
    );
    const completedSteps = [paymentPaid, purchased, handedOver].filter(
      Boolean,
    ).length;
    return Number((0.55 + completedSteps * 0.15).toFixed(2));
  }

  async submitCustomerPayment(
    id: string,
    dto: SubmitCustomerPaymentDto,
    userId: string,
  ) {
    const order = await this.findOne(id, userId, 'CUSTOMER');

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'Wait for your runner to accept the order before submitting payment',
      );
    }

    const reference = this.cleanOptionalText(dto.reference);
    const proofUrl = this.cleanOptionalText(dto.proofUrl);
    if (!reference && !proofUrl && dto.method !== 'CASH') {
      throw new BadRequestException(
        'Add a payment reference or proof before submitting',
      );
    }

    if (reference) {
      const existing = await this.prisma.manualPaymentRecord.findFirst({
        where: {
          orderId: id,
          payerUserId: userId,
          method: dto.method,
          reference,
          status: { in: ['PENDING', 'VERIFIED'] },
        },
      });

      if (existing) {
        return { order, payment: existing, duplicate: true };
      }
    }

    const amount = roundMoney(dto.amount || order.totalAmount);
    const [updatedOrder, payment] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: {
          status:
            order.status === OrderStatus.CREATED
              ? OrderStatus.PENDING_PAYMENT
              : order.status,
          customerPaymentStatus: 'SUBMITTED',
          customerPaymentMethod: dto.method,
          customerPaymentReference: reference,
          customerPaymentProofUrl: proofUrl,
        },
        include: {
          items: {
            include: {
              listing: { include: { product: true } },
            },
          },
          runner: {
            include: { user: { select: { name: true, phone: true } } },
          },
        },
      }),
      this.prisma.manualPaymentRecord.create({
        data: {
          orderId: id,
          payerUserId: userId,
          amount,
          currency: 'ZAR',
          method: dto.method,
          reference,
          proofUrl,
          status: 'PENDING',
          notes: this.cleanOptionalText(dto.notes),
        },
      }),
    ]);

    await this.notifyRunnerAction(updatedOrder, 'PAYMENT_SUBMITTED');
    return {
      order: this.withPermittedActions(updatedOrder, 'CUSTOMER'),
      payment,
      duplicate: false,
    };
  }

  async attachCustomerPaymentProof(
    id: string,
    proofUrl: string,
    userId: string,
  ) {
    await this.findOne(id, userId, 'CUSTOMER');
    return { orderId: id, proofUrl };
  }

  private cleanStatus(value: string) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  private async recordPlatformOrderFee(order: {
    id: string;
    runnerId?: string | null;
  }) {
    if (!order.runnerId) return null;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        runnerId: order.runnerId,
        audience: 'RUNNER',
        status: 'ACTIVE',
        orderWorkflowAddonEnabled: true,
      },
      orderBy: { currentPeriodStart: 'desc' },
    });

    if (!subscription || subscription.perConfirmedOrderFee <= 0) return null;

    return this.prisma.platformBillingEvent.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        runnerId: order.runnerId,
        subscriptionId: subscription.id,
        type: 'CONFIRMED_ORDER',
        amount: roundMoney(subscription.perConfirmedOrderFee),
        currency: subscription.currency || 'ZAR',
        status: 'CHARGEABLE',
      },
      update: {},
    });
  }

  private async reversePlatformOrderFee(orderId: string, reason: string) {
    const event = await this.prisma.platformBillingEvent.findUnique({
      where: { orderId },
      include: { invoice: true },
    });

    if (!event || ['REVERSED', 'CREDIT_PENDING'].includes(event.status)) {
      return null;
    }

    const reversalData = {
      reversedAt: new Date(),
      reversalReason: reason,
    };

    if (event.status === 'CHARGEABLE') {
      return this.prisma.platformBillingEvent.update({
        where: { id: event.id },
        data: { ...reversalData, status: 'REVERSED' },
      });
    }

    if (event.status === 'INVOICED' && event.invoice) {
      if (event.invoice.status === 'PAID') {
        return this.prisma.platformBillingEvent.update({
          where: { id: event.id },
          data: { ...reversalData, status: 'CREDIT_PENDING' },
        });
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.platformInvoice.update({
          where: { id: event.invoiceId! },
          data: {
            orderFees: Math.max(0, event.invoice!.orderFees - event.amount),
            subtotal: Math.max(0, event.invoice!.subtotal - event.amount),
            total: Math.max(0, event.invoice!.total - event.amount),
          },
        });
        return tx.platformBillingEvent.update({
          where: { id: event.id },
          data: { ...reversalData, status: 'REVERSED' },
        });
      });
    }

    return null;
  }

  /**
   * Cancel Order
   */
  async cancelOrder(
    id: string,
    userId: string,
    role: string,
    runnerId?: string | null,
  ) {
    const order = await this.findOne(id, userId, role, runnerId);

    if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      throw new BadRequestException('Cannot cancel completed/cancelled order');
    }
    if (
      role === 'CUSTOMER' &&
      !['AWAITING_RUNNER_ACCEPTANCE', 'PENDING_PAYMENT'].includes(order.status)
    ) {
      throw new BadRequestException(
        'Customer cancellation is only available before runner purchasing begins',
      );
    }

    await this.updateStatus(
      id,
      { status: OrderStatus.CANCELLED },
      userId,
      role,
      runnerId,
    );

    if (order.runnerPurchaseStatus === 'NOT_BOUGHT') {
      await this.reversePlatformOrderFee(
        order.id,
        'Order cancelled before runner purchase',
      );
    }

    return {
      message: 'Order cancelled successfully',
      orderId: id,
      previousStatus: order.status,
      newStatus: OrderStatus.CANCELLED,
    };
  }

  /**
   * Confirm Payment
   */
  async confirmPayment(
    orderId: string,
    transactionId: string,
    userId?: string,
    role?: string,
    runnerId?: string | null,
  ) {
    const order = await this.findOne(orderId, userId, role, runnerId);

    if (role === 'RUNNER') {
      await this.assertRunnerOrderWorkflowAccess(runnerId);
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order must be pending payment');
    }

    const [updatedOrder] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID },
      }),

      this.prisma.payment.create({
        data: {
          orderId,
          amount: order.totalAmount,
          method: 'ONLINE',
          status: 'COMPLETED',
          transactionId,
        },
      }),
    ]);

    await this.workflow.handleStatusChange(
      orderId,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
      updatedOrder,
    );

    await this.recordPlatformOrderFee(updatedOrder);

    return updatedOrder;
  }

  async adminUpdate(id: string, dto: Record<string, unknown>) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const textFields = [
      'customerPhone',
      'status',
      'notes',
      'customerPaymentStatus',
      'customerPaymentMethod',
      'customerPaymentReference',
      'customerPaymentProofUrl',
      'shopPaymentStatus',
      'shopPaymentMethod',
      'shopPaymentReference',
      'shopPaymentProofUrl',
      'runnerPurchaseStatus',
      'handoverStatus',
      'fulfillmentMethod',
      'fulfillmentLocation',
      'fulfillmentContact',
      'fulfillmentNotes',
      'procurementCity',
      'procurementTripCode',
      'shippingMethod',
      'shippingProvider',
      'trackingNumber',
    ];
    const numberFields = [
      'totalAmount',
      'subtotal',
      'tax',
      'shippingFee',
      'weight',
    ];

    const data: Record<string, unknown> = {};

    for (const field of textFields) {
      if (Object.prototype.hasOwnProperty.call(dto, field)) {
        const value = dto[field];
        data[field] =
          value === null || value === undefined ? null : String(value).trim();
      }
    }

    for (const field of numberFields) {
      if (Object.prototype.hasOwnProperty.call(dto, field)) {
        const value = dto[field];
        if (value === null || value === undefined || value === '') {
          data[field] = null;
          continue;
        }

        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) {
          throw new BadRequestException(`${field} must be a valid number`);
        }
        data[field] = numberValue;
      }
    }

    if (Object.prototype.hasOwnProperty.call(dto, 'shippingAddress')) {
      data.shippingAddress =
        dto.shippingAddress === undefined
          ? Prisma.JsonNull
          : (dto.shippingAddress as Prisma.InputJsonValue);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No supported order fields supplied');
    }

    return this.prisma.order.update({
      where: { id },
      data: data as Prisma.OrderUncheckedUpdateInput,
      include: {
        items: {
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        manualPayments: true,
        payment: true,
        runner: { include: { user: { select: { name: true, phone: true } } } },
      },
    });
  }

  async adminDelete(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const whatsappOrderRequests = await tx.whatsAppOrderRequest.deleteMany({
        where: { orderId: id },
      });
      const reviews = await tx.review.deleteMany({ where: { orderId: id } });
      const inventoryReservations = await tx.inventoryReservation.deleteMany({
        where: { orderId: id },
      });
      const returnRequests = await tx.returnRequest.deleteMany({
        where: { orderId: id },
      });
      const manualPayments = await tx.manualPaymentRecord.deleteMany({
        where: { orderId: id },
      });
      const payments = await tx.payment.deleteMany({ where: { orderId: id } });
      const batchOrders = await tx.batchOrder.deleteMany({
        where: { orderId: id },
      });
      const couponUsages = await tx.couponUsage.deleteMany({
        where: { orderId: id },
      });
      const orderItems = await tx.orderItem.deleteMany({
        where: { orderId: id },
      });
      await tx.order.delete({ where: { id } });

      return {
        whatsappOrderRequests: whatsappOrderRequests.count,
        reviews: reviews.count,
        inventoryReservations: inventoryReservations.count,
        returnRequests: returnRequests.count,
        manualPayments: manualPayments.count,
        payments: payments.count,
        batchOrders: batchOrders.count,
        couponUsages: couponUsages.count,
        orderItems: orderItems.count,
        orders: 1,
      };
    });

    return {
      message: 'Order permanently deleted',
      deleted,
    };
  }

  /**
   * Orders for Shop
   */
  async findByShop(shopId: string, userId: string, role: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { ownerId: true },
    });

    if (!shop) {
      throw new NotFoundException(`Shop ${shopId} not found`);
    }

    if (!['ADMIN', 'SUPERUSER'].includes(role) && shop.ownerId !== userId) {
      throw new ForbiddenException('You can only view orders for your shops');
    }

    return this.prisma.order.findMany({
      where: {
        items: {
          some: {
            listing: {
              product: { shopId },
            },
          },
        },
      },

      include: {
        items: {
          include: {
            listing: {
              include: {
                product: {
                  include: {
                    shop: { select: { name: true } },
                  },
                },
              },
            },
          },
        },

        runner: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
      },

      orderBy: { createdAt: 'desc' },
    });
  }

  private withPermittedActions(order: any, role: string) {
    const actions: string[] = [];
    if (role === 'RUNNER') {
      if (order.status === 'PENDING_RUNNER_ACTIVATION')
        actions.push('INVITE_RUNNER_TO_ACTIVATE');
      if (order.status === 'AWAITING_RUNNER_ACCEPTANCE')
        actions.push('ACCEPT', 'REJECT');
      if (order.customerPaymentStatus === 'SUBMITTED')
        actions.push('VERIFY_PAYMENT', 'REJECT_PAYMENT');
      const nextByStatus: Record<string, string> = {
        PAID: 'BUYING_TRIP_PLANNED',
        BUYING_TRIP_PLANNED: 'BUYING_IN_PROGRESS',
        BUYING_IN_PROGRESS: 'PURCHASED_FROM_SHOPS',
        PURCHASED_FROM_SHOPS: 'ARRIVED_FOR_PACKING',
        ARRIVED_FOR_PACKING: 'PACKED',
        PACKED: 'READY_FOR_HANDOVER',
        READY_FOR_HANDOVER: 'OUT_FOR_HANDOVER',
        OUT_FOR_HANDOVER: 'COMPLETED',
        SHIPPED: 'COMPLETED',
      };
      if (nextByStatus[order.status]) actions.push(nextByStatus[order.status]);
    }
    if (role === 'CUSTOMER') {
      if (order.status === 'PENDING_PAYMENT') actions.push('SUBMIT_PAYMENT');
      if (
        ['AWAITING_RUNNER_ACCEPTANCE', 'PENDING_PAYMENT'].includes(order.status)
      )
        actions.push('CANCEL');
    }
    return { ...order, permittedActions: actions };
  }

  private cityLabel(city: string) {
    return (
      String(city || '').charAt(0) +
      String(city || '')
        .slice(1)
        .toLowerCase()
    );
  }

  private async assertRunnerOrderWorkflowAccess(runnerId?: string | null) {
    if (!runnerId) {
      throw new ForbiddenException('Runner profile required');
    }

    const hasAccess = await this.runnerHasOrderWorkflow(runnerId);
    if (!hasAccess) {
      throw new ForbiddenException(
        'Phase 2 order management is available only to runners with an active order workflow subscription.',
      );
    }
  }

  private async runnerHasOrderWorkflow(runnerId?: string | null) {
    if (!runnerId) return false;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        runnerId,
        audience: 'RUNNER',
        status: 'ACTIVE',
        orderWorkflowAddonEnabled: true,
        currentPeriodEnd: { gt: new Date() },
      },
      select: { id: true },
    });

    return Boolean(subscription);
  }

  private async notifyOrderUpdate(orderValue: any, event: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderValue.id },
      include: {
        customer: { select: { id: true } },
        runner: {
          include: {
            user: { select: { id: true, name: true, phone: true } },
            bridgeAccount: { select: { id: true } },
          },
        },
      },
    });
    if (!order) return;
    const messages: Record<string, string> = {
      PENDING_RUNNER_ACTIVATION:
        'Your order was captured, but your trusted runner still needs to activate Phase 2 order management before they can manage it here.',
      AWAITING_RUNNER_ACCEPTANCE:
        'Your order was sent to your trusted runner for acceptance.',
      PENDING_PAYMENT:
        'Your runner accepted the order. You can now submit payment.',
      PAID: 'Your runner verified your payment.',
      PAYMENT_REJECTED:
        'Your runner could not verify the payment. Review the reference or proof and submit again.',
      BUYING_TRIP_PLANNED: 'Your runner has planned the buying trip.',
      BUYING_IN_PROGRESS: 'Your runner is buying from the shops.',
      PURCHASED_FROM_SHOPS: 'Your items were purchased from the shops.',
      ARRIVED_FOR_PACKING:
        'Your runner has returned and is preparing orders for packing.',
      PACKED: 'Your order has been packed.',
      READY_FOR_HANDOVER: 'Your order is ready for delivery or collection.',
      OUT_FOR_HANDOVER: 'Your order is on its way.',
      SHIPPED: 'Your order has been sent.',
      TRACKING_UPDATED: 'Tracking or handover details were updated.',
      HANDOVER_DELIVERED: 'Your order has been marked delivered.',
      HANDOVER_COLLECTED: 'Your order has been marked collected.',
      COMPLETED: 'Your order is complete.',
      CANCELLED: order.rejectionReason || 'Your order was cancelled.',
    };
    const message =
      messages[event] ||
      `Order status updated to ${event.replaceAll('_', ' ').toLowerCase()}.`;
    if (order.customerId) {
      await this.prisma.notification.create({
        data: {
          userId: order.customerId,
          title: 'Order update',
          message,
          type: 'ORDER',
          channel: 'IN_APP',
          status: 'SENT',
          sentAt: new Date(),
          metadata: { orderId: order.id, status: event },
        },
      });
    }
    const bridgeAccountId =
      order.runner?.bridgeAccount?.id || (await this.primaryOutboundBridgeId());
    if (bridgeAccountId && order.customerPhone) {
      await this.prisma.whatsAppOutboundMessage.create({
        data: {
          bridgeAccountId,
          recipientPhone: order.customerPhone,
          messageType: 'TEXT',
          messageText: `Runner Commerce order ${order.id.slice(-8)}\n${message}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }
    if (event === 'AWAITING_RUNNER_ACCEPTANCE') {
      await this.notifyRunnerAction(order, event);
    }
  }

  private async notifyRunnerAction(orderValue: any, event: string) {
    const order = orderValue.runner?.user?.id
      ? orderValue
      : await this.prisma.order.findUnique({
          where: { id: orderValue.id },
          include: { runner: { include: { user: true } } },
        });
    if (!order?.runner?.user?.id) return;
    const payment = event === 'PAYMENT_SUBMITTED';
    await this.prisma.notification.create({
      data: {
        userId: order.runner.user.id,
        title: payment
          ? 'Payment needs verification'
          : 'New order needs acceptance',
        message: payment
          ? `Customer payment for order ${order.id.slice(-8)} is ready for verification.`
          : `A ${this.cityLabel(order.procurementCity || 'DURBAN')} customer order is waiting for your decision.`,
        type: 'ORDER_ACTION',
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
        metadata: { orderId: order.id, action: event },
      },
    });
  }

  private async primaryOutboundBridgeId() {
    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: { status: 'ONLINE', archivedAt: null, mode: { not: 'PAUSED' } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true },
    });
    return bridge?.id || null;
  }

  private cleanCustomerImageUrls(value?: unknown) {
    return Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((url) => String(url || '').trim())
              .filter(
                (url) =>
                  url.startsWith('/uploads/') || url.includes('/uploads/'),
              ),
          ),
        ].slice(0, 6)
      : [];
  }
}
