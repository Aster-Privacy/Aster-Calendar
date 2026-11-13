//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export type HolidayRegion =
  "none" | "us" | "uk" | "de" | "fr" | "ca" | "au" | "pt" | "br" | "in";

export interface Holiday {
  date: Date;
  title: string;
}

export const HOLIDAY_EVENT_PREFIX = "holiday-";
export const HOLIDAY_CALENDAR_ID = "__holidays__";
export const HOLIDAY_COLOR = "#0b8043";

function easter_sunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

function offset(base: Date, days: number): Date {
  const result = new Date(base);

  result.setDate(result.getDate() + days);

  return result;
}

function nth_weekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  const first = new Date(year, month, 1);
  const shift = (weekday - first.getDay() + 7) % 7;

  return new Date(year, month, 1 + shift + (n - 1) * 7);
}

function last_weekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0);
  const shift = (last.getDay() - weekday + 7) % 7;

  return new Date(year, month + 1, 0 - shift);
}

function weekday_before(
  year: number,
  month: number,
  day: number,
  weekday: number,
): Date {
  const anchor = new Date(year, month, day);
  const shift = (anchor.getDay() - weekday + 7) % 7 || 7;

  return new Date(year, month, day - shift);
}

type DatedHoliday = [month: number, day: number, title: string];

const INDIA_GAZETTED_LUNAR_HOLIDAYS: Readonly<
  Record<number, readonly DatedHoliday[]>
> = {
  2025: [
    [1, 26, "Maha Shivaratri"],
    [2, 14, "Holi"],
    [2, 31, "Id-ul-Fitr"],
    [3, 10, "Mahavir Jayanti"],
    [4, 12, "Buddha Purnima"],
    [5, 7, "Id-ul-Zuha (Bakrid)"],
    [6, 6, "Muharram"],
    [7, 16, "Janmashtami"],
    [8, 5, "Milad-un-Nabi"],
    [9, 2, "Dussehra"],
    [9, 20, "Diwali (Deepavali)"],
    [10, 5, "Guru Nanak Jayanti"],
  ],
  2026: [
    [2, 4, "Holi"],
    [2, 21, "Id-ul-Fitr"],
    [2, 26, "Ram Navami"],
    [2, 31, "Mahavir Jayanti"],
    [4, 1, "Buddha Purnima"],
    [4, 27, "Id-ul-Zuha (Bakrid)"],
    [5, 26, "Muharram"],
    [7, 26, "Milad-un-Nabi"],
    [8, 4, "Janmashtami"],
    [9, 20, "Dussehra"],
    [10, 8, "Diwali (Deepavali)"],
    [10, 24, "Guru Nanak Jayanti"],
  ],
  2027: [
    [2, 10, "Id-ul-Fitr"],
    [2, 23, "Holi"],
    [3, 15, "Ram Navami"],
    [3, 19, "Mahavir Jayanti"],
    [4, 17, "Id-ul-Zuha (Bakrid)"],
    [4, 20, "Buddha Purnima"],
    [5, 16, "Muharram"],
    [7, 15, "Milad-un-Nabi"],
    [7, 25, "Janmashtami"],
    [9, 9, "Dussehra"],
    [9, 29, "Diwali (Deepavali)"],
    [10, 14, "Guru Nanak Jayanti"],
  ],
};

function india_holidays(year: number, easter: Date): Holiday[] {
  const dated = (INDIA_GAZETTED_LUNAR_HOLIDAYS[year] ?? []).map(
    ([month, day, title]) => ({ date: new Date(year, month, day), title }),
  );

  return [
    { date: new Date(year, 0, 26), title: "Republic Day" },
    { date: offset(easter, -2), title: "Good Friday" },
    { date: new Date(year, 7, 15), title: "Independence Day" },
    { date: new Date(year, 9, 2), title: "Gandhi Jayanti" },
    { date: new Date(year, 11, 25), title: "Christmas Day" },
    ...dated,
  ].sort((first, second) => first.date.getTime() - second.date.getTime());
}

function holidays_for_year(region: HolidayRegion, year: number): Holiday[] {
  const easter = easter_sunday(year);

  switch (region) {
    case "us":
      return [
        { date: new Date(year, 0, 1), title: "New Year's Day" },
        {
          date: nth_weekday(year, 0, 1, 3),
          title: "Martin Luther King Jr. Day",
        },
        { date: nth_weekday(year, 1, 1, 3), title: "Presidents' Day" },
        { date: last_weekday(year, 4, 1), title: "Memorial Day" },
        { date: new Date(year, 5, 19), title: "Juneteenth" },
        { date: new Date(year, 6, 4), title: "Independence Day" },
        { date: nth_weekday(year, 8, 1, 1), title: "Labor Day" },
        { date: new Date(year, 10, 11), title: "Veterans Day" },
        { date: nth_weekday(year, 10, 4, 4), title: "Thanksgiving" },
        { date: new Date(year, 11, 25), title: "Christmas Day" },
      ];
    case "uk":
      return [
        { date: new Date(year, 0, 1), title: "New Year's Day" },
        { date: offset(easter, -2), title: "Good Friday" },
        { date: offset(easter, 1), title: "Easter Monday" },
        { date: nth_weekday(year, 4, 1, 1), title: "Early May Bank Holiday" },
        { date: last_weekday(year, 4, 1), title: "Spring Bank Holiday" },
        { date: last_weekday(year, 7, 1), title: "Summer Bank Holiday" },
        { date: new Date(year, 11, 25), title: "Christmas Day" },
        { date: new Date(year, 11, 26), title: "Boxing Day" },
      ];
    case "de":
      return [
        { date: new Date(year, 0, 1), title: "Neujahr" },
        { date: offset(easter, -2), title: "Karfreitag" },
        { date: offset(easter, 1), title: "Ostermontag" },
        { date: new Date(year, 4, 1), title: "Tag der Arbeit" },
        { date: offset(easter, 39), title: "Christi Himmelfahrt" },
        { date: offset(easter, 50), title: "Pfingstmontag" },
        { date: new Date(year, 9, 3), title: "Tag der Deutschen Einheit" },
        { date: new Date(year, 11, 25), title: "1. Weihnachtstag" },
        { date: new Date(year, 11, 26), title: "2. Weihnachtstag" },
      ];
    case "fr":
      return [
        { date: new Date(year, 0, 1), title: "Jour de l'an" },
        { date: offset(easter, 1), title: "Lundi de Pâques" },
        { date: new Date(year, 4, 1), title: "Fête du Travail" },
        { date: new Date(year, 4, 8), title: "Victoire 1945" },
        { date: offset(easter, 39), title: "Ascension" },
        { date: offset(easter, 50), title: "Lundi de Pentecôte" },
        { date: new Date(year, 6, 14), title: "Fête nationale" },
        { date: new Date(year, 7, 15), title: "Assomption" },
        { date: new Date(year, 10, 1), title: "Toussaint" },
        { date: new Date(year, 10, 11), title: "Armistice 1918" },
        { date: new Date(year, 11, 25), title: "Noël" },
      ];
    case "ca":
      return [
        { date: new Date(year, 0, 1), title: "New Year's Day" },
        { date: offset(easter, -2), title: "Good Friday" },
        { date: weekday_before(year, 4, 25, 1), title: "Victoria Day" },
        { date: new Date(year, 6, 1), title: "Canada Day" },
        { date: nth_weekday(year, 8, 1, 1), title: "Labour Day" },
        { date: nth_weekday(year, 9, 1, 2), title: "Thanksgiving" },
        { date: new Date(year, 10, 11), title: "Remembrance Day" },
        { date: new Date(year, 11, 25), title: "Christmas Day" },
        { date: new Date(year, 11, 26), title: "Boxing Day" },
      ];
    case "au":
      return [
        { date: new Date(year, 0, 1), title: "New Year's Day" },
        { date: new Date(year, 0, 26), title: "Australia Day" },
        { date: offset(easter, -2), title: "Good Friday" },
        { date: offset(easter, 1), title: "Easter Monday" },
        { date: new Date(year, 3, 25), title: "Anzac Day" },
        { date: new Date(year, 11, 25), title: "Christmas Day" },
        { date: new Date(year, 11, 26), title: "Boxing Day" },
      ];
    case "pt":
      return [
        { date: new Date(year, 0, 1), title: "Ano Novo" },
        { date: offset(easter, -2), title: "Sexta-feira Santa" },
        { date: easter, title: "Páscoa" },
        { date: new Date(year, 3, 25), title: "Dia da Liberdade" },
        { date: new Date(year, 4, 1), title: "Dia do Trabalhador" },
        { date: offset(easter, 60), title: "Corpo de Deus" },
        { date: new Date(year, 5, 10), title: "Dia de Portugal" },
        { date: new Date(year, 7, 15), title: "Assunção de Nossa Senhora" },
        { date: new Date(year, 9, 5), title: "Implantação da República" },
        { date: new Date(year, 10, 1), title: "Dia de Todos os Santos" },
        { date: new Date(year, 11, 1), title: "Restauração da Independência" },
        { date: new Date(year, 11, 8), title: "Imaculada Conceição" },
        { date: new Date(year, 11, 25), title: "Natal" },
      ];
    case "br":
      return [
        { date: new Date(year, 0, 1), title: "Confraternização Universal" },
        { date: offset(easter, -2), title: "Sexta-feira Santa" },
        { date: new Date(year, 3, 21), title: "Tiradentes" },
        { date: new Date(year, 4, 1), title: "Dia do Trabalhador" },
        { date: new Date(year, 8, 7), title: "Independência do Brasil" },
        { date: new Date(year, 9, 12), title: "Nossa Senhora Aparecida" },
        { date: new Date(year, 10, 2), title: "Finados" },
        { date: new Date(year, 10, 15), title: "Proclamação da República" },
        { date: new Date(year, 10, 20), title: "Consciência Negra" },
        { date: new Date(year, 11, 25), title: "Natal" },
      ];
    case "in":
      return india_holidays(year, easter);
    default:
      return [];
  }
}

export function holidays_in_range(
  region: HolidayRegion,
  start: Date,
  end: Date,
): Holiday[] {
  if (region === "none") {
    return [];
  }

  const result: Holiday[] = [];

  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    for (const holiday of holidays_for_year(region, year)) {
      if (holiday.date >= start && holiday.date <= end) {
        result.push(holiday);
      }
    }
  }

  return result.sort(
    (first, second) => first.date.getTime() - second.date.getTime(),
  );
}

export function is_holiday_event(event: { id: string }): boolean {
  return event.id.startsWith(HOLIDAY_EVENT_PREFIX);
}
