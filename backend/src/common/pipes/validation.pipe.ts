import { ValidationError } from 'class-validator';
import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToClass(metatype, value);
    const errors = await import('class-validator').then((module) =>
      module.validate(object),
    );

    if (errors.length > 0) {
      const messages = errors
        .map((error: ValidationError) => {
          return Object.values(error.constraints || {}).join(', ');
        })
        .join('; ');

      throw new BadRequestException({
        statusCode: 400,
        error: 'Validation failed',
        message: messages,
        timestamp: new Date().toISOString(),
        path: '',
      });
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.some((type) => metatype === type);
  }
}
