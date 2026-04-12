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
import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.js';
let JobsController = class JobsController {
    jobsService;
    constructor(jobsService) {
        this.jobsService = jobsService;
    }
    async createJob(dto, req) {
        const user = req.user;
        const sessionId = req.sessionId;
        return this.jobsService.createJob({
            rootUrl: dto.url, maxDepth: dto.maxDepth, maxPages: dto.maxPages,
            userId: user?.id, anonSessionId: user ? undefined : sessionId,
        });
    }
    async getJob(id) { return this.jobsService.getJob(id); }
    async getResult(id) {
        const url = await this.jobsService.getPresignedUrl(id);
        if (!url)
            return { error: 'Result not ready' };
        return { downloadUrl: url };
    }
    async listJobs(req) {
        return this.jobsService.listJobs(req.user.id);
    }
};
__decorate([
    Post(),
    UseGuards(OptionalAuthGuard),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateJobDto, Object]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "createJob", null);
__decorate([
    Get(':id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "getJob", null);
__decorate([
    Get(':id/result'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "getResult", null);
__decorate([
    Get(),
    UseGuards(JwtAuthGuard),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], JobsController.prototype, "listJobs", null);
JobsController = __decorate([
    Controller('api/jobs'),
    __metadata("design:paramtypes", [JobsService])
], JobsController);
export { JobsController };
//# sourceMappingURL=jobs.controller.js.map