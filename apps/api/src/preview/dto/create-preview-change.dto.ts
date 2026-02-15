import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreatePreviewChangeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  currentUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  elementText!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  cssSelector?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tagName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  requestedChange!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  pageTitle?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  nearestHeading?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  parentContext?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2500)
  outerHtml?: string;
}
