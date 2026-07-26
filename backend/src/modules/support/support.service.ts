import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create support ticket
   */
  async createTicket(customerId: string, dto: CreateTicketDto) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        customerId,
        subject: dto.subject,
        description: dto.description,
        category: (dto.category as string) || 'OTHER',
        priority: dto.priority,
        status: 'OPEN',
      },
    });

    return ticket;
  }

  /**
   * Get ticket by ID
   */
  async getTicket(id: string, userId: string, role: string) {
    const where: any = { id };

    if (role === 'CUSTOMER') {
      where.customerId = userId;
    }

    const ticket = await this.prisma.supportTicket.findFirst({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  /**
   * Get all tickets (Admin)
   */
  async getAllTickets(status?: string, priority?: string, category?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;

    return this.prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Get customer tickets
   */
  async getCustomerTickets(customerId: string) {
    return this.prisma.supportTicket.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Update ticket
   */
  async updateTicket(
    id: string,
    dto: UpdateTicketDto,
    userId: string,
    role: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Customers can only update their own tickets
    if (role === 'CUSTOMER' && ticket.customerId !== userId) {
      throw new ForbiddenException('Not authorized to update this ticket');
    }

    // Only admins can assign tickets or change status to resolved
    if (dto.assignedTo && role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can assign tickets');
    }

    if (
      dto.status === 'RESOLVED' ||
      (dto.status === 'CLOSED' && role !== 'ADMIN')
    ) {
      (dto as any).resolvedAt = new Date();
    }

    return this.prisma.supportTicket.update({
      where: { id },
      data: dto,
      include: {
        messages: true,
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Add message to ticket
   */
  async addMessage(
    ticketId: string,
    senderId: string,
    dto: CreateMessageDto,
    role: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Verify sender is customer or admin
    if (role === 'CUSTOMER' && ticket.customerId !== senderId) {
      throw new ForbiddenException('Not authorized to message this ticket');
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId,
        message: dto.message,
        isInternal: dto.isInternal || false,
        attachments: dto.attachments || null,
      },
    });

    // Update ticket updated_at
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: role === 'ADMIN' ? 'IN_PROGRESS' : 'WAITING_CUSTOMER',
      },
    });

    return message;
  }

  /**
   * Assign ticket to admin
   */
  async assignTicket(ticketId: string, adminId: string) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: adminId,
        status: 'IN_PROGRESS',
      },
    });
  }

  /**
   * Resolve ticket
   */
  async resolveTicket(ticketId: string, userId: string, role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can resolve tickets');
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Get ticket statistics
   */
  async getTicketStats() {
    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
    ] = await Promise.all([
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
      this.prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
    ]);

    return {
      total: totalTickets,
      open: openTickets,
      inProgress: inProgressTickets,
      resolved: resolvedTickets,
      closed: closedTickets,
    };
  }

  /**
   * Get tickets by category
   */
  async getTicketsByCategory() {
    const categories = await this.prisma.supportTicket.groupBy({
      by: ['category'],
      _count: {
        id: true,
      },
    });

    return categories.map((cat: any) => ({
      category: cat.category,
      count: cat._count.id,
    }));
  }
}
