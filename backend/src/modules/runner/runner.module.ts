// src/modules/runner/runner.module.ts

import { Module } from '@nestjs/common';
import { RunnerController } from './runner.controller';
import { RunnerService } from './runner.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RunnerController],
  providers: [RunnerService],
  exports: [RunnerService],
})
export class RunnerModule {}
