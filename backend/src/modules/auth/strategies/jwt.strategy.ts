// src/modules/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Request } from 'express';

function cookieExtractor(req: Request): string | null {
  const rawCookie = req?.headers?.cookie;
  if (!rawCookie) return null;

  const cookies = rawCookie
    .split(';')
    .reduce<Record<string, string>>((acc, cookie) => {
      const [name, ...value] = cookie.trim().split('=');
      if (name) acc[name] = decodeURIComponent(value.join('='));
      return acc;
    }, {});

  return cookies.auth_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // ✅ FIXED: Ensure JWT_SECRET is defined
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true, runner: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    if (payload.impersonation) {
      const actor = await this.prisma.user.findUnique({
        where: { id: payload.impersonatedBy },
        include: { role: true },
      });

      if (
        !actor ||
        actor.status !== 'ACTIVE' ||
        actor.role.name !== 'SUPERUSER'
      ) {
        throw new UnauthorizedException(
          'Impersonation session is no longer valid',
        );
      }
      if (user.role.name === 'SUPERUSER') {
        throw new UnauthorizedException(
          'SUPERUSER accounts cannot be impersonated',
        );
      }
    }

    return {
      userId: user.id,
      phone: user.phone,
      role: user.role.name,
      runnerId: user.runner?.id ?? payload.runnerId ?? null,
      impersonatedBy: payload.impersonatedBy ?? null,
      impersonation: Boolean(payload.impersonation),
    };
  }
}
