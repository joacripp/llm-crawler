import { IsUrl, IsOptional, IsInt, Min, Max } from 'class-validator';
export class CreateJobDto {
  @IsUrl() url!: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) maxDepth?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10000) maxPages?: number;
}
