import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import type { PageCrawledEvent, JobCompletedEvent } from '@llm-crawler/shared';
export declare class EventEmitter {
    private client;
    private busName;
    constructor(busName: string, client?: EventBridgeClient);
    emitPageCrawled(event: PageCrawledEvent): Promise<void>;
    emitJobCompleted(event: JobCompletedEvent): Promise<void>;
    private putEvent;
}
//# sourceMappingURL=event-emitter.d.ts.map