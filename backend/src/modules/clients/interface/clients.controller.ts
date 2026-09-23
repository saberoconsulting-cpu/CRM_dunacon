// modules/clients/interface/clients.controller.ts
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
import { ClientsService } from '../application/clients.service';
import { CreateClientDto, AddContactDto } from '../application/dto/client.dto';
import { JwtAuthGuard } from '../../../shared/application/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../../shared/application/decorators/current-user.decorator';
import { UserRole } from '../../../shared/domain/enums';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  list(
    @Query('projectId') projectId?: string,
    @Query('agentId') agentId?: string,
    @Query('channel') channel?: string,
    @Query('campaignId') campaignId?: string,
    @Query('pipelineStatus') pipelineStatus?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.clientsService.list({
      projectId: projectId ? Number(projectId) : undefined,
      agentId: user?.role === UserRole.AGENT ? user.id : (agentId ? Number(agentId) : undefined),
      channel,
      campaignId: campaignId ? Number(campaignId) : undefined,
      pipelineStatus,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('metrics/channels')
  metrics(@Query('projectId') projectId?: string, @CurrentUser() user?: AuthUser) {
    return this.clientsService.metricsByChannel(projectId ? Number(projectId) : undefined, user?.role === UserRole.AGENT ? user.id : undefined);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.clientsService.getOne(id, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clientsService.create(user.role === UserRole.AGENT ? { ...dto, agentId: user.id } : dto, user.id);
  }

  @Post('update/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.update(id, user.role === UserRole.AGENT ? { ...dto, agentId: user.id } : dto, user.id, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Post('pipeline/:id')
  setPipeline(@Param('id', ParseIntPipe) id: number, @Body('pipelineStatus') pipelineStatus: string, @CurrentUser() user: AuthUser) {
    return this.clientsService.setPipeline(id, pipelineStatus, user.role === UserRole.AGENT ? user.id : undefined);
  }

  @Post('contact/:id')
  addContact(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddContactDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.addContact(id, dto, user.id, user.role === UserRole.AGENT ? user.id : undefined);
  }
}
