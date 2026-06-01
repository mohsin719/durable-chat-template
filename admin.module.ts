import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../auth/guards/roles.guard";
import { IntegrationsModule } from "../integrations/integrations.module";
import { RedisModule } from "../redis/redis.module";
import { NumbersModule } from "../numbers/numbers.module";
import { SecurityModule } from "../security/security.module";
import { PlatformsModule } from "../platforms/platforms.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { PlatformConfigController } from "./platform.controller";

@Module({
  imports: [AuthModule, IntegrationsModule, RedisModule, NumbersModule, SecurityModule, PlatformsModule],
  controllers: [AdminController, PlatformConfigController],
  providers: [AdminService, RolesGuard],
})
export class AdminModule {}

