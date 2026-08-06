import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { JwtPayload } from './auth.guard';
import { Request } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    
    if (!user) {
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Authentication required' },
      });
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      let message = 'Access denied';
      if (requiredRoles.includes('ARTIST')) message = 'Artist account required';
      if (requiredRoles.includes('ADMIN')) message = 'Admin access required';
      
      throw new ForbiddenException({
        success: false,
        error: { code: 'FORBIDDEN', message },
      });
    }

    return true;
  }
}
