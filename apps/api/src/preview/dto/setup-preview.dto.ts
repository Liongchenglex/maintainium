import { IsUrl, IsNotEmpty, MaxLength } from 'class-validator';

export class SetupPreviewDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsNotEmpty()
  @MaxLength(2048)
  previewUrl!: string;
}
