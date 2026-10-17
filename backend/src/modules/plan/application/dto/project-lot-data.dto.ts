import { IsNotEmpty, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class ProjectLotDataDto {
  @IsString() @IsNotEmpty() @MaxLength(50) code!: string;
  @IsString() @MaxLength(255) address = '';
  @IsString() @MaxLength(80) type = '';
  @IsNumber() @Min(0) areaM2 = 0;
  @IsString() @MaxLength(80) perimeter = '';
  @IsString() @MaxLength(255) dimensions = '';
  @IsString() @MaxLength(80) front = '';
  @IsString() @MaxLength(80) leftSide = '';
  @IsString() @MaxLength(80) rightSide = '';
  @IsString() @MaxLength(80) back = '';
  @IsString() @MaxLength(80) status = '';
  @IsString() @MaxLength(255) owner = '';
}
