import { describe, expect, it } from 'vitest';
import { AuditPeriod } from '../../../src/audit/domain/audit-period.js';
import { ValidationError } from '../../../src/shared/domain/errors.js';
import { LocalDate } from '../../../src/shared/domain/local-date.js';
import { Timezone } from '../../../src/shared/domain/timezone.js';

const saoPaulo = Timezone.fromString('America/Sao_Paulo');
const now = new Date('2026-12-02T21:30:00Z');

describe('LocalDate', () => {
  it('lê AAAA-MM-DD de calendário de verdade', () => {
    expect(LocalDate.fromString('2026-11-25').toString()).toBe('2026-11-25');
    expect(LocalDate.fromString('2028-02-29').next().toString()).toBe('2028-03-01');
    expect(LocalDate.fromString('2026-12-31').next().toString()).toBe('2027-01-01');
    expect(LocalDate.fromString('2026-11-25').isBefore(LocalDate.fromString('2026-11-26'))).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-11-31', '25/11/2026', '2026-1-5', ''])('recusa "%s"', (value) => {
    expect(() => LocalDate.fromString(value, 'dateIni')).toThrow(ValidationError);
  });
});

describe('Timezone.startOfDay', () => {
  it('é a meia-noite local convertida para UTC', () => {
    expect(saoPaulo.startOfDay(LocalDate.fromString('2026-11-25')).toISOString()).toBe('2026-11-25T03:00:00.000Z');
    expect(Timezone.fromString('Asia/Tokyo').startOfDay(LocalDate.fromString('2026-11-25')).toISOString()).toBe(
      '2026-11-24T15:00:00.000Z',
    );
    expect(Timezone.fromString('UTC').startOfDay(LocalDate.fromString('2026-11-25')).toISOString()).toBe(
      '2026-11-25T00:00:00.000Z',
    );
  });

  it('acerta o dia em que o horário de verão começa (Nova York, 8/3/2026)', () => {
    const newYork = Timezone.fromString('America/New_York');

    expect(newYork.startOfDay(LocalDate.fromString('2026-03-08')).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(newYork.startOfDay(LocalDate.fromString('2026-03-09')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
});

describe('AuditPeriod', () => {
  it('dias inclusivos no fuso do restaurante viram intervalo semiaberto', () => {
    const period = AuditPeriod.of('2026-11-25', '2026-11-26', saoPaulo, now);

    expect(period.from.toISOString()).toBe('2026-11-25T03:00:00.000Z');
    expect(period.until.toISOString()).toBe('2026-11-27T03:00:00.000Z');
  });

  it('sem dateEnd, vai até agora (inclusive)', () => {
    expect(AuditPeriod.of('2026-11-25', null, saoPaulo, now).until.getTime()).toBe(now.getTime() + 1);
  });

  it('o mesmo dia vale e o fim antes do início não', () => {
    expect(AuditPeriod.of('2026-11-25', '2026-11-25', saoPaulo, now).until.toISOString()).toBe(
      '2026-11-26T03:00:00.000Z',
    );
    expect(() => AuditPeriod.of('2026-11-26', '2026-11-25', saoPaulo, now)).toThrow(
      'dateEnd não pode ser anterior a dateIni.',
    );
    expect(() => AuditPeriod.of('2026-11-26', 'amanhã', saoPaulo, now)).toThrow(ValidationError);
  });
});
