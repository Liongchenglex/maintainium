import { IsOptional, IsUrl, ValidateIf } from 'class-validator';

export class UpdateProductionUrlDto {
  @IsOptional()
  @ValidateIf((o) => o.productionUrl !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  productionUrl!: string | null;
}
