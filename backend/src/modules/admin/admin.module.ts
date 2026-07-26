import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { Phase1Module } from '../phase1/phase1.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, Phase1Module, AuthModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
