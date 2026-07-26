import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const PROCUREMENT_CITIES = ['DURBAN', 'JOHANNESBURG', 'MAPUTO'] as const;

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  listPreferences(customerId: string) {
    return this.prisma.customerRunnerPreference.findMany({
      where: { customerId },
      include: {
        runner: { include: { user: { select: { name: true, phone: true } } } },
      },
      orderBy: { city: 'asc' },
    });
  }

  async upsertPreference(
    customerId: string,
    cityValue: string,
    runnerPhoneValue: string,
  ) {
    const city = this.city(cityValue);
    const runnerPhone = this.phone(runnerPhoneValue);
    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { phone: true },
    });
    const existing = await this.prisma.customerRunnerPreference.findUnique({
      where: { customerId_city: { customerId, city } },
    });
    const runner = await this.findRunner(runnerPhone, city);
    await this.assertNoOpenGroupConflict(
      customerId,
      customer?.phone,
      city,
      runner?.id,
    );
    const status = runner ? 'MATCHED' : 'PENDING_MATCH';
    const preference = await this.prisma.customerRunnerPreference.upsert({
      where: { customerId_city: { customerId, city } },
      create: {
        customerId,
        city,
        runnerPhone,
        runnerId: runner?.id,
        status,
        matchedAt: runner ? new Date() : null,
      },
      update: {
        runnerPhone,
        runnerId: runner?.id ?? null,
        status,
        matchedAt: runner ? new Date() : null,
        replacedAt:
          existing && existing.runnerPhone !== runnerPhone
            ? new Date()
            : existing?.replacedAt,
      },
      include: {
        runner: { include: { user: { select: { name: true, phone: true } } } },
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: customerId,
        action: existing
          ? 'CUSTOMER_RUNNER_PREFERENCE_REPLACED'
          : 'CUSTOMER_RUNNER_PREFERENCE_CREATED',
        entityType: 'CustomerRunnerPreference',
        entityId: preference.id,
        summary: `${city} runner preference ${status.toLowerCase()}`,
        metadata: {
          city,
          previousPhone: existing?.runnerPhone ?? null,
          runnerPhone,
          runnerId: runner?.id ?? null,
        },
      },
    });

    if (runner?.userId) {
      await this.prisma.notification.create({
        data: {
          userId: runner.userId,
          title: 'Customer selected you as runner',
          message: `A customer selected you as their trusted ${this.title(city)} runner.`,
          type: 'RUNNER_PREFERENCE',
          channel: 'IN_APP',
          status: 'SENT',
          sentAt: new Date(),
          metadata: { customerId, city, preferenceId: preference.id },
        },
      });
    }
    return preference;
  }

  private async assertNoOpenGroupConflict(
    customerId: string,
    customerPhone: string | null | undefined,
    city: string,
    chosenRunnerId?: string | null,
  ) {
    const phone = this.normalizePhone(customerPhone);
    if (!phone) return;

    const conflict = await (
      this.prisma as any
    ).customerGroupConflict.findUnique({
      where: { customerPhone_city: { customerPhone: phone, city } },
    });

    if (!conflict || conflict.status !== 'OPEN') return;

    const runnerIds = Array.isArray(conflict.runnerIds)
      ? conflict.runnerIds.map((id: unknown) => String(id))
      : [];

    if (!chosenRunnerId || !runnerIds.includes(chosenRunnerId)) {
      throw new BadRequestException(
        `Your number is already found in more than one ${this.title(city)} runner group. Choose one of the conflicted registered runners or ask support to resolve it.`,
      );
    }

    await (this.prisma as any).customerGroupConflict.update({
      where: { id: conflict.id },
      data: {
        status: 'RESOLVED',
        chosenRunnerId,
        resolvedById: customerId,
        resolvedAt: new Date(),
        resolutionNote:
          'Customer selected this trusted runner from account settings.',
      },
    });
  }

  async removePreference(customerId: string, cityValue: string) {
    const city = this.city(cityValue);
    const existing = await this.prisma.customerRunnerPreference.findUnique({
      where: { customerId_city: { customerId, city } },
    });
    if (!existing) throw new NotFoundException('Runner preference not found');
    await this.prisma.customerRunnerPreference.update({
      where: { id: existing.id },
      data: { status: 'INACTIVE', replacedAt: new Date() },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: customerId,
        action: 'CUSTOMER_RUNNER_PREFERENCE_REMOVED',
        entityType: 'CustomerRunnerPreference',
        entityId: existing.id,
        summary: `${city} runner preference deactivated`,
        metadata: {
          city,
          runnerPhone: existing.runnerPhone,
          runnerId: existing.runnerId,
        },
      },
    });
    return { message: `${this.title(city)} runner preference removed` };
  }

  async findRunner(runnerPhone: string, city: string) {
    const digits = runnerPhone.replace(/\D/g, '');
    const candidates = Array.from(new Set([runnerPhone, `+${digits}`, digits]));
    return this.prisma.runner.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { phone: { in: candidates } },
          { user: { phone: { in: candidates } } },
        ],
        serviceCities: { some: { city, active: true } },
      },
      include: { user: { select: { id: true, name: true, phone: true } } },
    });
  }

  city(value: string) {
    const city = String(value || '')
      .trim()
      .toUpperCase();
    if (!PROCUREMENT_CITIES.includes(city as any)) {
      throw new BadRequestException(
        'City must be Durban, Johannesburg, or Maputo',
      );
    }
    return city;
  }

  phone(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15)
      throw new BadRequestException('Enter a valid runner WhatsApp number');
    return `+${digits}`;
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  private title(city: string) {
    return city.charAt(0) + city.slice(1).toLowerCase();
  }
}
