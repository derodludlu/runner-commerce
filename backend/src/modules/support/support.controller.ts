import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Create support ticket' })
  createTicket(@Request() req: any, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(req.user?.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tickets (Admin) or customer tickets' })
  getTickets(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
  ) {
    if (req.user?.role === 'ADMIN') {
      return this.supportService.getAllTickets(status, priority, category);
    }
    return this.supportService.getCustomerTickets(req.user?.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket by ID' })
  getTicket(@Param('id') id: string, @Request() req: any) {
    return this.supportService.getTicket(id, req.user?.userId, req.user?.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket' })
  updateTicket(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @Request() req: any,
  ) {
    return this.supportService.updateTicket(
      id,
      dto,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add message to ticket' })
  addMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Request() req: any,
  ) {
    return this.supportService.addMessage(
      id,
      req.user?.userId,
      dto,
      req.user?.role,
    );
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign ticket to admin (Admin)' })
  assignTicket(
    @Param('id') id: string,
    @Body('adminId') adminId: string,
    @Request() req: any,
  ) {
    if (req.user?.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }
    return this.supportService.assignTicket(id, adminId);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve ticket (Admin)' })
  resolveTicket(@Param('id') id: string, @Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }
    return this.supportService.resolveTicket(
      id,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get ticket statistics (Admin)' })
  getTicketStats(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }
    return this.supportService.getTicketStats();
  }

  @Get('stats/by-category')
  @ApiOperation({ summary: 'Get tickets by category (Admin)' })
  getTicketsByCategory(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }
    return this.supportService.getTicketsByCategory();
  }
}
