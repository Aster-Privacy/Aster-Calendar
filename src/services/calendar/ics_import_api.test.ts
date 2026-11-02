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
import type { ImportedIcsEvent } from "@/services/calendar/ics_file";

import { beforeEach, describe, expect, it, vi } from "vitest";

const create_event = vi.fn();
const create_events_batch = vi.fn();
const delete_events_batch = vi.fn();

vi.mock("@/services/api/calendar", () => ({
  create_event: (...args: unknown[]) => create_event(...args),
  create_events_batch: (...args: unknown[]) => create_events_batch(...args),
  delete_events_batch: (...args: unknown[]) => delete_events_batch(...args),
}));

const { import_entries, import_entry_draft, import_ics_text, is_ics_file, undo_import } =
  await import("@/services/calendar/ics_import");

const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:one",
  "SUMMARY:One",
  "DTSTART:20260310T090000Z",
  "DTEND:20260310T100000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:two",
  "SUMMARY:Two",
  "DTSTART:20260311T090000Z",
  "DTEND:20260311T100000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function entry(uid: string): ImportedIcsEvent {
  return {
    title: uid,
    description: "notes",
    location: "Room",
    starts_at: "2026-10-12T09:00:00.000Z",
    ends_at: "2026-10-12T10:00:00.000Z",
    is_all_day: false,
    status: "confirmed",
    attendees: [],
    recurrence: null,
    recurrence_exceptions: [],
    availability: "busy",
    visibility: "default",
    conference_url: "",
    reminder_minutes: 10,
    uid,
    recurrence_id: null,
  };
}

function entries(count: number): ImportedIcsEvent[] {
  return Array.from({ length: count }, (_, index) => entry(`uid-${index}`));
}

beforeEach(() => {
  create_event.mockReset();
  create_events_batch.mockReset();
  delete_events_batch.mockReset();
});

describe("import_ics_text", () => {
  it("creates one event per parsed entry and counts the ones that saved", async () => {
    create_event
      .mockResolvedValueOnce({ data: { id: "e1" } })
      .mockResolvedValueOnce({ data: null });

    const result = await import_ics_text(FEED, "cal-1");

    expect(result).toEqual({ parsed: 2, imported: 1 });
    expect(create_event).toHaveBeenCalledTimes(2);
    expect(create_event.mock.calls[0][0]).toMatchObject({
      calendar_id: "cal-1",
      title: "One",
      uid: "one",
      tags: [],
      color: null,
    });
  });
});

describe("import_entry_draft", () => {
  it("copies the entry into a draft for the chosen calendar", () => {
    const draft = import_entry_draft(entry("x"), "cal-9");

    expect(draft).toMatchObject({
      calendar_id: "cal-9",
      title: "x",
      description: "notes",
      location: "Room",
      reminder_minutes: 10,
      uid: "x",
      event_kind: "default",
      guests_can_invite: true,
      guests_can_modify: false,
      working_location: null,
    });
  });
});

describe("import_entries", () => {
  it("sends drafts in chunks of fifty and reports progress", async () => {
    create_events_batch.mockImplementation(async (drafts: unknown[]) => ({
      data: drafts.map((_, index) => ({ event_id: `id-${index}` })),
    }));

    const progress: Array<[number, number]> = [];
    const ids = await import_entries(entries(120), "cal-1", (done, total) =>
      progress.push([done, total]),
    );

    expect(create_events_batch).toHaveBeenCalledTimes(3);
    expect(create_events_batch.mock.calls.map((call) => call[0].length)).toEqual(
      [50, 50, 20],
    );
    expect(ids).toHaveLength(120);
    expect(progress).toEqual([
      [50, 120],
      [100, 120],
      [120, 120],
    ]);
  });

  it("throws when a chunk fails", async () => {
    create_events_batch.mockResolvedValue({ data: null });

    await expect(import_entries(entries(2), "cal-1")).rejects.toThrow(
      "calendar import failed",
    );
  });
});

describe("undo_import", () => {
  it("deletes the created ids in chunks", async () => {
    delete_events_batch.mockResolvedValue({ data: [] });

    const ids = Array.from({ length: 60 }, (_, index) => `id-${index}`);

    await undo_import(ids);

    expect(delete_events_batch).toHaveBeenCalledTimes(2);
    expect(delete_events_batch.mock.calls[0][0]).toHaveLength(50);
    expect(delete_events_batch.mock.calls[1][0]).toHaveLength(10);
  });

  it("throws when the delete batch fails", async () => {
    delete_events_batch.mockResolvedValue({ data: null });

    await expect(undo_import(["id-1"])).rejects.toThrow(
      "calendar import undo failed",
    );
  });
});

describe("is_ics_file", () => {
  it("accepts the extension or the calendar mime type", () => {
    expect(is_ics_file(new File([""], "Export.ICS"))).toBe(true);
    expect(is_ics_file(new File([""], "feed", { type: "text/calendar" }))).toBe(
      true,
    );
    expect(is_ics_file(new File([""], "notes.txt", { type: "text/plain" }))).toBe(
      false,
    );
  });
});
