import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SseService } from './sse.service.js';
export declare class SseController {
    private sseService;
    constructor(sseService: SseService);
    stream(jobId: string): Observable<MessageEvent>;
}
//# sourceMappingURL=sse.controller.d.ts.map