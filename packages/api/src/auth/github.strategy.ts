import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor() {
    super({
      clientID: process.env.GH_OAUTH_CLIENT_ID,
      clientSecret: process.env.GH_OAUTH_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL ?? 'https://api.llmtxtgenerator.online/api/auth/github/callback',
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: { id: string; emails?: Array<{ value: string }>; displayName?: string },
    done: (err: Error | null, user?: Record<string, unknown>) => void,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value ?? null;
    done(null, { oauthProvider: 'github', oauthId: profile.id, email });
  }
}
