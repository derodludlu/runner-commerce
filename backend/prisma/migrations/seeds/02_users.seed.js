'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.default = seedUsers;
const bcrypt = __importStar(require('bcrypt'));
async function seedUsers(prisma) {
  const defaultPassword = 'password123';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.name, r.id]));
  const users = [
    {
      name: 'Super User',
      phone: '+26876154884',
      email: 'superuser@runnercommerce.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('SUPERUSER'),
      status: 'ACTIVE',
    },
    {
      name: 'System Admin',
      phone: '+10000000001',
      email: 'admin@runnercommerce.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('ADMIN'),
      status: 'ACTIVE',
    },
    {
      name: 'John Customer',
      phone: '+10000000002',
      email: 'john.customer@example.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('CUSTOMER'),
      status: 'ACTIVE',
    },
    {
      name: 'Jane Customer',
      phone: '+10000000003',
      email: 'jane.customer@example.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('CUSTOMER'),
      status: 'ACTIVE',
    },
    {
      name: 'Shop Owner Maria',
      phone: '+10000000004',
      email: 'maria@shopowner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('SHOP_OWNER'),
      status: 'ACTIVE',
    },
    {
      name: 'Shop Owner David',
      phone: '+10000000005',
      email: 'david@shopowner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('SHOP_OWNER'),
      status: 'ACTIVE',
    },
    {
      name: 'Runner Mike',
      phone: '+10000000006',
      email: 'mike@runner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('RUNNER'),
      status: 'ACTIVE',
    },
    {
      name: 'Runner Sarah',
      phone: '+10000000007',
      email: 'sarah@runner.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('RUNNER'),
      status: 'ACTIVE',
    },
    {
      name: 'Warehouse Staff',
      phone: '+10000000008',
      email: 'warehouse@runnercommerce.com',
      passwordHash: hashedPassword,
      roleId: roleMap.get('WAREHOUSE'),
      status: 'ACTIVE',
    },
  ];
  for (const userData of users) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        name: userData.name,
        phone: userData.phone,
        passwordHash: userData.passwordHash,
        roleId: userData.roleId,
        status: userData.status,
      },
      create: userData,
    });
  }
  console.log('✓ Users seeded');
}
//# sourceMappingURL=02_users.seed.js.map
