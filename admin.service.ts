import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  OtpRequestStatus,
  PhoneNumberStatus,
  TransactionType,
  type AdminLog,
  type OtpRequest,
  type PhoneNumber,
  type Prisma,
  type Transaction,
  type User,
  type Wallet,
} from "@prisma/client";
import {
  AdminAddNumberSchema,
  AdminAdjustBalanceSchema,
  AdminTransferBalanceSchema,
  PaginationQuerySchema,
} from "../shared/schemas";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { NumbersService } from "../numbers/numbers.service";
import { CooldownService } from "../numbers/cooldown.service";

const ACTIVE_USER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Shape returned by `user.findMany({ include: { wallet: true } })`. */
type UserWithWallet = User & { wallet: Wallet | null };

type TransactionWithUser = Transaction & {
  user: Pick<User, "publicId" | "email">;
};

type OtpLogRow = OtpRequest & {
  user: Pick<User, "publicId" | "email">;
  phoneNumber: Pick<PhoneNumber, "e164">;
};

type AdminLogRow = AdminLog & {
  admin: Pick<User, "email" | "publicId">;
  targetUser: Pick<User, "email" | "publicId"> | null;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly numbersService: NumbersService,
    private readonly cooldownService: CooldownService,
  ) {}

  private getStringQueryParam(query: unknown, key: string): string {
    if (typeof query !== "object" || query === null || !(key in query)) {
      return "";
    }
    const value = (query as Record<string, unknown>)[key];
    return typeof value === "string" ? value.trim() : "";
  }

  private getSafeSearchQuery(query: unknown, key = "search"): string {
    const value = this.getStringQueryParam(query, key);
    return value.length > 80 ? value.slice(0, 80) : value;
  }

  private async invalidateAdminCaches(patterns: string[], waitForCompletion = true): Promise<void> {
    if (!this.redis.isConfigured()) {
      return;
    }
    const patternSet = new Set<string>([
      ...patterns,
      "admin:number-platform-status:*",
      "admin:number-failure-logs:*",
    ]);
    const run = Promise.allSettled([...patternSet].map((pattern) => this.redis.delByPattern(pattern)));
    if (waitForCompletion) {
      await run;
      return;
    }
    void run;
  }

  async getStats(forceRefresh = false): Promise<{
    totalUsers: number;
    activeUsersLast30Days: number;
    revenuePkrApprox: number;
    
    pendingOtpRequests: number;
  }> {
    const CACHE_KEY = "admin:stats:v2";
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<{
        totalUsers: number;
        activeUsersLast30Days: number;
        revenuePkrApprox: number;
        
        pendingOtpRequests: number;
      }>(CACHE_KEY);
      if (cached) return cached;
    }

    const since = new Date(Date.now() - ACTIVE_USER_WINDOW_MS);
    const [totalUsers, activeUsersLast30Days, debitAgg, pendingOtp] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({
          where: { createdAt: { gte: since } },
        }),
        this.prisma.transaction.aggregate({
          where: { type: TransactionType.DEBIT },
          _sum: { amount: true },
        }),
        this.prisma.otpRequest.count({
          where: { status: OtpRequestStatus.PENDING },
        }),
      ]);
    const debitTotal = Number(debitAgg._sum.amount ?? 0);
    const stats = {
      totalUsers,
      activeUsersLast30Days,
      revenuePkrApprox: Math.abs(debitTotal),
      
      pendingOtpRequests: pendingOtp,
    };

    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, stats, 300); // cache for 5 minutes
    }
    
    return stats;
  }

  async listUsers(query: unknown, forceRefresh = false): Promise<{
    items: {
      id: string;
      publicId: string;
      email: string;
      username: string;
      role: User["role"];
      status: "ACTIVE" | "BANNED";
      isBanned: boolean; // backward-compatible alias
      balancePkr: number;
      
      createdAt: string;
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const search = this.getSafeSearchQuery(query);
    const CACHE_KEY = `admin:users:v2:p${page}:l${limit}:s${search}`;

    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }

    const normalized = search.toLowerCase();
    const normalizedPublicId = search.toUpperCase();
    const where: Prisma.UserWhereInput =
      search.length === 0
        ? {}
        : normalized.startsWith("usr-")
          ? { publicId: { startsWith: normalizedPublicId } }
          : normalized.includes("@")
            ? { email: { contains: normalized, mode: "insensitive" } }
            : {
                OR: [
                  { username: { contains: search, mode: "insensitive" } },
                  { email: { contains: normalized, mode: "insensitive" } },
                  { publicId: { contains: normalizedPublicId } },
                ],
              };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          publicId: true,
          email: true,
          username: true,
          role: true,
          status: true,
          isBanned: true,
          bannedReason: true,
          createdAt: true,
          updatedAt: true,
          wallet: {
            select: {
              balance: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    const result = {
      items: rows.map((u: UserWithWallet) => ({
        id: u.id,
        publicId: u.publicId,
        email: u.email,
        username: u.username,
        role: u.role,
        status: (u.isBanned ? "BANNED" : "ACTIVE") as "ACTIVE" | "BANNED",
        isBanned: u.isBanned,
        balancePkr: Number(u.wallet?.balance ?? 0),
        
        createdAt: u.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
      total,
      page,
      limit,
    };
    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 300); // cache for 5 minutes
    }
    return result;
  }

  async listNumberPlatformStatus(query: unknown, forceRefresh = false): Promise<{
    items: {
      id: string;
      numberId: string;
      e164: string;
      numberStatus: PhoneNumberStatus;
      platform: string;
      status: string;
      failureCount: number;
      successCount: number;
      healthScore: number;
      lastError: string | null;
      cooldownUntil: string | null;
      updatedAt: string;
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const platformFilter = this.getStringQueryParam(query, "platform");
    const statusFilter = this.getStringQueryParam(query, "status");
    const search = this.getSafeSearchQuery(query);

    const CACHE_KEY = `admin:number-platform-status:v1:p${page}:l${limit}:pf${platformFilter}:sf${statusFilter}:s${search}`;
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }

    // Get all platforms
    const platforms = platformFilter && platformFilter !== "ALL" ? [platformFilter] : ["Facebook", "Amazon", "Walmart", "Others"];
    const now = new Date();

    // Get all numbers from number_pools
    const allNumbers = await this.prisma.phoneNumber.findMany({
      select: {
        id: true,
        e164: true,
        status: true,
      },
    });

    // Get all platform status entries
    const allPlatformStatuses = await this.prisma.number_platform_status.findMany({
      where: {
        ...(search ? {
          OR: [
            { platform: { contains: search, mode: "insensitive" } },
            { last_error: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      },
    });

    // Build a map for quick lookup
    const statusMap = new Map<string, any>();
    allPlatformStatuses.forEach((ps: any) => {
      const key = `${ps.number_id}-${ps.platform}`;
      statusMap.set(key, ps);
    });

    // Generate rows for all number-platform combinations
    let allRows: any[] = [];
    allNumbers.forEach((number) => {
      platforms.forEach((platform) => {
        const key = `${number.id}-${platform}`;
        const status = statusMap.get(key);

        // Apply status filter
        if (statusFilter && statusFilter !== "ALL") {
          if (!status || status.status !== statusFilter) {
            return;
          }
        }

        // Apply search filter on number
        if (search && !number.e164.includes(search)) {
          return;
        }

        allRows.push({
          id: status?.id || `${number.id}-${platform}-virtual`,
          numberId: number.id,
          e164: number.e164,
          numberStatus: number.status,
          platform: platform,
          status: status?.status ?? "AVAILABLE",
          failureCount: status?.failure_count ?? 0,
          successCount: status?.success_count ?? 0,
          healthScore: status?.health_score ?? 100,
          lastError: status?.last_error ?? null,
          cooldownUntil: status?.cooldown_until ? new Date(status.cooldown_until).toISOString() : null,
          updatedAt: status?.updated_at ? new Date(status.updated_at).toISOString() : new Date().toISOString(),
        });
      });
    });

    // Sort by updated_at desc
    allRows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const total = allRows.length;
    const paginatedRows = allRows.slice(skip, skip + limit);

    const result = {
      items: paginatedRows,
      total,
      page,
      limit,
    };

    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 120);
    }

    return result;
  }

  async listNumberFailureLogs(query: unknown, forceRefresh = false): Promise<{
    items: {
      id: string;
      numberId: string;
      e164: string;
      platform: string;
      errorType: string;
      errorMessage: string | null;
      timestamp: string;
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const platformFilter = this.getStringQueryParam(query, "platform");
    const errorTypeFilter = this.getStringQueryParam(query, "errorType");
    const search = this.getSafeSearchQuery(query);

    const CACHE_KEY = `admin:number-failure-logs:v1:p${page}:l${limit}:pf${platformFilter}:ef${errorTypeFilter}:s${search}`;
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }

    const where: any = {
      ...(platformFilter && platformFilter !== "ALL" ? { platform: platformFilter } : {}),
      ...(errorTypeFilter && errorTypeFilter !== "ALL" ? { error_type: errorTypeFilter } : {}),
      ...(search
        ? {
            OR: [
              { platform: { contains: search, mode: "insensitive" } },
              { error_type: { contains: search, mode: "insensitive" } },
              { error_message: { contains: search, mode: "insensitive" } },
              { number_pools: { is: { e164: { contains: search } } } },
            ],
          }
        : {}),
    };

    const prismaAny = this.prisma as any;
    const [rows, total] = await Promise.all([
      prismaAny.number_failure_logs.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
        include: {
          number_pools: {
            select: {
              id: true,
              e164: true,
            },
          },
        },
      }),
      prismaAny.number_failure_logs.count({ where }),
    ]);

    const result = {
      items: rows.map((row: any) => ({
        id: row.id,
        numberId: row.number_pools.id,
        e164: row.number_pools.e164,
        platform: row.platform,
        errorType: row.error_type,
        errorMessage: row.error_message ?? null,
        timestamp: new Date(row.timestamp).toISOString(),
      })),
      total,
      page,
      limit,
    };

    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 120);
    }

    return result;
  }

  async setBanned(
    adminId: string,
    userId: string,
    banned: boolean,
    reason?: string,
    ipAddress?: string,
  ): Promise<{ success: true }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: banned,
        bannedReason: banned ? (reason ?? null) : null,
      },
    });
    await this.prisma.adminLog.create({
      data: {
        adminUserId: adminId,
        targetUserId: userId,
        action: banned ? "ban" : "unban",
        metadata: reason ? { reason, ipAddress } : { ipAddress },
      },
    });

    await this.invalidateAdminCaches([
      "admin:users:*",
      "admin:logs:*",
      "admin:stats",
    ]);

    return { success: true };
  }

  async adjustBalance(
    adminId: string,
    userId: string,
    rawBody: unknown,
    ipAddress?: string,
  ): Promise<
    | { success: true;  balancePkr: number }
    | { success: false; error: string }
  > {
    const parsed = AdminAdjustBalanceSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { success: false, error: "Invalid payload." };
    }
    const { amountPkr, reason } = parsed.data;
    const amount = amountPkr ?? 0;
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new NotFoundException("Wallet not found.");
    }
    const next = Number(wallet.balance ?? 0) + amount;
    if (next < 0) {
      throw new BadRequestException("Adjustment would make balance negative.");
    }
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });
      await tx.transaction.create({
        data: {
          userId,
          amount: amount,
          type: TransactionType.ADMIN_ADJUSTMENT,
          reference: reason,
          meta: { adminId },
        },
      });
      await tx.adminLog.create({
        data: {
          adminUserId: adminId,
          targetUserId: userId,
          action: "balance_adjust",
          metadata: { amountPkr: amount, reason, ipAddress },
        },
      });
    });

    await this.invalidateAdminCaches([
      "admin:users:*",
      "admin:tx:*",
      "admin:logs:*",
      "admin:stats",
    ], false);

    return { success: true, balancePkr: next };
  }

  async transferBalance(
    adminId: string,
    rawBody: unknown,
    ipAddress?: string,
  ): Promise<
    | {
        success: true;
        
        
        adminBalancePkr: number;
        targetBalancePkr: number;
        targetPublicId: string;
      }
    | { success: false; error: string }
  > {
    const parsed = AdminTransferBalanceSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { success: false, error: "Invalid payload." };
    }

    const { targetPublicId, amountPkr, reason } = parsed.data;
    const amount = amountPkr ?? 0;
    const normalizedTargetPublicId = targetPublicId.trim().toUpperCase();

    const [adminUser, targetUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: adminId },
        select: {
          id: true,
          publicId: true,
          wallet: {
            select: { balance: true },
          },
        },
      }),
      this.prisma.user.findFirst({
        where: { publicId: { equals: normalizedTargetPublicId, mode: "insensitive" } },
        select: {
          id: true,
          publicId: true,
          wallet: {
            select: { balance: true },
          },
        },
      }),
    ]);

    if (!adminUser?.wallet) {
      throw new NotFoundException("Admin wallet not found.");
    }
    if (!targetUser) {
      throw new NotFoundException("Target user not found.");
    }
    if (targetUser.id === adminId) {
      throw new BadRequestException("Use balance adjustment for your own wallet.");
    }

    const adminCurrent = Number(adminUser.wallet.balance ?? 0);
    if (adminCurrent < amount) {
      throw new BadRequestException("Insufficient admin balance for transfer.");
    }

    const targetCurrent = Number(targetUser.wallet?.balance ?? 0);

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const debit = await tx.wallet.updateMany({
        where: {
          userId: adminId,
          balance: { gte: amount },
        },
        data: { balance: { decrement: amount } },
      });
      if (debit.count !== 1) {
        throw new BadRequestException("Insufficient admin balance for transfer.");
      }

      await tx.wallet.upsert({
        where: { userId: targetUser.id },
        create: { userId: targetUser.id, balance: amount },
        update: { balance: { increment: amount } },
      });

      await tx.transaction.create({
        data: {
          userId: adminId,
          amount: -amount,
          type: TransactionType.ADMIN_ADJUSTMENT,
          reference: `Transfer to ${targetUser.publicId}: ${reason}`,
          meta: { direction: "out", targetPublicId: targetUser.publicId, adminId },
        },
      });

      await tx.transaction.create({
        data: {
          userId: targetUser.id,
          amount: amount,
          type: TransactionType.ADMIN_ADJUSTMENT,
          reference: `Transfer from ${adminUser.publicId}: ${reason}`,
          meta: { direction: "in", sourcePublicId: adminUser.publicId, adminId },
        },
      });

      await tx.adminLog.create({
        data: {
          adminUserId: adminId,
          targetUserId: targetUser.id,
          action: "balance_transfer",
          metadata: {
            amountPkr: amount,
            reason,
            sourcePublicId: adminUser.publicId,
            targetPublicId: targetUser.publicId,
            ipAddress,
          },
        },
      });

      return {
        adminBalance: adminCurrent - amount,
        targetBalance: targetCurrent + amount,
      };
    });

    await this.invalidateAdminCaches([
      "admin:users:*",
      "admin:tx:*",
      "admin:logs:*",
      "admin:stats",
    ], false);

    return {
      success: true,
      
      
      adminBalancePkr: result.adminBalance,
      targetBalancePkr: result.targetBalance,
      targetPublicId: targetUser.publicId,
    };
  }

  async listTransactions(query: unknown, forceRefresh = false): Promise<{
    items: unknown[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const typeFilter = this.getStringQueryParam(query, "type");
    const userSearch = this.getSafeSearchQuery(query);
    
    const CACHE_KEY = `admin:tx:v2:p${page}:l${limit}:t${typeFilter}:s${userSearch}`;
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }

    const where: Prisma.TransactionWhereInput = {
      ...(typeFilter && typeFilter !== "ALL"
        ? { type: typeFilter as TransactionType }
        : {}),
      ...(userSearch
        ? {
            user: {
              OR: [
                { publicId: { contains: userSearch, mode: "insensitive" } },
                { email: { contains: userSearch, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { publicId: true, email: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    const result = {
      items: items.map((t: TransactionWithUser) => ({
        id: t.id,
        userId: t.userId,
        userPublicId: t.user.publicId,
        email: t.user.email,
        amountPkr: Number(t.amount),
        
        type: t.type,
        reference: t.reference,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 300); // cache for 5 minutes
    }
    return result;
  }

  async listOtpLogs(query: unknown, forceRefresh = false): Promise<{
    items: unknown[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const statusFilter = this.getStringQueryParam(query, "status");
    const search = this.getSafeSearchQuery(query);

    const CACHE_KEY = `admin:otp-logs:v2:p${page}:l${limit}:st${statusFilter}:s${search}`;
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }

    const where: Prisma.OtpRequestWhereInput = {
      ...(statusFilter && statusFilter !== "ALL" ? { status: statusFilter as OtpRequestStatus } : {}),
      ...(search
        ? {
            OR: [
              { user: { publicId: { contains: search.toUpperCase() } } },
              { user: { email: { contains: search.toLowerCase(), mode: "insensitive" } } },
              { phoneNumber: { e164: { contains: search } } },
              { parsedOtp: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.otpRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: { select: { publicId: true, email: true } },
          phoneNumber: { select: { e164: true } },
        },
      }),
      this.prisma.otpRequest.count({ where }),
    ]);
    const result = {
      items: items.map((o: OtpLogRow) => ({
        id: o.id,
        userPublicId: o.user.publicId,
        email: o.user.email,
        phone: o.phoneNumber.e164,
        serviceType: o.serviceType ?? null,
        priceAtRequestPkr: o.priceAtRequest ?? null,
        status: o.status,
        parsedOtp: o.parsedOtp,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 120);
    }
    return result;
  }

  async listAdminLogs(query: unknown, forceRefresh = false): Promise<{
    items: unknown[];
    total: number;
    page: number;
    limit: number;
  }> {
    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const actionFilter = this.getStringQueryParam(query, "action");
    const search = this.getSafeSearchQuery(query);

    const CACHE_KEY = `admin:logs:p${page}:l${limit}:a${actionFilter}:s${search}`;
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }

    const where: Prisma.AdminLogWhereInput = {
      ...(actionFilter && actionFilter !== "ALL" ? { action: actionFilter } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { admin: { publicId: { contains: search.toUpperCase() } } },
              { admin: { email: { contains: search.toLowerCase(), mode: "insensitive" } } },
              { targetUser: { is: { publicId: { contains: search.toUpperCase() } } } },
              { targetUser: { is: { email: { contains: search.toLowerCase(), mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          admin: { select: { email: true, publicId: true } },
          targetUser: { select: { email: true, publicId: true } },
        },
      }),
      this.prisma.adminLog.count({ where }),
    ]);
    const result = {
      items: items.map((l: AdminLogRow) => ({
        id: l.id,
        action: l.action,
        adminEmail: l.admin.email,
        adminPublicId: l.admin.publicId,
        targetPublicId: l.targetUser?.publicId ?? null,
        metadata: l.metadata,
        createdAt: l.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 120);
    }
    return result;
  }

  async listNumbers(query: unknown, forceRefresh = false): Promise<{
    items: {
      id: string;
      e164: string;
      status: PhoneNumberStatus;
      userPublicId: string | null;
      leasedUntil: string | null;
      telnyxSid: string | null;
      createdAt: string;
      updatedAt: string;
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Lifecycle reconciliation moved to scheduled task - removed from hot path for performance

    const parsed = PaginationQuerySchema.safeParse(query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = parsed.success ? parsed.data.limit : 20;
    const skip = (page - 1) * limit;
    const statusFilter = this.getStringQueryParam(query, "status");
    const search = this.getSafeSearchQuery(query);
    
    const CACHE_KEY = `admin:numbers:p${page}:l${limit}:st${statusFilter}:s${search}`;
    if (this.redis.isConfigured() && !forceRefresh) {
      const cached = await this.redis.get<any>(CACHE_KEY);
      if (cached) return cached;
    }
    const where: Prisma.PhoneNumberWhereInput = {
      ...(statusFilter && statusFilter !== "ALL"
        ? { status: statusFilter as PhoneNumberStatus }
        : {}),
      ...(search ? { e164: { contains: search } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.phoneNumber.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { publicId: true } } },
      }),
      this.prisma.phoneNumber.count({ where }),
    ]);

    const result = {
      items: rows.map((n: PhoneNumber & { user: { publicId: string } | null }) => ({
        id: n.id,
        e164: n.e164,
        status: n.status,
        userPublicId: n.user?.publicId ?? null,
        leasedUntil: n.leasedUntil?.toISOString() ?? null,
        telnyxSid: n.telnyxSid ?? null,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
      total,
      page,
      limit,
    };

    if (this.redis.isConfigured()) {
      await this.redis.set(CACHE_KEY, result, 300); // cache for 5 minutes
    }
    return result;
  }

  async addNumber(adminId: string, rawBody: unknown, ipAddress?: string): Promise<
    | {
        success: true;
        number: {
          id: string;
          e164: string;
          status: PhoneNumberStatus;
          telnyxSid: string | null;
        };
      }
    | { success: false; error: string }
  > {
    const parsed = AdminAddNumberSchema.safeParse(rawBody);
    if (!parsed.success) {
      return { success: false, error: "Invalid payload." };
    }

    const { e164, telnyxSid } = parsed.data;
    const number = await this.prisma.phoneNumber.upsert({
      where: { e164 },
      update: {
        status: PhoneNumberStatus.AVAILABLE,
        userId: null,
        leasedUntil: null,
        telnyxSid: telnyxSid ?? null,
      },
      create: {
        e164,
        status: PhoneNumberStatus.AVAILABLE,
        telnyxSid: telnyxSid ?? null,
      },
    });
    await this.cooldownService.initializeStatusesForNumber(number.id);

    await this.prisma.adminLog.create({
      data: {
        adminUserId: adminId,
        action: "number_add",
        metadata: { e164, telnyxSid: telnyxSid ?? null, ipAddress },
      },
    });

    await this.invalidateAdminCaches([
      "admin:numbers:*",
      "admin:logs:*",
      "admin:stats",
    ]);

    return {
      success: true,
      number: {
        id: number.id,
        e164: number.e164,
        status: number.status,
        telnyxSid: number.telnyxSid,
      },
    };
  }

  async logAction(adminId: string, action: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.adminLog.create({
      data: {
        adminUserId: adminId,
        action,
        metadata: (metadata ?? {}) as Prisma.JsonObject,
      },
    });
  }

  async updateAdminPassword(adminId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: adminId },
      data: { passwordHash },
    });
    await this.prisma.adminLog.create({
      data: {
        adminUserId: adminId,
        action: "password_change",
        metadata: { changedAt: new Date().toISOString() },
      },
    });
  }
}
