import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../common/decorators/user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomersService } from './customers.service';
import { UpsertRunnerPreferenceDto } from './dto/upsert-runner-preference.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
@Controller('customers/me/runner-preferences')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  list(@User() user: any) {
    return this.customers.listPreferences(user.userId);
  }

  @Put(':city')
  upsert(
    @User() user: any,
    @Param('city') city: string,
    @Body() dto: UpsertRunnerPreferenceDto,
  ) {
    return this.customers.upsertPreference(user.userId, city, dto.runnerPhone);
  }

  @Delete(':city')
  remove(@User() user: any, @Param('city') city: string) {
    return this.customers.removePreference(user.userId, city);
  }
}
