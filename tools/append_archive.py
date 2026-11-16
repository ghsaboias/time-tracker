#!/usr/bin/env python3
"""Append rows from exported CSVs to the archive, skipping rows it already has.

usage: append_archive.py ARCHIVE SOURCE.csv [SOURCE.csv ...]

Rows are immutable once the extension writes them, so a row is a duplicate
when all four fields match. Sources may use the current header
(URL,Title,Start,End) or the January 2026 one (Type,URL,Title,Start,End);
old `media` rows are dropped. New rows are appended sorted by Start.
"""
import csv, os, sys

HEADER = ['URL', 'Title', 'Start', 'End']


def read_source(path):
    with open(path, newline='', encoding='utf-8') as fh:
        r = csv.reader(fh)
        h = next(r, None)
        if h == HEADER:
            for row in r:
                yield tuple(row)
        elif h == ['Type'] + HEADER:
            for row in r:
                if row[0] == 'visit':
                    yield tuple(row[1:])
        else:
            raise SystemExit(f'{path}: unexpected header {h}')


def sort_key(t):
    num = lambda s: int(s) if s.isdigit() else -1
    return (num(t[2]), num(t[3]), t[0], t[1])


def main(archive, sources):
    have = set()
    if os.path.exists(archive):
        with open(archive, 'rb+') as fh:  # drop a partial last line from an interrupted append
            data = fh.read()
            if data and not data.endswith(b'\n'):
                fh.truncate(data.rfind(b'\n') + 1)
        with open(archive, newline='', encoding='utf-8') as fh:
            r = csv.reader(fh)
            if next(r, None) != HEADER:
                raise SystemExit(f'{archive}: unexpected header')
            have = set(map(tuple, r))
    new = set()
    for src in sources:
        new.update(t for t in read_source(src) if t not in have)
    os.makedirs(os.path.dirname(os.path.abspath(archive)), exist_ok=True)
    fresh = not os.path.exists(archive) or os.path.getsize(archive) == 0
    with open(archive, 'a', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh, lineterminator='\n')
        if fresh:
            w.writerow(HEADER)
        w.writerows(sorted(new, key=sort_key))
        fh.flush()
        os.fsync(fh.fileno())
    print(f'appended {len(new)} rows; archive now {len(have) + len(new)} rows')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2:])
