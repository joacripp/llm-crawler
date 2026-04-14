import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL ?? 'https://api.llmtxtgenerator.online/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: { id: string; emails?: Array<{ value: string }>; displayName?: string },
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value ?? null;
    done(null, { oauthProvider: 'google', oauthId: profile.id, email });
  }
}
