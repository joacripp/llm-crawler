import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateJob = vi.fn();
const mockGetJob = vi.fn();
const mockListJobs = vi.fn();
const mockGetPresignedUrl = vi.fn();
const mockGetContent = vi.fn();

const jobsService = {
  createJob: mockCreateJob,
  getJob: mockGetJob,
  listJobs: mockListJobs,
  getPresignedUrl: mockGetPresignedUrl,
  getContent: mockGetContent,
};

const { JobsController } = await import('../src/jobs/jobs.controller.js');

function makeRes() {
  return {
    statusCode: 200,
    sent: undefined as unknown,
    status: vi.fn(function (this: any, code: number) { this.statusCode = code; return this; }),
    json: vi.fn(function (this: any, body: any) { this.sent = body; return this; }),
    send: vi.fn(function (this: any, body: any) { this.sent = body; return this; }),
  };
}

describe('JobsController', () => {
  let controller: InstanceType<typeof JobsController>;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new JobsController(jobsService as any);
  });

  describe('createJob', () => {
    it('passes user id when authenticated', async () => {
      mockCreateJob.mockResolvedValue({ id: 'job-1' });
      const req = { user: { id: 'user-1' }, sessionId: 'sess-1' } as any;
      const result = await controller.createJob({ url: 'https://example.com', maxDepth: 2, maxPages: 50 } as any, req);

      expect(mockCreateJob).toHaveBeenCalledWith({
        rootUrl: 'https://example.com',
        maxDepth: 2,
        maxPages: 50,
        userId: 'user-1',
        anonSessionId: undefined,
      });
      expect(result).toEqual({ id: 'job-1' });
    });

    it('passes anonSessionId when unauthenticated', async () => {
      mockCreateJob.mockResolvedValue({ id: 'job-2' });
      const req = { user: undefined, sessionId: 'sess-9' } as any;
      await controller.createJob({ url: 'https://example.com' } as any, req);

      expect(mockCreateJob).toHaveBeenCalledWith({
        rootUrl: 'https://example.com',
        maxDepth: undefined,
        maxPages: undefined,
        userId: undefined,
        anonSessionId: 'sess-9',
      });
    });
  });

  describe('getJob', () => {
    it('delegates to service', async () => {
      mockGetJob.mockResolvedValue({ id: 'job-1', status: 'running', pagesFound: 7 });
      expect(await controller.getJob('job-1')).toEqual({ id: 'job-1', status: 'running', pagesFound: 7 });
      expect(mockGetJob).toHaveBeenCalledWith('job-1');
    });
  });

  describe('getResult', () => {
    it('returns presigned download URL when ready', async () => {
      mockGetPresignedUrl.mockResolvedValue('https://s3.example/llms.txt?sig=abc');
      expect(await controller.getResult('job-1')).toEqual({ downloadUrl: 'https://s3.example/llms.txt?sig=abc' });
    });

    it('returns error when not ready', async () => {
      mockGetPresignedUrl.mockResolvedValue(null);
      expect(await controller.getResult('job-1')).toEqual({ error: 'Result not ready' });
    });
  });

  describe('getContent', () => {
    it('streams llms.txt body when available', async () => {
      mockGetContent.mockResolvedValue('# Example\n');
      const res = makeRes();
      await controller.getContent('job-1', res as any);
      expect(res.send).toHaveBeenCalledWith('# Example\n');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 404 when content missing', async () => {
      mockGetContent.mockResolvedValue(null);
      const res = makeRes();
      await controller.getContent('job-1', res as any);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Result not ready' });
    });
  });

  describe('listJobs', () => {
    it('passes user id and sessionId from request', async () => {
      mockListJobs.mockResolvedValue([{ id: 'job-1' }]);
      const req = { user: { id: 'user-1' }, sessionId: 'sess-1' } as any;
      const result = await controller.listJobs(req);
      expect(mockListJobs).toHaveBeenCalledWith('user-1', 'sess-1');
      expect(result).toEqual([{ id: 'job-1' }]);
    });
  });
});
