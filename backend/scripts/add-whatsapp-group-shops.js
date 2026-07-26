require('dotenv/config');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const rawArgs = process.argv.slice(2);

if (hasFlag('help') || rawArgs.length === 0) {
  console.log(`Add WhatsApp group shops without opening WhatsApp Web

Usage:
  npm run whatsapp:session:add-shops -- --group="Group Name|26870000000-123@g.us" --apply --update-env
  npm run whatsapp:session:add-shops -- --group="Group Name|group-id@g.us|861|+26870000000|Owner Name" --apply --update-env
  npm run whatsapp:session:add-shops -- --groups-file=whatsapp-groups.json --apply --update-env

Group formats:
  --group="Group Name|group-id@g.us"
  --group="Group Name|group-id@g.us|861"
  --group="Group Name|group-id@g.us|861|creator phone|creator name"

Options:
  --owner-phone       Override all group creators with one shop owner phone
  --owner-email       Shop owner email
  --owner-id          Shop owner id
  --apply             Write to database. Without this, dry-run only.
  --update-env        Update WHATSAPP_SESSION_GROUP_SHOP_MAP in backend .env
`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const prisma = new PrismaClient();
  const applyChanges = hasFlag('apply');
  const updateEnv = hasFlag('update-env');
  const explicitOwnerRequested = hasExplicitOwnerArgs();

  try {
    const groups = await readGroups();

    if (groups.length === 0) {
      throw new Error('Provide at least one --group or --groups-file entry');
    }

    const currentMap = parseJsonMap(
      process.env.WHATSAPP_SESSION_GROUP_SHOP_MAP,
    );
    const nextMap = { ...currentMap };
    const created = [];
    const reused = [];
    const ownerResults = [];

    for (const group of groups) {
      const shopLookup = shopDraftFromGroup(group, 'pending-owner');
      const existing = await prisma.shop.findFirst({
        where: {
          OR: [{ name: shopLookup.name }, { phone: shopLookup.phone }],
        },
        select: {
          id: true,
          name: true,
          phone: true,
          ownerId: true,
          owner: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      });
      const owner = existing
        ? {
            ...existing.owner,
            created: false,
            groupCreatorPhone: groupCreatorPhone(group),
            dryRun: false,
          }
        : explicitOwnerRequested
          ? await resolveShopOwner(prisma)
          : await resolveOrCreateGroupShopOwner(prisma, group, applyChanges);
      const shopDraft = shopDraftFromGroup(group, owner.id);
      const shop = existing
        ? existing
        : applyChanges
          ? await prisma.shop.create({
              data: shopDraft,
              select: {
                id: true,
                name: true,
                phone: true,
                ownerId: true,
              },
            })
          : {
              id: null,
              name: shopDraft.name,
              phone: shopDraft.phone,
              ownerId: owner.id,
            };

      if (shop.id) nextMap[group.id] = shop.id;

      const item = {
        groupName: group.name,
        groupId: group.id,
        groupCreatorPhone: owner.groupCreatorPhone || null,
        participants: group.participants,
        shopId: shop.id,
        shopName: shop.name,
        shopPhone: shop.phone,
        ownerName: owner.name,
        ownerPhone: owner.phone,
        ownerMismatch: Boolean(shop.ownerId && shop.ownerId !== owner.id),
      };

      if (existing) reused.push(item);
      else created.push(item);
      ownerResults.push(owner);
    }

    if (updateEnv) {
      if (!applyChanges) {
        throw new Error('--update-env requires --apply so the shop ids exist');
      }
      await updateSessionGroupShopMap(nextMap);
    }

    console.log(
      JSON.stringify(
        {
          mode: 'manual-whatsapp-group-shops',
          apply: applyChanges,
          updateEnv,
          owners: ownerResults.map((owner) => ({
            id: owner.id,
            name: owner.name,
            phone: owner.phone,
            email: owner.email,
            created: owner.created,
            temporaryPassword: owner.temporaryPassword,
            groupCreatorPhone: owner.groupCreatorPhone,
            dryRun: owner.dryRun,
          })),
          receivedGroups: groups.length,
          created,
          reused,
          nextGroupShopMap: nextMap,
          envUpdated: updateEnv,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function readGroups() {
  const groups = argValues('group').map(parseGroupArg);
  const groupsFile = argValue('groups-file');

  if (!groupsFile) return groups;

  const filePath = path.resolve(groupsFile);
  const text = await fsp.readFile(filePath, 'utf8');
  const parsed = JSON.parse(text);
  const fileGroups = Array.isArray(parsed) ? parsed : parsed.groups;

  if (!Array.isArray(fileGroups)) {
    throw new Error(
      '--groups-file must contain a JSON array or { "groups": [] }',
    );
  }

  return [
    ...groups,
    ...fileGroups.map((group) => ({
      name: String(group.name || '').trim(),
      id: String(group.id || '').trim(),
      participants: Number(group.participants || 0),
      creatorPhone: group.creatorPhone || group.ownerPhone || group.creatorId,
      creatorName: group.creatorName || group.ownerName,
    })),
  ].filter((group) => group.name && group.id);
}

function parseGroupArg(value) {
  const [name, id, participants, creatorPhone, creatorName] =
    String(value).split('|');

  if (!name?.trim() || !id?.trim()) {
    throw new Error('--group must use "Group Name|group-id@g.us"');
  }

  return {
    name: name.trim(),
    id: id.trim(),
    participants: Number(participants || 0),
    creatorPhone: creatorPhone?.trim(),
    creatorName: creatorName?.trim(),
  };
}

async function resolveShopOwner(prisma) {
  const ownerId =
    argValue('owner-id') || process.env.WHATSAPP_SESSION_SHOP_OWNER_ID;
  const ownerEmail =
    argValue('owner-email') || process.env.WHATSAPP_SESSION_SHOP_OWNER_EMAIL;
  const ownerPhone =
    argValue('owner-phone') ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_PHONE ||
    '+10000000004';

  const owner = await prisma.user.findFirst({
    where: {
      ...(ownerId
        ? { id: ownerId }
        : ownerEmail
          ? { email: ownerEmail }
          : { phone: { in: phoneCandidates(ownerPhone) } }),
      role: { name: 'SHOP_OWNER' },
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  if (!owner) {
    throw new Error(
      'Could not find an active SHOP_OWNER. Pass --owner-phone, --owner-email, or --owner-id.',
    );
  }

  return owner;
}

async function resolveOrCreateGroupShopOwner(prisma, group, applyChanges) {
  const creatorPhone = groupCreatorPhone(group);

  if (!creatorPhone) {
    throw new Error(
      `Could not determine a group creator for "${group.name}". Add creator phone as the 4th --group field or pass --owner-phone.`,
    );
  }

  const existing = await prisma.user.findFirst({
    where: {
      phone: { in: phoneCandidates(creatorPhone) },
      role: { name: 'SHOP_OWNER' },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  if (existing) {
    return {
      ...existing,
      created: false,
      groupCreatorPhone: creatorPhone,
      dryRun: false,
    };
  }

  const ownerName = group.creatorName || `${cleanShopName(group.name)} Owner`;
  const temporaryPassword = createTemporaryPassword();

  if (!applyChanges) {
    return {
      id: null,
      name: ownerName,
      phone: creatorPhone,
      email: null,
      created: true,
      temporaryPassword,
      groupCreatorPhone: creatorPhone,
      dryRun: true,
    };
  }

  const bcrypt = require('bcrypt');
  const shopOwnerRole = await prisma.role.findUnique({
    where: { name: 'SHOP_OWNER' },
    select: { id: true },
  });

  if (!shopOwnerRole) {
    throw new Error('SHOP_OWNER role is missing. Run the role seed first.');
  }

  const created = await prisma.user.create({
    data: {
      name: ownerName,
      phone: creatorPhone,
      passwordHash: await bcrypt.hash(temporaryPassword, 10),
      roleId: shopOwnerRole.id,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  });

  return {
    ...created,
    created: true,
    temporaryPassword,
    groupCreatorPhone: creatorPhone,
    dryRun: false,
  };
}

function hasExplicitOwnerArgs() {
  return Boolean(
    argValue('owner-id') ||
    argValue('owner-email') ||
    argValue('owner-phone') ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_ID ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_EMAIL ||
    process.env.WHATSAPP_SESSION_SHOP_OWNER_PHONE,
  );
}

function groupCreatorPhone(group) {
  const explicit =
    group.creatorPhone ||
    group.creatorId ||
    group.ownerPhone ||
    group.ownerId ||
    creatorPhoneFromGroupId(group.id);
  const normalized = normalizePhone(explicit);

  return normalized || null;
}

function creatorPhoneFromGroupId(groupId) {
  const match = String(groupId || '').match(/^(\d{8,})-\d+@g\.us$/);
  const candidate = match?.[1];

  if (!candidate || candidate.startsWith('120363')) return null;
  return candidate;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.startsWith('120363')) return null;
  return `+${digits}`;
}

function createTemporaryPassword() {
  return (
    process.env.WHATSAPP_CREATED_SHOP_OWNER_PASSWORD ||
    `Shop-${crypto.randomBytes(5).toString('hex')}`
  );
}

function shopDraftFromGroup(group, ownerId) {
  const name = cleanShopName(group.name) || `WhatsApp Shop ${group.id}`;
  const phone = phoneFromGroupId(group.id);

  return {
    name,
    description: `Products captured from WhatsApp group "${group.name}"`,
    phone,
    address: 'WhatsApp Group',
    ownerId,
    status: 'ACTIVE',
  };
}

function cleanShopName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}'&()., -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phoneFromGroupId(groupId) {
  const numeric = String(groupId || '').match(/^(\d+)/)?.[1];
  if (numeric) return `+${numeric}`;

  return `+${String(Date.now()).slice(-10)}`;
}

async function updateSessionGroupShopMap(nextMap) {
  const envPath = path.resolve(process.env.WHATSAPP_SESSION_ENV_PATH || '.env');
  const envText = await fsp.readFile(envPath, 'utf8');
  const nextLine = `WHATSAPP_SESSION_GROUP_SHOP_MAP=${JSON.stringify(nextMap)}`;

  if (/^WHATSAPP_SESSION_GROUP_SHOP_MAP=/m.test(envText)) {
    await fsp.writeFile(
      envPath,
      envText.replace(/^WHATSAPP_SESSION_GROUP_SHOP_MAP=.*$/m, nextLine),
    );
    return;
  }

  const separator = envText.endsWith('\n') ? '' : '\n';
  await fsp.writeFile(envPath, `${envText}${separator}${nextLine}\n`);
}

function phoneCandidates(value) {
  const raw = String(value || '').trim();
  const compact = raw.replace(/\s+/g, '');
  const withoutPlus = compact.replace(/^\+/, '');
  return [...new Set([raw, compact, withoutPlus, `+${withoutPlus}`])].filter(
    Boolean,
  );
}

function parseJsonMap(value) {
  if (!value) return {};

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function argValue(name) {
  const longName = name.startsWith('--') ? name : `--${name}`;
  const equalsArg = rawArgs.find((item) => item.startsWith(`${longName}=`));

  if (equalsArg) return equalsArg.slice(longName.length + 1);

  const index = rawArgs.indexOf(longName);
  if (
    index >= 0 &&
    rawArgs[index + 1] &&
    !rawArgs[index + 1].startsWith('--')
  ) {
    return rawArgs[index + 1];
  }

  return undefined;
}

function argValues(name) {
  const longName = name.startsWith('--') ? name : `--${name}`;
  const values = [];

  for (let index = 0; index < rawArgs.length; index += 1) {
    const item = rawArgs[index];

    if (item.startsWith(`${longName}=`)) {
      values.push(item.slice(longName.length + 1));
      continue;
    }

    if (
      item === longName &&
      rawArgs[index + 1] &&
      !rawArgs[index + 1].startsWith('--')
    ) {
      values.push(rawArgs[index + 1]);
      index += 1;
    }
  }

  return values.filter(Boolean);
}

function hasFlag(name) {
  const longName = name.startsWith('--') ? name : `--${name}`;
  return rawArgs.includes(longName);
}
