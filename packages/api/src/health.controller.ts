import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { pingPrisma, pingRedis } from '@llm-crawler/shared';

@Controller('api/health')
export class HealthController {
  /**
   * Liveness probe. Used by ALB target-group health checks — must stay
   * cheap and dependency-free so a Redis/DB blip doesn't cycle ECS tasks.
   */
  @Get()
  check() {
    return { status: 'ok' };
  }

  /**
   * Readiness probe. Pings every external dependency and reports per-component
   * status. Returns 200 when all checks pass, 503 otherwise. Intended for
   * dashboards and on-call debugging — NOT wired into ALB.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([pingPrisma(), pingRedis()]);
    const ok = db && redis;
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      checks: {
        db: db ? 'ok' : 'fail',
        redis: redis ? 'ok' : 'fail',
      },
    };
  }
}
