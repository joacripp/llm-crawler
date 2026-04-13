import { Controller, Post, Get, Param, Body, UseGuards, Req, Res, Header } from '@nestjs/common';
import { Response, Request } from 'express';
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
    return this.jobsService.createJob({
      rootUrl: dto.url,
      maxDepth: dto.maxDepth,
      maxPages: dto.maxPages,
      userId: req.user?.id,
      anonSessionId: req.user ? undefined : req.sessionId,
    });
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    return this.jobsService.getJob(id);
  }

  @Get(':id/result')
  async getResult(@Param('id') id: string) {
    const url = await this.jobsService.getPresignedUrl(id);
    if (!url) return { error: 'Result not ready' };
    return { downloadUrl: url };
  }

  @Get(':id/content')
  @Header('Content-Type', 'text/plain')
  async getContent(@Param('id') id: string, @Res() res: Response) {
    const content = await this.jobsService.getContent(id);
    if (!content) {
      res.status(404).json({ error: 'Result not ready' });
      return;
    }
    res.send(content);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async listJobs(@Req() req: Request) {
    // JwtAuthGuard guarantees req.user is set.
    return this.jobsService.listJobs(req.user!.id, req.sessionId);
  }
}
