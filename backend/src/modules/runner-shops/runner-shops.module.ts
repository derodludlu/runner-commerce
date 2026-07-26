import { Module } from '@nestjs/common';
import { RunnerShopsService } from './runner-shops.service';
import { RunnerShopsController } from './runner-shops.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RunnerShopsService],
  controllers: [RunnerShopsController],
  exports: [RunnerShopsService],
})
export class RunnerShopsModule {}
