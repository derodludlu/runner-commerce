import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnDto } from './dto/update-return.dto';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class ReturnsService {
  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
  ) {}

  /**
   * Create return request
   */
  async createReturn(customerId: string, dto: CreateReturnDto) {
    const { orderId, orderItemId, reason, description, refundType, images } =
      dto;

    // Verify order exists and belongs to customer
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: {
        items: {
          where: orderItemId ? { id: orderItemId } : undefined,
        },
        runner: {
          select: {
            refundMode: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!['COMPLETED', 'SHIPPED'].includes(order.status)) {
      throw new BadRequestException(
        'Can only return completed or shipped orders',
      );
    }

    // Calculate refund amount
    let refundAmount = 0;
    if (orderItemId) {
      const item: any = order.items.find((i: any) => i.id === orderItemId);
      if (item) {
        refundAmount = item.unitPrice * item.quantity;
      }
    } else {
      refundAmount = order.totalAmount;
    }

    // Generate RMA number
    const rmaNumber = `RMA-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const returnRequest = await this.prisma.returnRequest.create({
      data: {
        orderId,
        orderItemId,
        customerId,
        reason,
        description: description || null,
        status: 'PENDING',
        refundAmount,
        refundType: refundType || 'ORIGINAL_PAYMENT',
        refundMode:
          refundType === 'STORE_CREDIT' || refundType === 'EXCHANGE'
            ? 'STORE_CREDIT_OR_EXCHANGE'
            : order.runner?.refundMode || 'MANUAL_REFUND_ONLY',
        refundStatus: 'NOT_STARTED',
        images: images || undefined,
        rmaNumber,
      },
      include: {
        order: {
          include: {
            items: true,
          },
        },
      },
    });

    return returnRequest;
  }

  /**
   * Get return request by ID
   */
  async getReturn(id: string, userId: string, role: string) {
    const where: any = { id };

    if (role === 'CUSTOMER') {
      where.order = { customerId: userId };
    }

    const returnRequest = await this.prisma.returnRequest.findFirst({
      where,
      include: {
        order: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    return returnRequest;
  }

  /**
   * Get all returns (Admin)
   */
  async getAllReturns(status?: string) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    return this.prisma.returnRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            customer: {
              select: {
                name: true,
                phone: true,
              },
            },
            totalAmount: true,
          },
        },
      },
    });
  }

  /**
   * Update return request status
   */
  async updateReturnStatus(id: string, status: string, adminId: string) {
    // Verify return exists
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    // Update status
    const updatedReturn = await this.prisma.returnRequest.update({
      where: { id },
      data: {
        status,
        resolvedAt: status !== 'PENDING' ? new Date() : null,
      },
      include: {
        order: {
          include: {
            customer: true,
            items: true,
          },
        },
      },
    });

    // Create notification for customer
    if (updatedReturn.order.customerId) {
      await this.prisma.notification.create({
        data: {
          userId: updatedReturn.order.customerId,
          title: `Return Request ${status}`,
          message: `Your return request has been ${status.toLowerCase()}.`,
          type: status === 'APPROVED' ? 'SUCCESS' : 'INFO',
          channel: 'IN_APP',
          status: 'SENT',
        },
      });
    }

    if (status === 'APPROVED') {
      return this.processApprovedReturnRefund(updatedReturn.id, adminId);
    }

    return updatedReturn;
  }

  private async processApprovedReturnRefund(
    returnRequestId: string,
    adminId: string,
  ) {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id: returnRequestId },
      include: {
        order: {
          include: {
            payment: true,
            runner: {
              select: { refundMode: true },
            },
          },
        },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    if (returnRequest.refundStatus !== 'NOT_STARTED') {
      return returnRequest;
    }

    const approvedAmount =
      returnRequest.approvedRefundAmount || returnRequest.refundAmount;
    const mode =
      returnRequest.refundType === 'STORE_CREDIT' ||
      returnRequest.refundType === 'EXCHANGE'
        ? 'STORE_CREDIT_OR_EXCHANGE'
        : returnRequest.refundMode ||
          returnRequest.order.runner?.refundMode ||
          'MANUAL_REFUND_ONLY';

    if (
      mode === 'STRIPE_ELIGIBLE' &&
      returnRequest.order.payment?.stripePaymentIntentId &&
      ['COMPLETED', 'SUCCEEDED'].includes(returnRequest.order.payment.status)
    ) {
      try {
        const payment = await this.paymentsService.refundPayment(
          returnRequest.order.payment.id,
          adminId,
          'ADMIN',
          approvedAmount,
          `Return ${returnRequest.rmaNumber}`,
        );
        await this.prisma.refundAudit.create({
          data: {
            returnRequestId: returnRequest.id,
            orderId: returnRequest.orderId,
            actorUserId: adminId,
            action: 'STRIPE_REFUND_CREATED',
            refundMode: mode,
            requestedAmount: returnRequest.refundAmount,
            approvedAmount,
            processorReference: payment.stripePaymentIntentId,
            status: 'COMPLETED',
          },
        });
        return this.prisma.returnRequest.update({
          where: { id: returnRequest.id },
          data: {
            refundMode: mode,
            refundStatus: 'COMPLETED',
            approvedRefundAmount: approvedAmount,
            refundProcessorReference: payment.stripePaymentIntentId,
            refundHandledById: adminId,
            refundHandledAt: new Date(),
          },
          include: { refundAudits: true },
        });
      } catch (error) {
        await this.prisma.refundAudit.create({
          data: {
            returnRequestId: returnRequest.id,
            orderId: returnRequest.orderId,
            actorUserId: adminId,
            action: 'STRIPE_REFUND_FAILED',
            refundMode: mode,
            requestedAmount: returnRequest.refundAmount,
            approvedAmount,
            status: 'FAILED',
            notes:
              error instanceof Error
                ? error.message
                : 'Stripe refund failed unexpectedly',
          },
        });
        return this.prisma.returnRequest.update({
          where: { id: returnRequest.id },
          data: {
            refundMode: mode,
            refundStatus: 'ACTION_REQUIRED',
            approvedRefundAmount: approvedAmount,
            refundHandledById: adminId,
            refundHandledAt: new Date(),
          },
          include: { refundAudits: true },
        });
      }
    }

    const action =
      mode === 'STORE_CREDIT_OR_EXCHANGE'
        ? 'STORE_CREDIT_OR_EXCHANGE_REQUIRED'
        : 'MANUAL_REFUND_TASK_CREATED';
    await this.prisma.refundAudit.create({
      data: {
        returnRequestId: returnRequest.id,
        orderId: returnRequest.orderId,
        actorUserId: adminId,
        action,
        refundMode: mode,
        requestedAmount: returnRequest.refundAmount,
        approvedAmount,
        status: 'PENDING',
        notes:
          mode === 'STRIPE_ELIGIBLE'
            ? 'Stripe mode selected, but the order payment is not Stripe-processed.'
            : 'Manual refund handling required.',
      },
    });

    return this.prisma.returnRequest.update({
      where: { id: returnRequest.id },
      data: {
        refundMode: mode,
        refundStatus:
          mode === 'STORE_CREDIT_OR_EXCHANGE'
            ? 'STORE_CREDIT_PENDING'
            : 'MANUAL_ACTION_REQUIRED',
        approvedRefundAmount: approvedAmount,
      },
      include: { refundAudits: true },
    });
  }

  /**
   * Get customer returns
   */
  async getCustomerReturns(customerId: string) {
    return this.prisma.returnRequest.findMany({
      where: {
        order: {
          customerId,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            totalAmount: true,
          },
        },
      },
    });
  }

  /**
   * Update return request
   */
  async updateReturn(
    id: string,
    dto: UpdateReturnDto,
    userId: string,
    role: string,
  ) {
    // Only admins can update returns
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can update returns');
    }

    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    // Update the return record
    return this.prisma.returnRequest.update({
      where: { id },
      data: {
        ...dto,
        resolvedAt: dto.status && dto.status !== 'PENDING' ? new Date() : null,
      },
      include: {
        order: {
          include: {
            customer: true,
            items: true,
          },
        },
      },
    });
  }

  /**
   * Approve return request
   */
  async approveReturn(id: string, userId: string, role: string) {
    // Only admins can approve returns
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can approve returns');
    }

    return this.updateReturnStatus(id, 'APPROVED', userId);
  }

  /**
   * Reject return request
   */
  async rejectReturn(id: string, reason: string, userId: string, role: string) {
    // Only admins can reject returns
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can reject returns');
    }

    // We can add the rejection reason to the notes field
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return request not found');
    }

    // Update status and add reason if provided
    if (reason) {
      await this.prisma.returnRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          notes:
            `${returnRequest.notes || ''}\nRejection reason: ${reason}`.trim(),
          resolvedAt: new Date(),
        },
      });
    }

    return this.updateReturnStatus(id, 'REJECTED', userId);
  }

  /**
   * Get return statistics
   */
  async getReturnStats() {
    const [
      totalReturns,
      pendingReturns,
      approvedReturns,
      rejectedReturns,
      totalRefundAmount,
    ] = await Promise.all([
      this.prisma.returnRequest.count(),
      this.prisma.returnRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.returnRequest.count({ where: { status: 'APPROVED' } }),
      this.prisma.returnRequest.count({ where: { status: 'REJECTED' } }),
      this.prisma.returnRequest.aggregate({
        _sum: { refundAmount: true },
        where: { status: 'APPROVED' },
      }),
    ]);

    return {
      total: totalReturns,
      pending: pendingReturns,
      approved: approvedReturns,
      rejected: rejectedReturns,
      totalRefundAmount: totalRefundAmount._sum.refundAmount || 0,
    };
  }
}
