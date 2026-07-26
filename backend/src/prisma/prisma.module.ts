// src/prisma/prisma.module.ts

import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule], // Make sure ConfigModule is available
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
