import { IsString, IsNotEmpty, IsEmail, MaxLength } from 'class-validator';

export class CreateIssueDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  reporterEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}
