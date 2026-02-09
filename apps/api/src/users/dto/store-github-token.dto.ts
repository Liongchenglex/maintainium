import { IsString, IsNotEmpty } from 'class-validator';

export class StoreGithubTokenDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}
