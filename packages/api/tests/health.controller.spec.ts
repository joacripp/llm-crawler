import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';

const mockPingPrisma = vi.fn();
const mockPingRedis = vi.fn();

vi.mock('@llm-crawler/shared', () => ({
  pingPrisma: mockPingPrisma,
  pingRedis: mockPingRedis,
}));

const { HealthController } = await import('../src/health.controller.js');

function makeRes() {
  return {
    statusCode: 0,
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
  };
}

describe('HealthController', () => {
  let controller: InstanceType<typeof HealthController>;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new HealthController();
  });

  describe('check (liveness)', () => {
    it('returns ok without calling any dependency', () => {
      expect(controller.check()).toEqual({ status: 'ok' });
      expect(mockPingPrisma).not.toHaveBeenCalled();
      expect(mockPingRedis).not.toHaveBeenCalled();
    });
  });

  describe('ready (readiness)', () => {
    it('returns 200 + status=ok when DB and Redis are both healthy', async () => {
      mockPingPrisma.mockResolvedValue(true);
      mockPingRedis.mockResolvedValue(true);
      const res = makeRes();

      const body = await controller.ready(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(body).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
    });

    it('returns 503 + status=degraded when DB is down', async () => {
      mockPingPrisma.mockResolvedValue(false);
      mockPingRedis.mockResolvedValue(true);
      const res = makeRes();

      const body = await controller.ready(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body).toEqual({ status: 'degraded', checks: { db: 'fail', redis: 'ok' } });
    });

    it('returns 503 + status=degraded when Redis is down', async () => {
      mockPingPrisma.mockResolvedValue(true);
      mockPingRedis.mockResolvedValue(false);
      const res = makeRes();

      const body = await controller.ready(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body).toEqual({ status: 'degraded', checks: { db: 'ok', redis: 'fail' } });
    });

    it('returns 503 + status=degraded when both are down', async () => {
      mockPingPrisma.mockResolvedValue(false);
      mockPingRedis.mockResolvedValue(false);
      const res = makeRes();

      const body = await controller.ready(res as any);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body).toEqual({ status: 'degraded', checks: { db: 'fail', redis: 'fail' } });
    });

    it('runs both pings in parallel (does not await sequentially)', async () => {
      const order: string[] = [];
      mockPingPrisma.mockImplementation(async () => {
        order.push('db-start');
        await Promise.resolve();
        order.push('db-end');
        return true;
      });
      mockPingRedis.mockImplementation(async () => {
        order.push('redis-start');
        await Promise.resolve();
        order.push('redis-end');
        return true;
      });
      const res = makeRes();

      await controller.ready(res as any);

      // Both starts should happen before either ends (parallel start).
      expect(order.indexOf('redis-start')).toBeLessThan(order.indexOf('db-end'));
    });
  });
});
