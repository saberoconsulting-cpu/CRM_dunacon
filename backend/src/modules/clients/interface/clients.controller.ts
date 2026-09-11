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
import { CurrentUser } from '../../../shared/application/decorators/current-user.decorator';

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
  ) {
    return this.clientsService.list({
      projectId: projectId ? Number(projectId) : undefined,
      agentId: agentId ? Number(agentId) : undefined,
      channel,
      campaignId: campaignId ? Number(campaignId) : undefined,
      pipelineStatus,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('metrics/channels')
  metrics(@Query('projectId') projectId?: string) {
    return this.clientsService.metricsByChannel(projectId ? Number(projectId) : undefined);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser('id') actorId: number) {
    return this.clientsService.create(dto, actorId);
  }

  @Post('update/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClientDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.clientsService.update(id, dto, actorId);
  }

  @Post('pipeline/:id')
  setPipeline(@Param('id', ParseIntPipe) id: number, @Body('pipelineStatus') pipelineStatus: string) {
    return this.clientsService.setPipeline(id, pipelineStatus);
  }

  @Post('contact/:id')
  addContact(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddContactDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.clientsService.addContact(id, dto, userId);
  }
}