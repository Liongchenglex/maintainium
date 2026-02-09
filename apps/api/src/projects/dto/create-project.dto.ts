import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class CreateProjectDto {
  @IsInt()
  githubRepoId!: number;

  @IsString()
  @IsNotEmpty()
  owner!: string;

  @IsString()
  @IsNotEmpty()
  repo!: string;
}
