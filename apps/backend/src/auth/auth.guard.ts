import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

declare module 'express' {
  export interface Request {
    user?: JwtPayload;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' },
      });
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new Error('JWT_SECRET is not defined');
      }
      
      const payload = jwt.verify(token, secret) as JwtPayload;
      request.user = payload;
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token is invalid or expired' },
      });
    }
    
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
