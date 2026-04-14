import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsertPage = vi.fn().mockResolvedValue({ id: 1 });
const mockCreateManyDiscoveredUrl = vi.fn().mockResolvedValue({ count: 0 });
const mockUpdateManyJob = vi.fn().mockResolvedValue({ count: 1 });
const mockCountPages = vi.fn().mockResolvedValue(42);

vi.mock('@llm-crawler/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    getPrisma: vi.fn(() => ({
      page: { upsert: mockUpsertPage, count: mockCountPages },
      discoveredUrl: { createMany: mockCreateManyDiscoveredUrl },
      job: { updateMany: mockUpdateManyJob },
      $transaction: vi.fn(async (fn) =>
        fn({
          page: { upsert: mockUpsertPage, count: mockCountPages },
          discoveredUrl: { createMany: mockCreateManyDiscoveredUrl },
          job: { updateMany: mockUpdateManyJob },
        }),
      ),
    })),
    publishJobUpdate: vi.fn().mockResolvedValue(undefined),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

const { handler } = await import('../src/handler.js');
const { publishJobUpdate } = await import('@llm-crawler/shared');

function makeRecord(detail: object, messageId = 'msg-1') {
  return { messageId, body: JSON.stringify({ source: 'llm-crawler', 'detail-type': 'page.crawled', detail }) };
}

function makeSQSEvent(...records: ReturnType<typeof makeRecord>[]) {
  return { Records: records } as any;
}

const goodDetail = {
  jobId: 'job-1',
  url: 'https://example.com/',
  title: 'Home',
  description: '',
  depth: 0,
  newUrls: [],
};

describe('consumer handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountPages.mockResolvedValue(42);
  });

  it('returns SQSBatchResponse with empty batchItemFailures on success', async () => {
    const result = await handler(makeSQSEvent(makeRecord(goodDetail)));
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('upserts page data into Postgres', async () => {
    await handler(
      makeSQSEvent(
        makeRecord({
          jobId: 'job-1',
          url: 'https://example.com/about',
          title: 'About',
          description: 'About page',
          depth: 1,
          newUrls: [],
        }),
      ),
    );
    expect(mockUpsertPage).toHaveBeenCalled();
  });

  it('batch-inserts discovered URLs with createMany + skipDuplicates', async () => {
    await handler(
      makeSQSEvent(
        makeRecord({
          jobId: 'job-1',
          url: 'https://example.com/',
          title: 'Home',
          description: '',
          depth: 0,
          newUrls: ['https://example.com/about', 'https://example.com/docs'],
        }),
      ),
    );
    expect(mockCreateManyDiscoveredUrl).toHaveBeenCalledWith({
      data: [
        { jobId: 'job-1', url: 'https://example.com/about' },
        { jobId: 'job-1', url: 'https://example.com/docs' },
      ],
      skipDuplicates: true,
    });
  });

  it('skips createMany when newUrls is empty', async () => {
    await handler(makeSQSEvent(makeRecord(goodDetail)));
    expect(mockCreateManyDiscoveredUrl).not.toHaveBeenCalled();
  });

  it('publishes progress to Redis', async () => {
    await handler(makeSQSEvent(makeRecord(goodDetail)));
    expect(publishJobUpdate).toHaveBeenCalledWith('job-1', {
      type: 'progress',
      pagesFound: 42,
      url: 'https://example.com/',
    });
  });

  describe('job status updates', () => {
    it('transitions pending → running with fresh updatedAt', async () => {
      await handler(makeSQSEvent(makeRecord(goodDetail)));

      expect(mockUpdateManyJob).toHaveBeenCalledTimes(2);
      const flipCall = mockUpdateManyJob.mock.calls[0][0];
      expect(flipCall.where).toEqual({ id: 'job-1', status: 'pending' });
      expect(flipCall.data.status).toBe('running');
      expect(flipCall.data.updatedAt).toBeInstanceOf(Date);
    });

    it('bumps updatedAt only when status is running (not completed/failed)', async () => {
      await handler(makeSQSEvent(makeRecord(goodDetail)));

      const bumpCall = mockUpdateManyJob.mock.calls[1][0];
      expect(bumpCall.where).toEqual({ id: 'job-1', status: 'running' });
      expect(bumpCall.data).not.toHaveProperty('status');
      expect(bumpCall.data.updatedAt).toBeInstanceOf(Date);
    });

    it('does not write status field on the heartbeat update (preserves completed/failed)', async () => {
      await handler(makeSQSEvent(makeRecord(goodDetail)));

      for (const call of mockUpdateManyJob.mock.calls) {
        const arg = call[0];
        expect(arg.where.status).not.toBe('completed');
        expect(arg.where.status).not.toBe('failed');
      }
    });
  });

  describe('per-record error handling (partial batch failure)', () => {
    it('reports only the failed record, not the whole batch', async () => {
      mockUpsertPage.mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error('DB constraint violation'));

      const result = await handler(
        makeSQSEvent(
          makeRecord(goodDetail, 'msg-ok'),
          makeRecord({ ...goodDetail, url: 'https://example.com/bad' }, 'msg-bad'),
        ),
      );

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-bad' }]);
    });

    it('processes remaining records after a failure (does not short-circuit)', async () => {
      mockUpsertPage.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ id: 2 });

      const result = await handler(
        makeSQSEvent(
          makeRecord(goodDetail, 'msg-fail'),
          makeRecord({ ...goodDetail, url: 'https://example.com/ok' }, 'msg-ok'),
        ),
      );

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-fail' }]);
      expect(publishJobUpdate).toHaveBeenCalledOnce();
    });

    it('reports all records as failed when all throw', async () => {
      mockUpsertPage.mockRejectedValue(new Error('total failure'));

      const result = await handler(
        makeSQSEvent(makeRecord(goodDetail, 'msg-1'), makeRecord(goodDetail, 'msg-2'), makeRecord(goodDetail, 'msg-3')),
      );

      expect(result.batchItemFailures).toHaveLength(3);
    });

    it('handles malformed record body without crashing', async () => {
      const result = await handler({
        Records: [{ messageId: 'msg-bad', body: 'not-json' }],
      } as any);

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-bad' }]);
    });
  });
});
