import { Controller, Get, Param, Req, Sse, MessageEvent } from '@nestjs/common';
import { Request } from 'express';
import { Observable, Subject } from 'rxjs';
import { SseService } from './sse.service.js';

@Controller('api/jobs')
export class SseController {
  constructor(private sseService: SseService) {}

  @Sse(':id/stream')
  stream(@Param('id') jobId: string, @Req() req: Request): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const callback = (message: string) => {
      try { const data = JSON.parse(message); subject.next({ data, type: data.type }); } catch {}
    };
    this.sseService.subscribe(jobId, callback);

    // Clean up when the client disconnects (browser close, navigation away,
    // network drop). Without this the callback stays in SseService's map and
    // we leak memory + keep the Redis subscription open forever.
    req.on('close', () => {
      this.sseService.unsubscribe(jobId, callback);
      subject.complete();
    });

    return subject.asObservable();
  }
}
