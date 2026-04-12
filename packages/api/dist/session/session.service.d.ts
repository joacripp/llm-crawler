export declare class SessionService {
    createSession(): Promise<{
        id: string;
    }>;
    findSession(id: string): Promise<any>;
    linkToUser(sessionId: string, userId: string): Promise<void>;
}
//# sourceMappingURL=session.service.d.ts.map