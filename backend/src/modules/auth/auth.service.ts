// src/modules/auth/auth.service.ts

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginCredentialsDto } from './dto/login-credentials.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { CompletePasswordResetDto } from './dto/complete-password-reset.dto';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { randomInt } from 'crypto';

const FORGOT_PASSWORD_RESPONSE = {
  message:
    'If an active account matches those details, a 6-digit reset PIN will be sent to its registered WhatsApp number through Runner Commerce.',
  expiresInMinutes: 15,
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(credentials: LoginCredentialsDto): Promise<AuthResponseDto> {
    const { identifier, password } = credentials;

    // Determine if identifier is phone, email, or name
    let user;
    const isEmail = identifier.includes('@');
    const isPhone = /^\+?[1-9]\d{1,14}$/.test(identifier.replace(/[\s-]/g, ''));

    if (isEmail) {
      // Search by email
      user = await this.prisma.user.findFirst({
        where: { email: identifier },
        include: {
          role: true,
          runner: true,
        },
      });
    } else if (isPhone) {
      // Search by phone (normalize phone number)
      const normalizedPhone = identifier.replace(/[\s-()]/g, '');
      user = await this.prisma.user.findFirst({
        where: { phone: normalizedPhone },
        include: {
          role: true,
          runner: true,
        },
      });
    } else {
      // Search by name (case-insensitive)
      user = await this.prisma.user.findFirst({
        where: {
          name: {
            contains: identifier,
            mode: 'insensitive',
          },
        },
        include: {
          role: true,
          runner: true,
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status && user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const accessToken = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      role: user.role.name,
      runnerId: user.runner?.id || null,
    });

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        phone: user.phone,
        role: user.role.name,
        mustChangePassword: user.passwordResetRequired,
        runnerId: user.runner?.id || null,
      },
      { expiresIn: '30d' },
    );

    // Return response (exclude sensitive fields)
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email ?? undefined,
        role: user.role.name,
        mustChangePassword: user.passwordResetRequired,
        runner: user.runner
          ? {
              id: user.runner.id,
              status: user.runner.status,
              vehicleType: user.runner.vehicleType ?? undefined,
            }
          : undefined,
      },
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { name, phone, email, password } = registerDto;
    const city = String(registerDto.preferredRunnerCity || '')
      .trim()
      .toUpperCase();
    if (!['DURBAN', 'JOHANNESBURG', 'MAPUTO'].includes(city)) {
      throw new BadRequestException('Select Durban, Johannesburg, or Maputo');
    }
    const runnerDigits = String(registerDto.preferredRunnerPhone || '').replace(
      /\D/g,
      '',
    );
    if (runnerDigits.length < 8 || runnerDigits.length > 15) {
      throw new BadRequestException(
        'Enter a valid trusted runner WhatsApp number',
      );
    }
    const runnerPhone = `+${runnerDigits}`;

    // Check if user already exists
    const whereCondition: any = { phone };
    if (email) {
      whereCondition.OR = [{ phone }, { email }];
    } else {
      whereCondition.OR = [{ phone }];
    }

    const existingUser = await this.prisma.user.findFirst({
      where: whereCondition,
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this phone or email already exists',
      );
    }

    // Get CUSTOMER role
    const customerRole = await this.prisma.role.findUnique({
      where: { name: 'CUSTOMER' },
    });

    if (!customerRole) {
      throw new NotFoundException('Customer role not found');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const runnerCandidates = [runnerPhone, runnerDigits];
    const matchedRunner = await this.prisma.runner.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { phone: { in: runnerCandidates } },
          { user: { phone: { in: runnerCandidates } } },
        ],
        serviceCities: { some: { city, active: true } },
      },
      select: { id: true },
    });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          phone,
          email: email ?? null,
          passwordHash,
          roleId: customerRole.id,
        },
        include: { role: true },
      });
      await tx.customerRunnerPreference.create({
        data: {
          customerId: created.id,
          city,
          runnerPhone,
          runnerId: matchedRunner?.id,
          status: matchedRunner ? 'MATCHED' : 'PENDING_MATCH',
          matchedAt: matchedRunner ? new Date() : null,
        },
      });
      return created;
    });

    // Generate tokens
    const accessToken = this.jwtService.sign({
      sub: user.id,
      phone: user.phone,
      role: user.role.name,
      mustChangePassword: user.passwordResetRequired,
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, phone: user.phone, role: user.role.name },
      { expiresIn: '30d' },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email ?? undefined,
        role: user.role.name,
        mustChangePassword: false,
      },
      runnerPreference: {
        city,
        runnerPhone,
        status: matchedRunner ? 'MATCHED' : 'PENDING_MATCH',
        runnerId: matchedRunner?.id,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_SECRET,
      });

      // Generate new access token
      const accessToken = this.jwtService.sign({
        sub: payload.sub,
        phone: payload.phone,
        role: payload.role,
        runnerId: payload.runnerId ?? null,
      });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getCurrentUser(
    userId: string,
    session?: any,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, runner: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email ?? undefined,
      role: user.role.name,
      mustChangePassword: session?.impersonation
        ? false
        : user.passwordResetRequired,
      ...(session?.impersonation
        ? {
            impersonation: {
              active: true,
              actorUserId: session.impersonatedBy,
            },
          }
        : {}),
      runner: user.runner
        ? {
            id: user.runner.id,
            status: user.runner.status,
            vehicleType: user.runner.vehicleType ?? undefined,
          }
        : undefined,
    };
  }

  async updateCurrentUser(
    userId: string,
    dto: UpdateCurrentUserDto,
  ): Promise<UserResponseDto> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, runner: true },
    });

    if (!current) {
      throw new NotFoundException('User not found');
    }

    const data: { name?: string; phone?: string; email?: string | null } = {};
    const name = this.cleanText(dto.name);
    const phone = this.normalizePhone(dto.phone);
    const email = this.cleanText(dto.email)?.toLowerCase();

    if (dto.name !== undefined) {
      if (!name || name.length < 2) {
        throw new BadRequestException('Name must be at least 2 characters');
      }
      data.name = name;
    }

    if (dto.phone !== undefined) {
      if (!phone || phone.length < 8 || phone.length > 20) {
        throw new BadRequestException('Enter a valid WhatsApp phone number');
      }
      data.phone = phone;
    }

    if (dto.email !== undefined) {
      data.email = email || null;
    }

    if (Object.keys(data).length === 0) {
      return this.getCurrentUser(userId);
    }

    if (data.phone && data.phone !== current.phone) {
      const existingPhone = await this.prisma.user.findFirst({
        where: { phone: data.phone, id: { not: userId } },
        select: { id: true },
      });
      if (existingPhone) {
        throw new ConflictException('Phone number is already in use');
      }
    }

    if (data.email && data.email !== current.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: { email: data.email, id: { not: userId } },
        select: { id: true },
      });
      if (existingEmail) {
        throw new ConflictException('Email address is already in use');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return this.getCurrentUser(userId);
  }

  async impersonateUser(actorUserId: string, targetUserId: string) {
    const [actor, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actorUserId },
        include: { role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: { role: true, runner: true },
      }),
    ]);

    if (!actor || actor.status !== 'ACTIVE') {
      throw new UnauthorizedException('Admin account is not active');
    }
    if (actor.role.name !== 'SUPERUSER') {
      throw new ForbiddenException('Only SUPERUSER can impersonate accounts');
    }
    if (!target || target.status !== 'ACTIVE') {
      throw new NotFoundException('Target user not found or inactive');
    }
    if (target.role.name === 'SUPERUSER') {
      throw new ForbiddenException('SUPERUSER accounts cannot be impersonated');
    }

    const accessToken = this.jwtService.sign(
      {
        sub: target.id,
        phone: target.phone,
        role: target.role.name,
        runnerId: target.runner?.id || null,
        impersonatedBy: actor.id,
        impersonation: true,
      },
      { expiresIn: '30m' },
    );

    return {
      accessToken,
      user: {
        id: target.id,
        name: target.name,
        phone: target.phone,
        email: target.email ?? undefined,
        role: target.role.name,
        mustChangePassword: false,
        impersonation: {
          active: true,
          actorUserId: actor.id,
          actorName: actor.name,
          actorRole: actor.role.name,
        },
        runner: target.runner
          ? {
              id: target.runner.id,
              status: target.runner.status,
              vehicleType: target.runner.vehicleType ?? undefined,
            }
          : undefined,
      },
    };
  }

  private cleanText(value?: string | null) {
    const text = String(value ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    return text || undefined;
  }

  private normalizePhone(value?: string | null) {
    const raw = String(value ?? '').trim();
    if (!raw) return undefined;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return undefined;
    return `+${digits}`;
  }

  async impersonateRunner(actorUserId: string, runnerId: string) {
    const runner = await this.prisma.runner.findUnique({
      where: { id: runnerId },
      select: { userId: true },
    });

    if (!runner) {
      throw new NotFoundException('Runner not found');
    }

    return this.impersonateUser(actorUserId, runner.userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 10),
        passwordResetRequired: false,
        passwordChangedAt: new Date(),
      },
    });

    return { message: 'Password changed successfully.' };
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const user = await this.findAccountByIdentifier(dto.identifier);
    if (!user || user.status !== 'ACTIVE') return FORGOT_PASSWORD_RESPONSE;

    const recentChallenge = await this.prisma.passwordResetChallenge.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
      },
    });
    if (recentChallenge) return FORGOT_PASSWORD_RESPONSE;

    const bridge = await this.prisma.whatsAppBridgeAccount.findFirst({
      where: {
        archivedAt: null,
        OR: [
          { sessionName: 'runner-commerce-session-bridge' },
          { name: { equals: 'WhatsApp Bridge 1', mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (!bridge) return FORGOT_PASSWORD_RESPONSE;

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const codeHash = await bcrypt.hash(code, 10);
    const messageText = [
      'Runner Commerce password reset',
      `Hello ${user.name || 'there'},`,
      `Your one-time reset PIN is: ${code}`,
      'It expires in 15 minutes.',
      'Do not share this PIN. If you did not request it, ignore this message.',
    ].join('\n');

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.passwordResetChallenge.create({
        data: { userId: user.id, codeHash, expiresAt },
      });
      await tx.whatsAppOutboundMessage.create({
        data: {
          bridgeAccountId: bridge.id,
          recipientPhone: user.phone,
          messageType: 'PASSWORD_RESET_PIN',
          messageText,
          expiresAt,
        },
      });
    });

    return FORGOT_PASSWORD_RESPONSE;
  }

  async completePasswordReset(dto: CompletePasswordResetDto) {
    const user = await this.findAccountByIdentifier(dto.identifier);
    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException('Reset PIN is invalid or has expired');
    }

    const challenge = await this.prisma.passwordResetChallenge.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new BadRequestException('Reset PIN is invalid or has expired');
    }

    const validCode = await bcrypt.compare(dto.code, challenge.codeHash);
    if (!validCode) {
      await this.prisma.passwordResetChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Reset PIN is invalid or has expired');
    }

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'New password must be different from the previous password',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await bcrypt.hash(dto.newPassword, 10),
          passwordResetRequired: false,
          passwordChangedAt: now,
        },
      });
      await tx.passwordResetChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
    });

    return {
      message:
        'Password reset successful. Sign in with your new password. The reset PIN can no longer be used.',
    };
  }

  private async findAccountByIdentifier(identifier: string) {
    const clean = String(identifier || '').trim();
    const normalizedPhone = clean.replace(/[\s-()]/g, '');
    const isEmail = clean.includes('@');
    const isPhone = /^\+?[1-9]\d{1,14}$/.test(normalizedPhone);

    return this.prisma.user.findFirst({
      where: isEmail
        ? { email: { equals: clean, mode: 'insensitive' } }
        : isPhone
          ? { phone: normalizedPhone }
          : { name: { equals: clean, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        phone: true,
        passwordHash: true,
        status: true,
      },
    });
  }
}
