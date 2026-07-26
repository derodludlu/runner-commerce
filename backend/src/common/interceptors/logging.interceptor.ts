import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = context.getClass().name;
    const handler = context.getHandler().name;
    const userAgent = request.headers['user-agent'] || '';
    const ip = request.ip;

    const now = Date.now();

    // Log incoming request
    this.logger.log(
      `${method} -> ${handler} ${request.method} ${request.url} ${userAgent} ${ip}`,
    );

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        this.logger.log(
          `${method} -> ${handler} ${request.method} ${request.url} ${
            context.switchToHttp().getResponse().statusCode
          } ${responseTime}ms`,
        );
      }),
    );
  }
}
