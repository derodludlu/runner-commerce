"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
const ingestSecret = process.env.WHATSAPP_INGEST_SECRET;
const inputDir = process.env.WHATSAPP_INGEST_INPUT_DIR ?? './whatsapp-inbox/pending';
const processedDir = process.env.WHATSAPP_INGEST_PROCESSED_DIR ?? './whatsapp-inbox/processed';
const failedDir = process.env.WHATSAPP_INGEST_FAILED_DIR ?? './whatsapp-inbox/failed';
const pollMs = Number(process.env.WHATSAPP_INGEST_POLL_MS ?? 5000);
const runOnce = process.argv.includes('--once');
async function main() {
    if (!ingestSecret) {
        throw new Error('WHATSAPP_INGEST_SECRET is required');
    }
    await Promise.all([
        (0, promises_1.mkdir)(inputDir, { recursive: true }),
        (0, promises_1.mkdir)(processedDir, { recursive: true }),
        (0, promises_1.mkdir)(failedDir, { recursive: true }),
    ]);
    console.log(`WhatsApp ingest worker watching ${inputDir} -> ${backendUrl}/whatsapp-imports/webhook`);
    do {
        await processPendingFiles();
        if (!runOnce) {
            await sleep(pollMs);
        }
    } while (!runOnce);
}
async function processPendingFiles() {
    const files = (await (0, promises_1.readdir)(inputDir))
        .filter((file) => file.toLowerCase().endsWith('.json'))
        .sort();
    for (const file of files) {
        const fullPath = (0, node_path_1.join)(inputDir, file);
        const fileStat = await (0, promises_1.stat)(fullPath);
        if (!fileStat.isFile())
            continue;
        try {
            const batch = parseBatch(await (0, promises_1.readFile)(fullPath, 'utf8'), file);
            const result = await postBatch(batch);
            await archiveFile(fullPath, processedDir);
            console.log(`Imported ${file}: queued=${result.queued} parsed=${result.parsed} needsReview=${result.needsReview}`);
        }
        catch (error) {
            await archiveFile(fullPath, failedDir);
            console.error(`Failed ${file}: ${errorMessage(error)}`);
        }
    }
}
function parseBatch(raw, fileName) {
    const payload = JSON.parse(raw);
    if (!payload.shopId || typeof payload.shopId !== 'string') {
        throw new Error(`${fileName} is missing shopId`);
    }
    if (!Array.isArray(payload.posts) || payload.posts.length === 0) {
        throw new Error(`${fileName} must contain at least one post`);
    }
    return {
        shopId: payload.shopId,
        posts: payload.posts.map((post, index) => {
            if (!post.caption || typeof post.caption !== 'string') {
                throw new Error(`${fileName} post ${index + 1} is missing caption`);
            }
            return {
                caption: post.caption,
                sourceGroup: post.sourceGroup,
                senderPhone: post.senderPhone,
                messageId: post.messageId,
                mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls : [],
                receivedAt: post.receivedAt,
            };
        }),
    };
}
async function postBatch(batch) {
    const response = await fetch(`${backendUrl}/whatsapp-imports/webhook`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-whatsapp-ingest-secret': ingestSecret,
        },
        body: JSON.stringify(batch),
    });
    const body = await response.text();
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body}`);
    }
    return JSON.parse(body);
}
async function archiveFile(sourcePath, destinationDir) {
    const stampedName = `${Date.now()}-${(0, node_path_1.basename)(sourcePath)}`;
    await (0, promises_1.rename)(sourcePath, (0, node_path_1.join)(destinationDir, stampedName));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
main().catch((error) => {
    console.error(errorMessage(error));
    process.exit(1);
});
//# sourceMappingURL=whatsapp-ingest-worker.js.map