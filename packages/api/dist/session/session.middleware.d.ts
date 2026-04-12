import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SessionService } from './session.service.js';
export declare class SessionMiddleware implements NestMiddleware {
    private sessionService;
    constructor(sessionService: SessionService);
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
}
//# sourceMappingURL=session.middleware.d.ts.map