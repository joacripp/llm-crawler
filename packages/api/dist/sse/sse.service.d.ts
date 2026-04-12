import { OnModuleDestroy } from '@nestjs/common';
type MessageCallback = (message: string) => void;
export declare class SseService implements OnModuleDestroy {
    private subscriber;
    private callbacks;
    private getSubscriber;
    subscribe(jobId: string, callback: MessageCallback): Promise<void>;
    unsubscribe(jobId: string, callback?: MessageCallback): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
export {};
//# sourceMappingURL=sse.service.d.ts.map