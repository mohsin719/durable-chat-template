import { Module } from "@nestjs/common";
import { RateLimitGuard } from "./guards/rate-limit.guard";
import { PerformanceInterceptor } from "./interceptors/performance.interceptor";

@Module({
  providers: [RateLimitGuard, PerformanceInterceptor],
  exports: [RateLimitGuard, PerformanceInterceptor],
})
export class CommonModule {}
