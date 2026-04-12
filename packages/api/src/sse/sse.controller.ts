import { Controller, Get, Param, Sse, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SseService } from './sse.service.js';

@Controller('api/jobs')
export class SseController {
  constructor(private sseService: SseService) {}

  @Sse(':id/stream')
  stream(@Param('id') jobId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const callback = (message: string) => {
      try { const data = JSON.parse(message); subject.next({ data, type: data.type }); } catch {}
    };
    this.sseService.subscribe(jobId, callback);
    subject.subscribe({
      complete: () => this.sseService.unsubscribe(jobId, callback),
      error: () => this.sseService.unsubscribe(jobId, callback),
    });
    return subject.asObservable();
  }
}
