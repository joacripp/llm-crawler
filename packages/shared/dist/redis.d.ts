import type { RedisJobMessage } from './types.js';
export declare function publishJobUpdate(jobId: string, message: RedisJobMessage): Promise<void>;
export declare function disconnectRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map