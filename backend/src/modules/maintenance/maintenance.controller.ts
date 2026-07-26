import {
  Body,
  Controller,
  DefaultValuePipe,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MaintenanceService } from './maintenance.service';

@ApiTags('Maintenance')
@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERUSER')
@ApiBearerAuth()
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('storage-retention/run')
  @ApiOperation({
    summary: 'Run storage retention cleanup for old shop media and baskets',
  })
  runStorageRetention(
    @Body('retentionDays', new DefaultValuePipe(14), ParseIntPipe)
    retentionDays: number,
  ) {
    return this.maintenanceService.runRetentionCleanup(retentionDays);
  }
}
