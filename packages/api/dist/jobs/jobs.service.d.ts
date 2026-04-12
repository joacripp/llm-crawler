interface CreateJobOptions {
    rootUrl: string;
    maxDepth?: number;
    maxPages?: number;
    userId?: string;
    anonSessionId?: string;
}
export declare class JobsService {
    private sqs;
    createJob(options: CreateJobOptions): Promise<any>;
    getJob(jobId: string): Promise<any>;
    listJobs(userId: string): Promise<any>;
    getPresignedUrl(jobId: string): Promise<string | null>;
}
export {};
//# sourceMappingURL=jobs.service.d.ts.map