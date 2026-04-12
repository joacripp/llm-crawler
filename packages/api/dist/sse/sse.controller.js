var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Param, Sse } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { SseService } from './sse.service.js';
let SseController = class SseController {
    sseService;
    constructor(sseService) {
        this.sseService = sseService;
    }
    stream(jobId) {
        const subject = new Subject();
        const callback = (message) => {
            try {
                const data = JSON.parse(message);
                subject.next({ data, type: data.type });
            }
            catch { }
        };
        this.sseService.subscribe(jobId, callback);
        subject.subscribe({
            complete: () => this.sseService.unsubscribe(jobId, callback),
            error: () => this.sseService.unsubscribe(jobId, callback),
        });
        return subject.asObservable();
    }
};
__decorate([
    Sse(':id/stream'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Observable)
], SseController.prototype, "stream", null);
SseController = __decorate([
    Controller('api/jobs'),
    __metadata("design:paramtypes", [SseService])
], SseController);
export { SseController };
//# sourceMappingURL=sse.controller.js.map