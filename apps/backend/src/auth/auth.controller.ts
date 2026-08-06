import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register — max 5 attempts per 10 minutes per IP
   * Prevents mass account creation and spam
   */
  @Post('register')
  @Throttle({ default: { ttl: 600000, limit: 5 } })
  async register(@Body() body: any) {
    const username = body.username || (await this.authService.generateUniqueUsername(body.name || 'User'));
    const result = await this.authService.localRegister({ ...body, username });
    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900,
        user: result.user,
      },
    };
  }

  /**
   * Login — max 10 attempts per 5 minutes per IP
   * Prevents brute-force password attacks
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 300000, limit: 10 } })
  async login(@Body() body: any) {
    const result = await this.authService.localLogin(body);
    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900,
        user: result.user,
      },
    };
  }

  /**
   * Google OAuth — max 20 attempts per 5 minutes
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 300000, limit: 20 } })
  async googleLogin(@Body() body: { idToken: string }) {
    const result = await this.authService.loginWithGoogle(body.idToken);
    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900,
        user: result.user,
      },
    };
  }

  /**
   * Refresh token — max 30 per minute
   * Prevents token refresh flooding
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async refresh(@Body() body: { refreshToken: string }) {
    const result = await this.authService.refreshTokens(body.refreshToken);
    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: 900,
      },
    };
  }

  /**
   * Logout — skip throttle (always allow users to logout)
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  async logout(@Body() body: { refreshToken: string }) {
    await this.authService.logout(body.refreshToken);
    return { success: true, data: null };
  }

  /**
   * Forgot password — max 3 per 15 minutes per IP
   * Prevents email bombing
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 900000, limit: 3 } })
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.requestPasswordReset(body.email);
  }

  /**
   * Reset password — max 5 attempts per 30 minutes per IP
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 1800000, limit: 5 } })
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.authService.resetPasswordConfirm(body.token, body.password);
  }
}

