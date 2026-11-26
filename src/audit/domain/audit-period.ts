import { ValidationError } from '../../shared/domain/errors.js';
import { LocalDate } from '../../shared/domain/local-date.js';
import type { Timezone } from '../../shared/domain/timezone.js';

/**
 * Período de consulta do log: dias inclusivos no fuso do restaurante, virados num intervalo semiaberto em UTC.
 * `dateIni=2026-11-25&dateEnd=2026-11-26` vai de 25/11 00:00 até antes de 27/11 00:00 locais; sem `dateEnd`, até agora.
 */
export class AuditPeriod {
  private constructor(
    /** Início, inclusive. */
    readonly from: Date,
    /** Fim, exclusive. */
    readonly until: Date,
  ) {}

  static of(dateIni: string, dateEnd: string | null, timezone: Timezone, now: Date): AuditPeriod {
    const start = LocalDate.fromString(dateIni, 'dateIni');
    const end = dateEnd === null ? null : LocalDate.fromString(dateEnd, 'dateEnd');
    if (end?.isBefore(start)) {
      throw new ValidationError('dateEnd não pode ser anterior a dateIni.', 'dateEnd');
    }
    const until = end === null ? new Date(now.getTime() + 1) : timezone.startOfDay(end.next());
    return new AuditPeriod(timezone.startOfDay(start), until);
  }
}
