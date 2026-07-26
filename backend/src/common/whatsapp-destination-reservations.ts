import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const RESERVED_REPOSTING_GROUP_STATUSES = [
  'GROUP_LINK_RECEIVED',
  'JOIN_ATTEMPT_STARTED',
  'JOINED_GROUP',
  'ADMIN_STATUS_PENDING',
  'RUNNER_CONFIRMED_ADMIN',
  'ADMIN_VERIFIED',
  'BOT_NOT_ADMIN',
  'READY_FOR_REPOSTING',
];

export function normalizeDestinationKey(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function parseDestinationGroups(value?: string | string[] | null) {
  if (Array.isArray(value)) {
    return value.map((group) => String(group || '').trim()).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((group) => String(group || '').trim())
          .filter(Boolean);
      }
    } catch {
      return [raw];
    }
  }

  return raw
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean);
}

type DestinationReservationConflict = {
  destinationGroup: string;
  runnerId: string;
  runnerName?: string | null;
  source: 'SHOP_AUTOMATION' | 'PHASE1_REPOSTING_GROUP';
};

export async function findDestinationReservationConflict(
  prisma: PrismaService,
  runnerId: string,
  destinationGroups: string[],
  options: { excludeRepostingGroupId?: string | null } = {},
): Promise<DestinationReservationConflict | null> {
  const requestedValues = [...new Set(destinationGroups.filter(Boolean))];
  if (requestedValues.length === 0) return null;

  const discoveredGroups = await prisma.whatsAppDiscoveredGroup.findMany({
    where: { groupPurpose: 'RUNNER_ADVERTISING' },
    select: { id: true, groupId: true, name: true },
  });
  const canonicalByAlias = new Map<string, string>();
  const discoveredById = new Map<string, (typeof discoveredGroups)[number]>();
  for (const group of discoveredGroups) {
    discoveredById.set(group.id, group);
    const canonical = normalizeDestinationKey(group.groupId);
    canonicalByAlias.set(canonical, canonical);
    canonicalByAlias.set(normalizeDestinationKey(group.name), canonical);
  }
  const canonical = (value: string) => {
    const key = normalizeDestinationKey(value);
    return canonicalByAlias.get(key) || key;
  };
  const requested = new Set(requestedValues.map(canonical));

  const [activeLinks, repostingGroups] = await Promise.all([
    prisma.runnerShopLink.findMany({
      where: {
        runnerId: { not: runnerId },
        status: 'APPROVED',
        autoPostEnabled: true,
        destinationGroup: { not: null },
        runner: { status: 'ACTIVE' },
      },
      select: {
        runnerId: true,
        destinationGroup: true,
        runner: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.runnerRepostingGroup.findMany({
      where: {
        runnerId: { not: runnerId },
        status: { in: RESERVED_REPOSTING_GROUP_STATUSES },
        ...(options.excludeRepostingGroupId
          ? { id: { not: options.excludeRepostingGroupId } }
          : {}),
      },
      select: {
        id: true,
        runnerId: true,
        whatsappGroupId: true,
        discoveredGroupId: true,
        groupName: true,
        runner: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  for (const link of activeLinks) {
    const conflictingGroup = parseDestinationGroups(link.destinationGroup).find(
      (group) => requested.has(canonical(group)),
    );
    if (conflictingGroup) {
      return {
        destinationGroup: conflictingGroup,
        runnerId: link.runnerId,
        runnerName: link.runner?.user?.name,
        source: 'SHOP_AUTOMATION',
      };
    }
  }

  for (const group of repostingGroups) {
    const discovered = group.discoveredGroupId
      ? discoveredById.get(group.discoveredGroupId)
      : null;
    const aliases = [
      group.whatsappGroupId,
      discovered?.groupId,
      discovered?.name,
      group.groupName,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const conflictingGroup = aliases.find((alias) =>
      requested.has(canonical(alias)),
    );
    if (conflictingGroup) {
      return {
        destinationGroup: conflictingGroup,
        runnerId: group.runnerId,
        runnerName: group.runner?.user?.name,
        source: 'PHASE1_REPOSTING_GROUP',
      };
    }
  }

  return null;
}

export async function assertDestinationGroupsAvailableToRunner(
  prisma: PrismaService,
  runnerId: string,
  destinationGroups: string[],
  options: { excludeRepostingGroupId?: string | null } = {},
) {
  const conflict = await findDestinationReservationConflict(
    prisma,
    runnerId,
    destinationGroups,
    options,
  );
  if (!conflict) return;

  throw new ForbiddenException(
    `Destination group "${conflict.destinationGroup || 'selected group'}" is already reserved by another runner${conflict.runnerName ? ` (${conflict.runnerName})` : ''}. Shared destination groups are blocked to prevent duplicate posting.`,
  );
}
