import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationsService {
  private transporter: any;
  private emailEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const smtpHost = this.configService.get('SMTP_HOST');
    const smtpUser = this.configService.get('SMTP_USER');
    const smtpPass = this.configService.get('SMTP_PASS');

    this.emailEnabled = !!(smtpHost && smtpUser && smtpPass);

    if (this.emailEnabled) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: this.configService.get('SMTP_PORT', 587),
        secure: false,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    }
  }

  /**
   * Create and send notification
   */
  async createAndSend(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        message: dto.message,
        type: dto.type,
        channel: dto.channel,
        metadata: dto.metadata,
      },
    });

    // Send based on channel
    if (dto.channel === 'EMAIL' && this.emailEnabled) {
      await this.sendEmail(notification);
    }

    // For SMS and Push, you would integrate with respective services
    // Twilio for SMS, Firebase for Push notifications

    return notification;
  }

  /**
   * Send email notification
   */
  private async sendEmail(notification: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: notification.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED' },
      });
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.configService.get(
          'EMAIL_FROM',
          'noreply@runnercommerce.com',
        ),
        to: user.email,
        subject: notification.title,
        html: this.renderEmail(notification),
      });

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'DELIVERED',
          sentAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...(notification.metadata || {}),
            error: (error as any).message,
          },
        },
      });
    }
  }

  /**
   * Render email HTML
   */
  private renderEmail(notification: any) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
            .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${notification.title}</h1>
            </div>
            <div class="content">
              <p>${notification.message}</p>
              ${this.getActionButton(notification)}
            </div>
            <div class="footer">
              <p>&copy; 2026 Runner Commerce. All rights reserved.</p>
              <p>You're receiving this email because you have notifications enabled.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Get action button based on notification type
   */
  private getActionButton(notification: any) {
    const baseUrl = this.configService.get(
      'FRONTEND_URL',
      'http://localhost:3000',
    );

    switch (notification.type) {
      case 'ORDER':
        const orderId = notification.metadata?.orderId;
        if (orderId) {
          return `<p><a href="${baseUrl}/orders/${orderId}" class="button">View Order</a></p>`;
        }
        break;
      case 'PAYMENT':
        const paymentId = notification.metadata?.paymentId;
        if (paymentId) {
          return `<p><a href="${baseUrl}/orders" class="button">View Payment</a></p>`;
        }
        break;
    }
    return '';
  }

  /**
   * Send order notification
   */
  async sendOrderNotification(userId: string, order: any, status: string) {
    const titles: Record<string, string> = {
      CREATED: 'Order Created Successfully',
      PAID: 'Payment Confirmed',
      BATCHED: 'Order Being Prepared',
      PICKED: 'Order Picked',
      PACKED: 'Order Packed',
      SHIPPED: 'Order Shipped',
      COMPLETED: 'Order Delivered',
      CANCELLED: 'Order Cancelled',
    };

    const messages: Record<string, string> = {
      CREATED: `Your order #${order.id} has been created successfully.`,
      PAID: `Your payment for order #${order.id} has been confirmed.`,
      BATCHED: `Your order #${order.id} is being prepared.`,
      PICKED: `Your order #${order.id} has been picked.`,
      PACKED: `Your order #${order.id} has been packed and will ship soon.`,
      SHIPPED: `Great news! Your order #${order.id} has been shipped.`,
      COMPLETED: `Your order #${order.id} has been delivered. Enjoy!`,
      CANCELLED: `Your order #${order.id} has been cancelled.`,
    };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPref: true },
    });

    if (!user?.notificationPref?.orderUpdates) {
      return;
    }

    if (user.notificationPref.email) {
      await this.createAndSend({
        userId,
        title: titles[status] || 'Order Update',
        message:
          messages[status] || `Your order status has been updated to ${status}`,
        type: 'ORDER',
        channel: 'EMAIL',
        metadata: { orderId: order.id, status },
      });
    }

    // Also create in-app notification
    await this.prisma.notification.create({
      data: {
        userId,
        title: titles[status] || 'Order Update',
        message:
          messages[status] || `Your order status has been updated to ${status}`,
        type: 'ORDER',
        channel: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
        metadata: { orderId: order.id, status },
      },
    });
  }

  /**
   * Send payment notification
   */
  async sendPaymentNotification(userId: string, payment: any, status: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPref: true },
    });

    if (!user?.notificationPref?.orderUpdates) {
      return;
    }

    const title =
      status === 'COMPLETED'
        ? 'Payment Successful'
        : status === 'FAILED'
          ? 'Payment Failed'
          : 'Payment Update';

    const message =
      status === 'COMPLETED'
        ? `Your payment of $${payment.amount} has been processed successfully.`
        : status === 'FAILED'
          ? `Your payment of $${payment.amount} failed. Please try again.`
          : `Your payment status has been updated to ${status}`;

    if (user.notificationPref.email) {
      await this.createAndSend({
        userId,
        title,
        message,
        type: 'PAYMENT',
        channel: 'EMAIL',
        metadata: { paymentId: payment.id, amount: payment.amount, status },
      });
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'DELIVERED' },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        status: 'PENDING',
      },
      data: { status: 'DELIVERED' },
    });

    return { message: 'All notifications marked as read' };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        status: 'PENDING',
      },
    });

    return { unreadCount: count };
  }

  /**
   * Update notification preferences - modified to use existing schema
   */
  async updatePreferences(userId: string, prefs: any) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        email: prefs.email,
        sms: prefs.sms,
        push: prefs.push,
        orderUpdates: prefs.orderUpdates,
        promotions: prefs.promotions,
      },
      create: {
        userId,
        email: prefs.email ?? true,
        sms: prefs.sms ?? false,
        push: prefs.push ?? true,
        orderUpdates: prefs.orderUpdates ?? true,
        promotions: prefs.promotions ?? false,
      },
    });
  }

  /**
   * Get notification preferences - modified to use existing schema
   */
  async getPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Return default preferences since our schema doesn't have a dedicated table
    return {
      userId: userId,
      email: prefs?.email ?? true,
      sms: prefs?.sms ?? false,
      push: prefs?.push ?? true,
      orderUpdates: prefs?.orderUpdates ?? true,
      promotional: prefs?.promotions ?? false,
      updatedAt: prefs?.updatedAt,
    };
  }
}
