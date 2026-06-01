import { Body, Controller, Get, Post, Req, Res, UseGuards, BadRequestException, UnauthorizedException, InternalServerErrorException, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { toSafeUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger("AuthController");

  constructor(
    private readonly auth: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post("register")
  async register(@Body() body: unknown): Promise<
    | { success: true; data: { email: string } }
    | { success: false; error: string }
  > {
    return this.auth.register(body);
  }

  @Post("verify-signup")
  async verifySignup(@Body() body: unknown): Promise<
    | { success: true; data: { accessToken: string; refreshToken: string; user: ReturnType<typeof toSafeUser> } }
    | { success: false; error: string }
  > {
    return this.auth.verifySignupOtp(body);
  }

  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<
    | { success: true; data: { accessToken: string; refreshToken: string; user: ReturnType<typeof toSafeUser> } }
    | { success: false; error: string }
  > {
    try {
      const ipAddress = this.extractIpAddress(req);
      const result = await this.auth.login(body, ipAddress);

      if (!result.success) {
        throw new UnauthorizedException(result.error);
      }

      // Set refresh token as secure HTTP-only cookie
      res.cookie('refreshToken', result.data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: '/',
      });

      this.logger.log(`User logged in: ${result.data.user.email}`);

      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Login failed: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : '');
      throw new InternalServerErrorException('Login failed. Please try again.');
    }
  }

  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<
    | { success: true; data: { accessToken: string; user: ReturnType<typeof toSafeUser> } }
    | { success: false; error: string }
  > {
    try {
      // Get refresh token from cookie
      const refreshToken = (req as any).cookies?.refreshToken;

      if (!refreshToken) {
        throw new UnauthorizedException('No refresh token in cookies');
      }

      // Decode refresh token to get user ID
      let decoded: any;
      try {
        decoded = this.jwtService.verify(refreshToken, {
          secret: process.env.JWT_SECRET,
        });
      } catch (error) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const userId = decoded.sub;

      // Get new access token
      const result = await this.auth.refreshAccessToken(userId);

      if (!result.success) {
        throw new UnauthorizedException(result.error);
      }

      this.logger.log(`Token refreshed for user: ${result.data.user.email}`);

      return {
        success: true,
        data: { accessToken: result.data.accessToken, user: result.data.user },
      };
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error instanceof Error ? error.message : String(error)}`);

      // Clear bad cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        domain: process.env.COOKIE_DOMAIN || undefined,
      });

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new InternalServerErrorException('Token refresh failed');
    }
  }

  @Post("logout")
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true; message: string }> {
    try {
      // Get user ID from request if available
      const userId = (req as any).user?.id;

      // Clear sessions from DB if user is authenticated
      if (userId) {
        await this.auth.logout(userId);
      }

      // Clear the refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        domain: process.env.COOKIE_DOMAIN || undefined,
      });

      this.logger.log('User logged out');

      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error(`Logout failed: ${error instanceof Error ? error.message : String(error)}`);
      // Still clear cookie even if DB operation fails
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        domain: process.env.COOKIE_DOMAIN || undefined,
      });
      return { success: true, message: 'Logged out' };
    }
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  me(@CurrentUser() user: User): {
    success: true;
    data: ReturnType<typeof toSafeUser>;
  } {
    return { success: true, data: toSafeUser(user) };
  }

  @Post("forgot-password/request")
  async forgotPasswordRequest(
    @Body() body: unknown,
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    return this.auth.requestPasswordReset(body);
  }

  @Post("forgot-password/reset")
  async forgotPasswordReset(
    @Body() body: unknown,
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    return this.auth.resetPassword(body);
  }

  @Post("change-password")
  @UseGuards(AuthGuard("jwt"))
  async changePassword(
    @CurrentUser() user: User,
    @Body() body: { currentPassword: string; newPassword: string },
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    return this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @Post("change-password/request-otp")
  @UseGuards(AuthGuard("jwt"))
  async requestChangePasswordOtp(
    @CurrentUser() user: User,
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    return this.auth.requestChangePasswordOtp(user.id);
  }

  @Post("change-password/confirm")
  @UseGuards(AuthGuard("jwt"))
  async confirmChangePasswordOtp(
    @CurrentUser() user: User,
    @Body() body: { otp: string; newPassword: string },
  ): Promise<{ success: true; data: null } | { success: false; error: string }> {
    return this.auth.confirmChangePasswordOtp(user.id, body.otp, body.newPassword);
  }

  private extractIpAddress(req: Request): string {
    return (req as any).ip || (req as any).connection?.remoteAddress || "unknown";
  }
}
