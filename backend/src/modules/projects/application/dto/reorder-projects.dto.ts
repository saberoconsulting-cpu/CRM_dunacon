import { ArrayNotEmpty, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class ReorderProjectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  projectIds!: number[];
}
