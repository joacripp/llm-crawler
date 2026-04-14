import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform } from 'class-transformer';

const BLOCKED_HOSTNAMES = ['localhost', '0.0.0.0', '[::1]', '[::0]'];

const BLOCKED_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // private class A
  /^172\.(1[6-9]|2\d|3[01])\./, // private class B
  /^192\.168\./, // private class C
  /^169\.254\./, // link-local + AWS metadata
  /^0\./, // current network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
  /^0x/i, // hex-encoded IPs
];

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(lower)) return true;
  return BLOCKED_IP_PATTERNS.some((p) => p.test(lower));
}

@ValidatorConstraint({ name: 'isSafeUrl', async: false })
class IsSafeUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      if (isBlockedHost(parsed.hostname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `"${args.value}" is not a valid public URL`;
  }
}

export class CreateJobDto {
  @IsString()
  @Transform(({ value }) => {
    if (typeof value === 'string' && !value.match(/^https?:\/\//i)) {
      return `https://${value}`;
    }
    return value;
  })
  @Validate(IsSafeUrlConstraint)
  url!: string;

  @IsOptional() @IsInt() @Min(1) @Max(100) maxDepth?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) maxPages?: number;
}
