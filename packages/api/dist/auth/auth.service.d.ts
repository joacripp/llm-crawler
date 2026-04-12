import { JwtService } from '@nestjs/jwt';
export declare class AuthService {
    private jwtService;
    constructor(jwtService: JwtService);
    signup(email: string, password: string): Promise<any>;
    validateUser(email: string, password: string): Promise<any>;
    generateTokens(user: {
        id: string;
        email: string | null;
    }): {
        accessToken: string;
        refreshToken: string;
    };
}
//# sourceMappingURL=auth.service.d.ts.map