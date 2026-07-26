import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async healthCheck() {
    try {
      // Check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'connected',
          stripe:
            process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY
              ? 'configured'
              : 'missing',
          email: process.env.SMTP_HOST ? 'configured' : 'missing',
          redis: process.env.REDIS_URL ? 'configured' : 'not_configured',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'disconnected',
          stripe:
            process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY
              ? 'configured'
              : 'missing',
          email: process.env.SMTP_HOST ? 'configured' : 'missing',
          redis: process.env.REDIS_URL ? 'configured' : 'not_configured',
        },
        error: message,
      };
    }
  }

  @Get('features')
  async features() {
    const settings = await (this.prisma as any).appSetting.findMany({
      where: {
        key: {
          in: [
            'phase2Enabled',
            'whatsappOrderTrackingEnabled',
            'whatsappRepostingEnabled',
          ],
        },
      },
      select: { key: true, value: true },
    });
    const values = new Map(
      settings.map((setting: { key: string; value: string }) => [
        setting.key,
        String(setting.value).toLowerCase() === 'true',
      ]),
    );
    const phase2Enabled = values.get('phase2Enabled') === true;

    return {
      phase1Enabled: true,
      phase2Enabled,
      whatsappOrderTrackingEnabled:
        phase2Enabled && values.get('whatsappOrderTrackingEnabled') === true,
      whatsappRepostingEnabled: values.get('whatsappRepostingEnabled') === true,
    };
  }
}
