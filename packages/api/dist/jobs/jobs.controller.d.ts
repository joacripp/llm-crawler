import { Request } from 'express';
import { JobsService } from './jobs.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
export declare class JobsController {
    private jobsService;
    constructor(jobsService: JobsService);
    createJob(dto: CreateJobDto, req: Request): Promise<any>;
    getJob(id: string): Promise<any>;
    getResult(id: string): Promise<{
        error: string;
        downloadUrl?: undefined;
    } | {
        downloadUrl: string;
        error?: undefined;
    }>;
    listJobs(req: Request): Promise<any>;
}
//# sourceMappingURL=jobs.controller.d.ts.map