import { BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  it('accepts only supported procurement cities', () => {
    const service = new CustomersService({} as any);
    expect(service.city('durban')).toBe('DURBAN');
    expect(() => service.city('Cape Town')).toThrow(BadRequestException);
  });

  it('normalizes a trusted runner number', () => {
    const service = new CustomersService({} as any);
    expect(service.phone('268 76 154 884')).toBe('+26876154884');
    expect(() => service.phone('123')).toThrow(BadRequestException);
  });
});
