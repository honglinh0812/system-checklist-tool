#!/usr/bin/env python3
import re
import sys
import csv
from pathlib import Path


SECTION_HEADER_REGEX = re.compile(r'^echo\s+-e\s+"\\n\\n(\d+)\.\s*(.+?):\\n"')


def parse_checklist_bash(content: str):
    """
    Parse a checklist bash script into sections.

    Each section starts with a header like:
      echo -e "\n\n<N>. <Description>:\n"

    Returns a list of dicts: {id: str, name: str, body_lines: list[str]}
    """
    lines = content.splitlines()
    sections = []
    current = None

    for line in lines:
        header = SECTION_HEADER_REGEX.match(line.strip())
        if header:
            # start a new section
            if current:
                sections.append(current)
            num = header.group(1).strip()
            desc = header.group(2).strip()
            current = {
                'id': num,
                'name': desc,
                'body_lines': []
            }
        else:
            if current is not None:
                current['body_lines'].append(line)

    if current:
        sections.append(current)

    return sections


def to_oneliner_command(section_body_lines):
    """
    Convert a section bash block into a single command line that prints only
    a terminal status token we can compare against.

    Strategy:
      - Join all lines into a single shell command separated by '; '
      - Pipe output to: grep '==>' | tail -n1 | awk '{print $NF}'
        This extracts the final status token (OK or X-WARNING)
    """
    # Remove shebangs and empty noise
    cleaned = []
    for line in section_body_lines:
        s = line.rstrip()
        if not s:
            continue
        if s.startswith('#!'):
            continue
        cleaned.append(s)

    if not cleaned:
        return 'echo OK'

    # Ensure any literal newlines in echo -e won't break; we keep logic intact.
    # Join with '; ' to form a one-liner. Preserve original order and quoting.
    joined = ' ; '.join(cleaned)

    # Extract final token OK or <N-WARNING>. We map N-WARNING to WARNING by awk.
    # Keep the raw token by default to allow exact eq comparison to OK when OK.
    extractor = " | grep '==>' | tail -n1 | awk '{split($NF,a,"-"); print a[1]=="OK"?"OK":"WARNING"}'"
    oneliner = f"bash -lc \"{joined}\"{extractor}"
    return oneliner


def convert_to_csv(sections, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        # Header per new MOP 5-column spec
        writer.writerow(['ID', 'Command name', 'Command', 'Comparator', 'Reference Value'])
        for sec in sections:
            cmd_name = sec['name'] or f"Command_{sec['id']}"
            command = to_oneliner_command(sec['body_lines'])
            comparator = 'eq'
            reference = 'OK'
            writer.writerow([sec['id'], cmd_name, command, comparator, reference])


def main():
    if len(sys.argv) < 3:
        print('Usage: convert_checklist_to_mop.py <input_bash_checklist> <output_csv>')
        sys.exit(1)

    in_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2])

    if not in_path.exists():
        print(f'Input file not found: {in_path}')
        sys.exit(1)

    content = in_path.read_text(encoding='utf-8', errors='ignore')
    sections = parse_checklist_bash(content)
    if not sections:
        print('No sections detected. Ensure the bash file uses the expected echo header format.')
        sys.exit(2)

    convert_to_csv(sections, out_path)
    print(f'Converted {len(sections)} sections -> {out_path}')


if __name__ == '__main__':
    main()


