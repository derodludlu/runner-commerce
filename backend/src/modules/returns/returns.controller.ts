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
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnDto } from './dto/update-return.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Returns')
@Controller('returns')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReturnsController {
  constructor(private returnsService: ReturnsService) {}

  @Post()
  @ApiOperation({ summary: 'Create return request' })
  createReturn(@Request() req: any, @Body() dto: CreateReturnDto) {
    return this.returnsService.createReturn(req.user?.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all returns (Admin)' })
  getAllReturns(@Request() req: any, @Query('status') status?: string) {
    if (req.user?.role !== 'ADMIN') {
      return this.returnsService.getCustomerReturns(req.user?.userId);
    }
    return this.returnsService.getAllReturns(status);
  }

  @Get('my-returns')
  @ApiOperation({ summary: 'Get customer returns' })
  getMyReturns(@Request() req: any) {
    return this.returnsService.getCustomerReturns(req.user?.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get return by ID' })
  getReturn(@Param('id') id: string, @Request() req: any) {
    return this.returnsService.getReturn(id, req.user?.userId, req.user?.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update return (Admin)' })
  updateReturn(
    @Param('id') id: string,
    @Body() dto: UpdateReturnDto,
    @Request() req: any,
  ) {
    return this.returnsService.updateReturn(
      id,
      dto,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve return (Admin)' })
  approveReturn(@Param('id') id: string, @Request() req: any) {
    return this.returnsService.approveReturn(
      id,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject return (Admin)' })
  rejectReturn(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.returnsService.rejectReturn(
      id,
      reason,
      req.user?.userId,
      req.user?.role,
    );
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get return statistics (Admin)' })
  getReturnStats(@Request() req: any) {
    if (req.user?.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }
    return this.returnsService.getReturnStats();
  }
}
