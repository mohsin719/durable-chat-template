import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  HttpException,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { User } from "@prisma/client";
import { PhoneNumberStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { EmailService } from "../integrations/email.service";
import { BrevoEmailError } from "../integrations/email.errors";
import { RedisService } from "../redis/redis.service";
import { RateLimitService } from "../security/rate-limit.service";
import { NumbersSyncService, type SyncResult } from "../numbers/numbers-sync.service";
import { AdminService } from "./admin.service";

const ADMIN_MUTATION_RATE_LIMIT = {
  maxRequests: 10,
  windowSeconds: 60,
};

@Controller("admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
    private readonly rateLimitService: RateLimitService,
    private readonly numbersSync: NumbersSyncService,
  ) {}

  private async enforceAdminMutationRateLimit(adminId: string, action: string): Promise<void> {
    const key = `admin:${adminId}:${action}`;
    const exceeded = await this.rateLimitService.checkRateLimit(
      key,
      ADMIN_MUTATION_RATE_LIMIT.maxRequests,
      ADMIN_MUTATION_RATE_LIMIT.windowSeconds,
    );
    if (exceeded) {
      throw new HttpException(
        "Too many admin actions. Please wait a moment and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private isForceRefresh(refresh?: string): boolean {
    return refresh === "true";
  }

  @Get("stats")
  async stats(
    @CurrentUser() adminUser: User,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{ success: true; data: Awaited<ReturnType<AdminService["getStats"]>> }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.getStats(forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "stats_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Get("users")
  async users(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listUsers"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listUsers(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "users_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Get("numbers")
  async numbers(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listNumbers"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listNumbers(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "numbers_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Get("number-platform-status")
  async numberPlatformStatus(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listNumberPlatformStatus"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listNumberPlatformStatus(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "number_platform_status_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Get("number-failure-logs")
  async numberFailureLogs(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listNumberFailureLogs"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listNumberFailureLogs(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "number_failure_logs_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Post("numbers/sync")
  async syncNumbers(
    @CurrentUser() adminUser: User,
    @Req() req: Request,
  ): Promise<{ success: true; data: SyncResult } | { success: false; error: string }> {
    await this.enforceAdminMutationRateLimit(adminUser.id, "numbers-sync");

    try {
      const result = await this.numbersSync.syncFromTelnyx();
      const ipAddress = this.extractIpAddress(req);
      await this.admin.logAction(adminUser.id, "numbers_sync", {
        ...result,
        ipAddress,
      });
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Sync failed.",
      };
    }
  }

  @Post("numbers")
  async addNumber(
    @CurrentUser() admin: User,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<
    | {
        success: true;
        data: {
          id: string;
          e164: string;
          status: PhoneNumberStatus;
          telnyxSid: string | null;
        };
      }
    | { success: false; error: string }
  > {
    await this.enforceAdminMutationRateLimit(admin.id, "numbers-add");

    const ipAddress = this.extractIpAddress(req);
    const result = await this.admin.addNumber(admin.id, body, ipAddress);
    if (!result.success) {
      return result;
    }
    return { success: true, data: result.number };
  }

  @Patch("users/:id/ban")
  async ban(
    @CurrentUser() admin: User,
    @Param("id") userId: string,
    @Body() body: { reason?: string },
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.enforceAdminMutationRateLimit(admin.id, "users-ban");

    const ipAddress = this.extractIpAddress(req);
    return this.admin.setBanned(admin.id, userId, true, body.reason, ipAddress);
  }

  @Patch("users/:id/unban")
  async unban(
    @CurrentUser() admin: User,
    @Param("id") userId: string,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    await this.enforceAdminMutationRateLimit(admin.id, "users-unban");

    const ipAddress = this.extractIpAddress(req);
    return this.admin.setBanned(admin.id, userId, false, undefined, ipAddress);
  }

  @Post("users/:id/balance")
  async balance(
    @CurrentUser() admin: User,
    @Param("id") userId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<
    | { success: true; data: { balancePkr: number } }
    | { success: false; error: string }
  > {
    await this.enforceAdminMutationRateLimit(admin.id, "users-balance");

    const ipAddress = this.extractIpAddress(req);
    const result = await this.admin.adjustBalance(admin.id, userId, body, ipAddress);
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      data: { balancePkr: result.balancePkr },
    };
  }

  @Post("balance/transfer")
  async transferBalance(
    @CurrentUser() admin: User,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<
    | {
        success: true;
        data: {
          adminBalancePkr: number;
          targetBalancePkr: number;
          targetPublicId: string;
        };
      }
    | { success: false; error: string }
  > {
    await this.enforceAdminMutationRateLimit(admin.id, "balance-transfer");

    const ipAddress = this.extractIpAddress(req);
    const result = await this.admin.transferBalance(admin.id, body, ipAddress);
    if (!result.success) {
      return result;
    }
    return {
      success: true,
      data: {
        adminBalancePkr: result.adminBalancePkr,
        targetBalancePkr: result.targetBalancePkr,
        targetPublicId: result.targetPublicId,
      },
    };
  }

  @Post("change-password/request-otp")
  async requestPasswordChangeOtp(
    @CurrentUser() admin: User,
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    const redisKey = `admin_pwd_change:${admin.id}`;
    const cooldownKey = `admin_pwd_change_cd:${admin.id}`;

    // Rate-limit: 60-second cooldown between OTP requests
    const recentlySent = await this.redis.get(cooldownKey);
    if (recentlySent) {
      return {
        success: false,
        error: "Please wait 60 seconds before requesting a new code.",
      };
    }

    // Delete any previous OTP so we can issue a fresh one
    await this.redis.del(redisKey);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(redisKey, { otp, attempts: 0 }, 600);
    await this.redis.set(cooldownKey, 1, 60);

    try {
      await this.emailService.sendOtpEmail({
        to: admin.email,
        name: admin.username,
        otp,
        purpose: "password-change",
      });
    } catch (err) {
      await this.redis.del(redisKey);
      await this.redis.del(cooldownKey);
      if (err instanceof BrevoEmailError) {
        return {
          success: false,
          error: `Email delivery failed: ${err.toSanitizedResponse()}`,
        };
      }
      return { success: false, error: "Failed to send verification email." };
    }

    return { success: true, data: null };
  }

  @Post("change-password/confirm")
  async confirmPasswordChange(
    @CurrentUser() admin: User,
    @Body() body: { otp?: string; newPassword?: string },
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    const { otp, newPassword } = body;
    if (!otp || !newPassword) {
      return { success: false, error: "otp and newPassword are required." };
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return { success: false, error: "Password must be 8–128 characters." };
    }

    const redisKey = `admin_pwd_change:${admin.id}`;
    const record = await this.redis.get<{ otp: string; attempts: number }>(redisKey);

    if (!record) {
      return { success: false, error: "Invalid or expired code. Please request a new one." };
    }

    if (record.otp !== otp) {
      record.attempts += 1;
      if (record.attempts >= 5) {
        await this.redis.del(redisKey);
        return { success: false, error: "Too many incorrect attempts. Please request a new code." };
      }
      await this.redis.set(redisKey, record, 600);
      const remaining = 5 - record.attempts;
      return {
        success: false,
        error: `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
      };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.admin.updateAdminPassword(admin.id, passwordHash);
    await this.redis.del(redisKey);

    return { success: true, data: null };
  }

  private extractIpAddress(req: Request): string {
    return (req as any).ip || (req as any).connection?.remoteAddress || "unknown";
  }

  @Get("transactions")
  async transactions(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listTransactions"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listTransactions(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "transactions_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Get("otp-logs")
  async otpLogs(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listOtpLogs"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listOtpLogs(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "otp_logs_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }

  @Get("logs")
  async logs(
    @CurrentUser() adminUser: User,
    @Query() query: Record<string, unknown>,
    @Query("refresh") refresh?: string,
    @Req() req?: Request,
  ): Promise<{
    success: true;
    data: Awaited<ReturnType<AdminService["listAdminLogs"]>>;
  }> {
    const forceRefresh = this.isForceRefresh(refresh);
    const data = await this.admin.listAdminLogs(query, forceRefresh);
    if (forceRefresh) {
      await this.admin.logAction(adminUser.id, "admin_logs_refresh", {
        ipAddress: req ? this.extractIpAddress(req) : "unknown",
      });
    }
    return { success: true, data };
  }
}
