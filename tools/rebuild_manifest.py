#!/usr/bin/env python3
"""Regenerate content/repository/manifest.json from the files on disk.

Run this after adding, renaming or removing anything under content/repository/,
then commit both the content and the regenerated manifest:

    python3 tools/rebuild_manifest.py

Layout it expects:

    content/repository/<sub-topic-id>/article-slug.md     articles (front-matter below)
    content/repository/<sub-topic-id>/anything-else.*     attachments (PDF, docx, xlsx, images...)
    content/repository/<sub-topic-id>/_names.json         optional: {"filename.pdf": "Display name"}

Attachment display names default to a cleaned-up filename; use _names.json in a
sub-topic folder to override them with proper titles (files starting with '_'
are never listed as attachments).

Markdown front-matter (all fields optional but title/author/date recommended):

    ---
    title: Human-readable article title
    author: m1            # a member id from js/data.js, or a plain name
    date: 2026-08-05      # ISO date, used for ordering (newest first)
    summary: One line shown in the article list.
    ---

The app loads only the manifest at boot; article bodies are fetched when opened.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content', 'repository')
OUT = os.path.join(CONTENT, 'manifest.json')

ATTACHMENT_LABELS = {
    '.pdf': 'PDF', '.doc': 'Word', '.docx': 'Word', '.xls': 'Excel',
    '.xlsx': 'Excel', '.ppt': 'PowerPoint', '.pptx': 'PowerPoint',
    '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image', '.gif': 'Image',
    '.csv': 'CSV', '.txt': 'Text',
}


def parse_front_matter(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    meta = {}
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n', text, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                meta[k.strip()] = v.strip()
    return meta


def human_size(n):
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            return f'{n:.0f} {unit}' if unit == 'B' else f'{n / 1:.1f} {unit}'.replace('.0 ', ' ')
        n /= 1024
    return f'{n} B'


def titleize(stem):
    return re.sub(r'[-_]+', ' ', stem).strip().capitalize()


def main():
    if not os.path.isdir(CONTENT):
        sys.exit(f'No content directory at {CONTENT}')

    manifest = {}
    for sub in sorted(os.listdir(CONTENT)):
        subdir = os.path.join(CONTENT, sub)
        if not os.path.isdir(subdir):
            continue
        names_path = os.path.join(subdir, '_names.json')
        names = {}
        if os.path.isfile(names_path):
            with open(names_path, encoding='utf-8') as f:
                names = json.load(f)

        articles, attachments = [], []
        for name in sorted(os.listdir(subdir)):
            if name.startswith('.') or name.startswith('_'):
                continue
            path = os.path.join(subdir, name)
            stem, ext = os.path.splitext(name)
            if ext.lower() == '.md':
                meta = parse_front_matter(path)
                articles.append({
                    'slug': stem,
                    'file': f'content/repository/{sub}/{name}',
                    'title': meta.get('title', titleize(stem)),
                    'author': meta.get('author', ''),
                    'date': meta.get('date', ''),
                    'summary': meta.get('summary', ''),
                })
            else:
                size = os.path.getsize(path)
                attachments.append({
                    'file': f'content/repository/{sub}/{name}',
                    'name': names.get(name, titleize(stem)),
                    'kind': ATTACHMENT_LABELS.get(ext.lower(), ext.lstrip('.').upper() or 'File'),
                    'size': human_size(size),
                })
        articles.sort(key=lambda a: a['date'], reverse=True)
        if articles or attachments:
            manifest[sub] = {'articles': articles, 'attachments': attachments}

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write('\n')

    subs = len(manifest)
    arts = sum(len(v['articles']) for v in manifest.values())
    atts = sum(len(v['attachments']) for v in manifest.values())
    print(f'Wrote {os.path.relpath(OUT, ROOT)}: {subs} sub-topics, {arts} articles, {atts} attachments')


if __name__ == '__main__':
    main()
