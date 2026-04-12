import Redis from 'ioredis';
let redis = null;
function getRedis() {
    if (!redis) {
        const url = process.env.REDIS_URL;
        if (!url)
            throw new Error('REDIS_URL env var is required');
        redis = new Redis(url);
    }
    return redis;
}
export async function publishJobUpdate(jobId, message) {
    const client = getRedis();
    await client.publish(`job:${jobId}`, JSON.stringify(message));
}
export async function disconnectRedis() {
    if (redis) {
        await redis.quit();
        redis = null;
    }
}
//# sourceMappingURL=redis.js.map