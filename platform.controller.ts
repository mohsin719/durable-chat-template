import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlatformConfigService } from '../platforms/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin/platform-configs')
@UseGuards(RolesGuard)
export class PlatformConfigController {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getAllConfigs() {
    const configs = await this.platformConfig.getAllConfigs();
    return { success: true, data: configs };
  }

  @Get(':platformName')
  async getConfig(@Param('platformName') platformName: string) {
    const config = await this.platformConfig.getPlatformConfig(platformName);
    return { success: true, data: config };
  }

  @Post()
  async createConfig(@Body() body: { platformName: string; otpLength: number; otpPattern?: string; description?: string }) {
    const config = await this.prisma.platformOtpConfig.create({
      data: {
        platformName: body.platformName,
        otpLength: body.otpLength,
        otpPattern: body.otpPattern,
        description: body.description,
      },
    });
    return { success: true, data: config };
  }

  @Put(':platformName')
  async updateConfig(
    @Param('platformName') platformName: string,
    @Body() body: { otpLength?: number; otpPattern?: string; description?: string }
  ) {
    const config = await this.prisma.platformOtpConfig.update({
      where: { platformName },
      data: {
        otpLength: body.otpLength,
        otpPattern: body.otpPattern,
        description: body.description,
      },
    });
    return { success: true, data: config };
  }

  @Delete(':platformName')
  async deleteConfig(@Param('platformName') platformName: string) {
    await this.prisma.platformOtpConfig.delete({
      where: { platformName },
    });
    return { success: true, message: 'Platform config deleted' };
  }

  @Post('seed')
  async seedDefaults() {
    await this.platformConfig.seedDefaultConfigs();
    return { success: true, message: 'Default platform configs seeded' };
  }
}
