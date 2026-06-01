"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const nestjs_pino_1 = require("nestjs-pino");
const admin_module_1 = require("./admin/admin.module");
const auth_module_1 = require("./auth/auth.module");
const env_validation_1 = require("./config/env.validation");
const config_controller_1 = require("./config/config.controller");
const health_controller_1 = require("./health/health.controller");
const numbers_module_1 = require("./numbers/numbers.module");
const prisma_module_1 = require("./prisma/prisma.module");
const realtime_module_1 = require("./realtime/realtime.module");
const redis_module_1 = require("./redis/redis.module");
const transactions_module_1 = require("./transactions/transactions.module");
const wallet_module_1 = require("./wallet/wallet.module");
const webhooks_module_1 = require("./webhooks/webhooks.module");
const common_module_1 = require("./common/common.module");
const rate_limit_guard_1 = require("./common/guards/rate-limit.guard");
const performance_interceptor_1 = require("./common/interceptors/performance.interceptor");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                validate: env_validation_1.validateEnv,
                envFilePath: [
                    (0, node_path_1.join)(process.cwd(), ".env"),
                    (0, node_path_1.join)(__dirname, "..", ".env"),
                    (0, node_path_1.join)(__dirname, "..", "..", ".env"),
                ],
            }),
            nestjs_pino_1.LoggerModule.forRoot({
                pinoHttp: {
                    transport: process.env.NODE_ENV !== "production"
                        ? { target: "pino-pretty", options: { singleLine: true } }
                        : undefined,
                    level: process.env.NODE_ENV !== "production" ? "debug" : "info",
                },
            }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60000,
                    limit: 100,
                },
            ]),
            redis_module_1.RedisModule,
            prisma_module_1.PrismaModule,
            common_module_1.CommonModule,
            auth_module_1.AuthModule,
            wallet_module_1.WalletModule,
            transactions_module_1.TransactionsModule,
            realtime_module_1.RealtimeModule,
            numbers_module_1.NumbersModule,
            webhooks_module_1.WebhooksModule,
            admin_module_1.AdminModule,
        ],
        controllers: [health_controller_1.HealthController, config_controller_1.ConfigController],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: rate_limit_guard_1.RateLimitGuard,
            },
            {
                provide: core_1.APP_INTERCEPTOR,
                useClass: performance_interceptor_1.PerformanceInterceptor,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map