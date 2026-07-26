"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
}
const pool = new pg_1.Pool({ connectionString: databaseUrl });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    console.log('🌱 Starting database seed...\n');
    await prisma.$transaction(async (tx) => {
        await (0, _01_roles_seed_1.default)(tx);
        await (0, _02_users_seed_1.default)(tx);
        await (0, _03_shops_1.default)(tx);
        await (0, _04_product_seed_1.default)(tx);
        await (0, _05_runner_seed_1.default)(tx);
        await (0, _06_listings_seed_1.default)(tx);
        await (0, _07_orders_seed_1.default)(tx);
        await (0, _08_batches_seed_1.default)(tx);
        await (0, _09_payments_seed_1.default)(tx);
    });
    console.log('\n✅ Database seeded successfully');
}
main()
    .catch((e) => {
    console.error('❌ Seed failed', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
});
// Import seed functions
const _01_roles_seed_1 = __importDefault(require("./seeds/01_roles.seed"));
const _02_users_seed_1 = __importDefault(require("./seeds/02_users.seed"));
const _03_shops_1 = __importDefault(require("./seeds/03_shops"));
const _04_product_seed_1 = __importDefault(require("./seeds/04_product.seed"));
const _05_runner_seed_1 = __importDefault(require("./seeds/05_runner.seed"));
const _06_listings_seed_1 = __importDefault(require("./seeds/06_listings.seed"));
const _07_orders_seed_1 = __importDefault(require("./seeds/07_orders.seed"));
const _08_batches_seed_1 = __importDefault(require("./seeds/08_batches.seed"));
const _09_payments_seed_1 = __importDefault(require("./seeds/09_payments.seed"));
//# sourceMappingURL=seed.js.map