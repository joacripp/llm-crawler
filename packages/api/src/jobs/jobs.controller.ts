import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';
import { JobsService } from './jobs.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.js';

@Controller('api/jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @Post()
  @UseGuards(OptionalAuthGuard)
  async createJob(@Body() dto: CreateJobDto, @Req() req: Request) {
    const user = (req as any).user;
    const sessionId = (req as any).sessionId;
    return this.jobsService.createJob({
      rootUrl: dto.url, maxDepth: dto.maxDepth, maxPages: dto.maxPages,
      userId: user?.id, anonSessionId: user ? undefined : sessionId,
    });
  }

  @Get(':id')
  async getJob(@Param('id') id: string) { return this.jobsService.getJob(id); }

  @Get(':id/result')
  async getResult(@Param('id') id: string) {
    const url = await this.jobsService.getPresignedUrl(id);
    if (!url) return { error: 'Result not ready' };
    return { downloadUrl: url };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async listJobs(@Req() req: Request) {
    return this.jobsService.listJobs((req as any).user.id);
  }
}
