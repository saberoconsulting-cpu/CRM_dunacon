import { IsIn, IsObject, IsOptional, IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';
export class SaveFinancialAccountDto {
  @IsOptional() @IsObject() labels?: Record<string, string>;
  @IsString() @MaxLength(120) accountKey!: string;
  @IsString() @MaxLength(255) company!: string;
  @IsString() @Matches(/^\d{11}$/) ruc!: string;
  @IsString() @MaxLength(120) bank!: string;
  @IsIn(['PEN', 'USD']) currency!: string;
  @IsString() @Matches(/^[\d\s-]+$/) @Matches(/^(?:[\s-]*\d){13,20}[\s-]*$/) accountNumber!: string;
  @IsString() @Matches(/^[\d\s-]+$/) @Matches(/^(?:[\s-]*\d){20}[\s-]*$/) cci!: string;
  @IsNumber() @Min(0.000001) exchangeRate!: number;
}
