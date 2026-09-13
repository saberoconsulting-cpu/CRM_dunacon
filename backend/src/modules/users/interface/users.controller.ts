// modules/users/interface/users.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from '../application/users.service';
import { CreateAgentDto } from '../application/dto/create-agent.dto';
import { CreateAdminDto } from '../application/dto/create-admin.dto';
import { UpdateUserDto } from '../application/dto/update-user.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/application/guards/roles.guard';
import { Roles } from '../../../shared/application/decorators/roles.decorator';
import { UserRole } from '../../../shared/domain/enums';
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  list(@Query('role') role?: string, @Query('status') status?: string) {
    return this.usersService.list(role, status);
  }

  @Get('access')
  access(@CurrentUser('id') userId: number) {
    return this.usersService.accessOf(userId);
  }

  @Get('agents')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  agents() {
    return this.usersService.findAgents();
  }

  @Get('admins')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  admins() {
    return this.usersService.findAdmins();
  }

  @Get('activity/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  activity(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.activity(id);
  }

  @Post('agent')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  createAgent(@Body() dto: CreateAgentDto, @CurrentUser('id') actorId: number) {
    return this.usersService.createAgent(dto, actorId);
  }

  @Post('admin')
  @Roles(UserRole.SUPERADMIN)
  createAdmin(@Body() dto: CreateAdminDto, @CurrentUser('id') actorId: number) {
    return this.usersService.createAdmin(dto, actorId);
  }

  @Post('update/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.usersService.update(id, dto, actorId);
  }

  @Post('status/:id/:status')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Param('status') status: 'active' | 'inactive',
    @CurrentUser('id') actorId: number,
  ) {
    return this.usersService.setStatus(id, status, actorId);
  }

  @Post('reset-password/:id')
  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body('newPassword') newPassword: string,
    @CurrentUser('id') actorId: number,
  ) {
    return this.usersService.resetPassword(id, newPassword, actorId);
  }
}
