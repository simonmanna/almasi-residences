import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateEnquiryDto } from './enquiry.dto.js';

const base = {
  name: 'Ada Visitor',
  email: 'ada@example.com',
  phone: '+250788000000',
  intent: 'VIEWING',
  unitIds: [],
};

async function errorsFor(viewingDate: unknown) {
  const dto = plainToInstance(CreateEnquiryDto, { ...base, viewingDate });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'viewingDate');
}

describe('CreateEnquiryDto.viewingDate', () => {
  it('accepts a YYYY-MM-DD day', async () => {
    expect(await errorsFor('2026-10-15')).toEqual([]);
  });

  it('accepts no day at all', async () => {
    expect(await errorsFor(undefined)).toEqual([]);
  });

  it.each(['dddd-dd-dd', '15/10/2026', '2026-10-15T09:00', '26-10-15'])('rejects %s', async (v) => {
    expect(await errorsFor(v)).toHaveLength(1);
  });
});
