import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/shared/domain/errors.js';
import { Money } from '../../../src/shared/domain/money.js';
import { textLength } from '../../../src/shared/domain/text.js';
import { TimeOfDay } from '../../../src/shared/domain/time-of-day.js';
import { TimeWindow } from '../../../src/shared/domain/time-window.js';
import { Timezone } from '../../../src/shared/domain/timezone.js';
import { Weekday } from '../../../src/shared/domain/weekday.js';

const window = (day: number, start: string, end: string) => TimeWindow.fromStrings(day, start, end);
const saoPaulo = Timezone.fromString('America/Sao_Paulo');

describe('Money', () => {
  it('é inteiro em centavos e nunca negativo', () => {
    const price = Money.ofCents(1400);

    expect(price.cents).toBe(1400);
    expect(Money.ofCents(0).isZero()).toBe(true);
    expect(Money.ofCents(700).isLessThan(price)).toBe(true);
    expect(price.isLessThan(price)).toBe(false);
    expect(price.equals(Money.ofCents(1400))).toBe(true);
    expect(() => Money.ofCents(-1)).toThrow(ValidationError);
    expect(() => Money.ofCents(10.5)).toThrow('inteiro em centavos');
  });
});

describe('TimeOfDay', () => {
  it('aceita minutos de 15 em 15', () => {
    expect(TimeOfDay.fromString('18:45').minutes).toBe(18 * 60 + 45);
    expect(TimeOfDay.fromString('00:00').format()).toBe('00:00');
    expect(TimeOfDay.fromMinutes(23 * 60 + 45).format()).toBe('23:45');
  });

  it.each(['18:10', '7:00', '24:00', '18:60', 'abc', '18:00:00'])('recusa "%s"', (value) => {
    expect(() => TimeOfDay.fromString(value, 'start')).toThrow(ValidationError);
  });

  it('recusa minutos fora do dia', () => {
    expect(() => TimeOfDay.fromMinutes(24 * 60)).toThrow('entre 00:00 e 23:45');
    expect(() => TimeOfDay.fromMinutes(-15)).toThrow('entre 00:00 e 23:45');
  });

  it('aponta o campo no erro', () => {
    try {
      TimeOfDay.fromString('10:10', 'end');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('end');
    }
  });
});

describe('TimeWindow', () => {
  it('fim depois do início; virar a meia-noite é recusado', () => {
    expect(window(3, '18:00', '18:15').end.format()).toBe('18:15');
    expect(() => window(5, '22:00', '02:00')).toThrow('meia-noite');
    expect(() => window(5, '10:00', '10:00')).toThrow(ValidationError);
  });

  it('sobreposição vale no mesmo dia e o intervalo é semiaberto', () => {
    expect(window(3, '18:00', '20:00').overlaps(window(3, '19:45', '21:00'))).toBe(true);
    expect(window(3, '18:00', '20:00').overlaps(window(3, '20:00', '21:00'))).toBe(false);
    expect(window(3, '18:00', '20:00').overlaps(window(4, '18:00', '20:00'))).toBe(false);
    expect(TimeWindow.anyOverlap([window(1, '10:00', '11:00'), window(1, '10:30', '12:00')])).toBe(true);
    expect(TimeWindow.anyOverlap([window(1, '10:00', '11:00'), window(2, '10:30', '12:00')])).toBe(false);
  });

  it('contém um momento local com minutos livres', () => {
    const happyHour = window(3, '18:00', '20:00');

    expect(happyHour.contains(saoPaulo.localize(new Date('2026-12-02T21:30:00Z')))).toBe(true); // qua 18:30
    expect(happyHour.contains(saoPaulo.localize(new Date('2026-12-02T22:59:59Z')))).toBe(true); // qua 19:59
    expect(happyHour.contains(saoPaulo.localize(new Date('2026-12-02T23:00:00Z')))).toBe(false); // qua 20:00
    expect(happyHour.contains(saoPaulo.localize(new Date('2026-12-03T21:30:00Z')))).toBe(false); // qui
  });
});

describe('Weekday', () => {
  it('vai de 0 (domingo) a 6 (sábado), com instâncias únicas', () => {
    expect(Weekday.fromInt(3)).toBe(Weekday.fromInt(3));
    expect(Weekday.fromInt(6).value).toBe(6);
    expect(() => Weekday.fromInt(7)).toThrow('0 (domingo) a 6 (sábado)');
    expect(() => Weekday.fromInt(-1)).toThrow(ValidationError);
    expect(() => Weekday.fromInt(1.5)).toThrow(ValidationError);
  });
});

describe('Timezone', () => {
  it('converte o instante para dia e hora locais com o deslocamento', () => {
    const moment = saoPaulo.localize(new Date('2026-12-02T21:30:15Z'));

    expect(moment.weekday).toBe(Weekday.fromInt(3));
    expect(moment.minuteOfDay).toBe(18 * 60 + 30);
    expect(moment.time).toBe('18:30:15');
    expect(moment.iso).toBe('2026-12-02T18:30:15-03:00');
  });

  it('muda de dia conforme o fuso e escreve UTC como +00:00', () => {
    expect(Timezone.fromString('Asia/Tokyo').localize(new Date('2026-12-02T21:30:00Z')).iso).toBe(
      '2026-12-03T06:30:00+09:00',
    );
    expect(Timezone.fromString('UTC').localize(new Date('2026-12-02T00:05:00Z')).iso).toBe('2026-12-02T00:05:00+00:00');
  });

  it('só aceita nomes da lista IANA', () => {
    expect(saoPaulo.name).toBe('America/Sao_Paulo');
    expect(() => Timezone.fromString('Marte/Base_Alfa')).toThrow('lista IANA');
    expect(() => Timezone.fromString('+03:00')).toThrow(ValidationError);
  });
});

describe('textLength', () => {
  it('conta caracteres, não bytes', () => {
    expect(textLength('Lámen')).toBe(5);
    expect(textLength('🍺')).toBe(1);
  });
});
