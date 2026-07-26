import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const PHASE_2_PATHS = [
  '/cart',
  '/orders',
  '/returns',
  '/wishlist',
  '/coupons',
  '/runner/order-requests',
  '/runner/shopping-list',
  '/runner/earnings',
  '/customers/me/runner-preferences',
];

@Injectable()
export class Phase2Guard implements CanActivate {
  private cachedEnabled = false;
  private cacheExpiresAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const path = String(request.path || request.url || '').split('?')[0];
    const requiresPhase2 = PHASE_2_PATHS.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );

    if (!requiresPhase2) return true;
    if (Date.now() >= this.cacheExpiresAt) {
      const setting = await (this.prisma as any).appSetting.findUnique({
        where: { key: 'phase2Enabled' },
        select: { value: true },
      });
      this.cachedEnabled = String(setting?.value).toLowerCase() === 'true';
      this.cacheExpiresAt = Date.now() + 5000;
    }

    if (!this.cachedEnabled) {
      throw new ServiceUnavailableException(
        'Phase 2 order management is currently disabled. Phase 1 reposting remains available.',
      );
    }
    return true;
  }
}
