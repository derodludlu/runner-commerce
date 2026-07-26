import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Log the exception details
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const validationMessage =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse as { message?: unknown }).message
        : undefined;
    const message =
      validationMessage ??
      (exception instanceof HttpException
        ? exception.message
        : 'Internal server error');
    const stack = exception instanceof Error ? exception.stack : undefined;

    // Log error with context
    this.logger.error(
      `HTTP Error: ${status}, Message: ${message}`,
      stack,
      `Method: ${request.method}, URL: ${request.url}, IP: ${request.ip}`,
    );

    // Prepare error response
    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
      ...(process.env.NODE_ENV !== 'production' && {
        stack,
      }),
    };

    response.status(status).json(errorResponse);
  }
}
