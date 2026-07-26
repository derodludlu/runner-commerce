import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService password recovery', () => {
  it('returns the same response for unknown and known accounts', async () => {
    const tx = {
      passwordResetChallenge: {
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      whatsAppOutboundMessage: { create: jest.fn() },
    };
    const prisma = {
      user: { findFirst: jest.fn() },
      passwordResetChallenge: { findFirst: jest.fn().mockResolvedValue(null) },
      whatsAppBridgeAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bridge-1' }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new AuthService(prisma as any, {} as any);

    prisma.user.findFirst.mockResolvedValueOnce(null);
    const unknown = await service.requestPasswordReset({
      identifier: '+26876000000',
    });

    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'user-1',
      name: 'Customer',
      phone: '+26876111111',
      passwordHash: 'hash',
      status: 'ACTIVE',
    });
    const known = await service.requestPasswordReset({
      identifier: '+26876111111',
    });

    expect(known).toEqual(unknown);
    expect(tx.whatsAppOutboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bridgeAccountId: 'bridge-1',
          recipientPhone: '+26876111111',
          messageType: 'PASSWORD_RESET_PIN',
        }),
      }),
    );
  });

  it('consumes a valid reset PIN and replaces the password', async () => {
    const oldPasswordHash = await bcrypt.hash('old-password', 4);
    const codeHash = await bcrypt.hash('123456', 4);
    const tx = {
      user: { update: jest.fn() },
      passwordResetChallenge: { updateMany: jest.fn() },
    };
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Customer',
          phone: '+26876111111',
          passwordHash: oldPasswordHash,
          status: 'ACTIVE',
        }),
      },
      passwordResetChallenge: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'challenge-1',
          codeHash,
        }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new AuthService(prisma as any, {} as any);

    const result = await service.completePasswordReset({
      identifier: '+26876111111',
      code: '123456',
      newPassword: 'new-password',
    });

    expect(result.message).toContain('Password reset successful');
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ passwordResetRequired: false }),
      }),
    );
    expect(tx.passwordResetChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', consumedAt: null },
      }),
    );
  });

  it('rejects an invalid or expired reset PIN without revealing account state', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AuthService(prisma as any, {} as any);

    await expect(
      service.completePasswordReset({
        identifier: 'unknown',
        code: '123456',
        newPassword: 'new-password',
      }),
    ).rejects.toThrow(
      new BadRequestException('Reset PIN is invalid or has expired'),
    );
  });
});

describe('AuthService account details', () => {
  it('updates the current user name, phone, and email', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'user-1',
            name: 'Old Name',
            phone: '+26876000000',
            email: 'old@example.com',
            passwordResetRequired: false,
            role: { name: 'SUPERUSER' },
            runner: null,
          })
          .mockResolvedValueOnce({
            id: 'user-1',
            name: 'New Name',
            phone: '+26876154884',
            email: 'new@example.com',
            passwordResetRequired: false,
            role: { name: 'SUPERUSER' },
            runner: null,
          }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new AuthService(prisma as any, {} as any);

    const result = await service.updateCurrentUser('user-1', {
      name: ' New   Name ',
      phone: '268 7615 4884',
      email: 'NEW@example.com',
    });

    expect(result).toEqual(
      expect.objectContaining({
        name: 'New Name',
        phone: '+26876154884',
        email: 'new@example.com',
        role: 'SUPERUSER',
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        name: 'New Name',
        phone: '+26876154884',
        email: 'new@example.com',
      },
    });
  });

  it('does not require password change while a superuser is impersonating', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'runner-user-1',
          name: 'Runner User',
          phone: '+26876000000',
          email: null,
          passwordResetRequired: true,
          role: { name: 'RUNNER' },
          runner: { id: 'runner-1', status: 'ACTIVE', vehicleType: null },
        }),
      },
    };
    const service = new AuthService(prisma as any, {} as any);

    const result = await service.getCurrentUser('runner-user-1', {
      impersonation: true,
      impersonatedBy: 'superuser-1',
    });

    expect(result.mustChangePassword).toBe(false);
    expect(result.impersonation).toEqual(
      expect.objectContaining({
        active: true,
        actorUserId: 'superuser-1',
      }),
    );
  });

  it('rejects phone numbers already assigned to another user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'User',
          phone: '+26876000000',
          email: 'user@example.com',
          role: { name: 'CUSTOMER' },
          runner: null,
        }),
        findFirst: jest.fn().mockResolvedValue({ id: 'user-2' }),
        update: jest.fn(),
      },
    };
    const service = new AuthService(prisma as any, {} as any);

    await expect(
      service.updateCurrentUser('user-1', { phone: '+26876154884' }),
    ).rejects.toThrow('Phone number is already in use');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
