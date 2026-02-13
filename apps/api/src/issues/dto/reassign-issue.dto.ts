import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ReassignIssueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  assignedArea!: string;
}
