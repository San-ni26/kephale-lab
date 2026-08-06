import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Une erreur interne est survenue';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        code = HttpStatus[status] || 'HTTP_ERROR';
      } else if (typeof res === 'object' && res !== null) {
        if (res.error && typeof res.error === 'object' && res.error.message) {
          message = res.error.message;
          code = res.error.code || HttpStatus[status] || 'HTTP_ERROR';
          details = res.error.details;
        } else if (res.message) {
          message = Array.isArray(res.message) ? res.message.join(', ') : res.message;
          code = typeof res.error === 'string' ? res.error : HttpStatus[status] || 'HTTP_ERROR';
        } else {
          message = typeof res.error === 'string' ? res.error : 'Erreur de requête';
        }
      }
    } else if (exception instanceof Error) {
      // ── Security: Never expose raw error messages in production ────────────
      if (isProduction) {
        // Log internally with full detail
        this.logger.error(
          `[${request.method}] ${request.url} — ${exception.constructor.name}: ${exception.message}`,
          exception.stack,
        );
        // Return generic message to client
        message = 'Une erreur interne est survenue. Veuillez réessayer plus tard.';
        code = 'INTERNAL_SERVER_ERROR';
      } else {
        // In dev, expose the message for easier debugging
        message = exception.message;
        this.logger.error(`[DEV] ${exception.constructor.name}: ${exception.message}`, exception.stack);
      }
    }

    // Log 5xx errors always
    if (status >= 500) {
      this.logger.error(
        `[${status}] ${request.method} ${request.url} — ${code}: ${message}`,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        // Only include details in non-production or for client-facing validation errors
        ...(details && !isProduction ? { details } : {}),
        ...(details && status < 500 ? { details } : {}),
      },
    });
  }
}

