import { Response } from 'express';
import { AuthService } from './auth.service.js';
import { SessionService } from '../session/session.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
export declare class AuthController {
    private authService;
    private sessionService;
    constructor(authService: AuthService, sessionService: SessionService);
    signup(dto: SignupDto, res: Response): Promise<{
        id: any;
        email: any;
    }>;
    login(dto: LoginDto, res: Response): Promise<{
        id: any;
        email: any;
    }>;
    logout(res: Response): Promise<{
        ok: boolean;
    }>;
    private setTokenCookies;
}
//# sourceMappingURL=auth.controller.d.ts.map