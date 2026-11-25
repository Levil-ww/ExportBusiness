"""Chrome Native Messaging host: show Windows folder chooser and return path."""
import json
import struct
import sys
import tkinter as tk
from tkinter import filedialog
from pathlib import Path
import datetime
import hashlib
import shutil
import re
import olefile

if sys.platform == 'win32':
    import msvcrt
    import os
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def respond(value):
    data = json.dumps(value, ensure_ascii=False).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('=I', len(data)) + data)
    sys.stdout.buffer.flush()


def normalize_biff(data):
    """Remove the BIFF WRITEACCESS author record while preserving all other records."""
    output = bytearray()
    offset = 0
    while offset < len(data):
        if len(data) - offset < 4:
            if any(data[offset:]):
                raise ValueError('无效的 Excel 数据记录')
            output.extend(data[offset:])
            break
        kind, size = struct.unpack_from('<HH', data, offset)
        end = offset + 4 + size
        if end > len(data):
            raise ValueError('不完整的 Excel 数据记录')
        if kind == 0x002f:
            raise ValueError('无法比较加密的 Excel 文件')
        if kind != 0x005c:
            output.extend(data[offset:end])
        offset = end
    return bytes(output)


def equivalent_xls(first, second):
    """Conservatively compare workbook records and other non-property streams."""
    try:
        if not olefile.isOleFile(str(first)) or not olefile.isOleFile(str(second)):
            return False
        with olefile.OleFileIO(str(first)) as a, olefile.OleFileIO(str(second)) as b:
            ignored = {'\x05summaryinformation', '\x05documentsummaryinformation'}
            streams_a = {tuple(path) for path in a.listdir() if not (len(path) == 1 and path[0].lower() in ignored)}
            streams_b = {tuple(path) for path in b.listdir() if not (len(path) == 1 and path[0].lower() in ignored)}
            if streams_a != streams_b:
                return False
            workbook_found = False
            for path in streams_a:
                left = a.openstream(list(path)).read()
                right = b.openstream(list(path)).read()
                if len(path) == 1 and path[0].lower() == 'workbook':
                    workbook_found = True
                    if normalize_biff(left) != normalize_biff(right):
                        return False
                elif left != right:
                    return False
            return workbook_found
    except (OSError, ValueError, EOFError, IndexError, struct.error):
        return False


def find_existing(root, stage, start, end):
    start_date = datetime.date.fromisoformat(start)
    end_date = datetime.date.fromisoformat(end)
    if start_date > end_date:
        raise ValueError('日期范围无效')
    root_path = Path(root)
    if not root_path.is_dir():
        raise ValueError('设置的根目录不存在或无法访问：' + root)
    month = root_path / (str(end_date.month) + '月份')
    if not month.exists():
        return None
    if not month.is_dir():
        raise ValueError('月份路径不是文件夹：' + str(month))
    compact_start = start.replace('-', '')
    compact_end = end.replace('-', '')
    names = {
        'product': '【生意参谋平台】商品_全部_' + start + '_' + end,
        'traffic': '【生意参谋平台】无线店铺流量来源-' + start + '_' + end,
        'search': '【生意参谋】选词助手-引流搜索词-店外-无线-' + compact_start + '-' + compact_end,
    }
    if stage == 'content':
        pattern = r'光合_资产总览_作品分析_' + compact_start + '至' + compact_end + r'_下载日期\d{8}_[0-9a-fA-F]+'
    elif stage in names:
        pattern = re.escape(names[stage])
    else:
        raise ValueError('未知下载类型')
    pattern += r'(?: \([1-9]\d*\))?\.(?:xls|xlsx|csv)'
    for file in sorted(month.iterdir()):
        if re.fullmatch(pattern, file.name, re.IGNORECASE) and file.is_file() and file.stat().st_size > 0:
            return str(file)
    return None


def archive_file(source, root, end_date):
    date = datetime.date.fromisoformat(end_date)
    source_path = Path(source)
    root_path = Path(root)
    if not source_path.is_file():
        raise ValueError('下载文件不存在')
    if not root_path.is_dir():
        raise ValueError('设置的根目录不存在或无法访问')
    initial = source_path.stat()
    target_dir = root_path / (str(date.month) + '月份')
    target_dir.mkdir(exist_ok=True)
    target = target_dir / source_path.name

    def digest(path):
        h = hashlib.sha256()
        with path.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                h.update(block)
        return h.digest()

    def unchanged_source():
        after = source_path.stat()
        return (initial.st_size, initial.st_mtime_ns) == (after.st_size, after.st_mtime_ns)

    def remove_duplicate(existing):
        if not existing.is_file():
            return None
        existing_initial = existing.stat()
        source_hash = digest(source_path)
        if not unchanged_source():
            raise ValueError('下载文件发生变化，无法安全去重')
        identical = source_hash == digest(existing)
        if not identical and source_path.suffix.lower() == '.xls' and existing.suffix.lower() == '.xls':
            identical = equivalent_xls(source_path, existing)
        if not identical:
            return None
        existing_after = existing.stat()
        if not unchanged_source() or (existing_initial.st_size, existing_initial.st_mtime_ns) != (existing_after.st_size, existing_after.st_mtime_ns):
            raise ValueError('比较期间文件发生变化，无法安全去重')
        try:
            source_path.unlink()
            return {'path': str(existing), 'sourceRemoved': True, 'deduplicated': True}
        except OSError as exc:
            return {'path': str(existing), 'sourceRemoved': False, 'deduplicated': True, 'warning': str(exc)}

    # Chrome may append " (2)" when a download name already exists locally.
    # Only treat it as a suffix if an equivalent archive name already exists.
    numbered = re.match(r'^(.*) \(([2-9]|[1-9][0-9]+)\)$', source_path.stem)
    canonical_stem = numbered.group(1) if numbered else source_path.stem
    def matching_archives(stem):
        pattern = re.compile(r'^' + re.escape(stem) + r'(?: \((?:[2-9]|[1-9][0-9]+)\))?' + re.escape(source_path.suffix) + r'$', re.IGNORECASE)
        return sorted((p for p in target_dir.iterdir() if p.is_file() and pattern.fullmatch(p.name)), key=lambda p: (p.name.casefold() != (stem + source_path.suffix).casefold(), p.name.casefold()))

    candidates = matching_archives(canonical_stem)
    if numbered and not candidates:
        canonical_stem = source_path.stem
        candidates = matching_archives(canonical_stem)
    target = target_dir / (canonical_stem + source_path.suffix)
    while True:
        created = False
        for candidate in candidates:
            duplicate = remove_duplicate(candidate)
            if duplicate:
                return duplicate
        if candidates:
            raise ValueError('归档冲突：目标目录已有同名文件但内容不同；旧文件和本次下载均已保留：' + str(target))
        try:
            with source_path.open('rb') as src, target.open('xb') as dst:
                created = True
                shutil.copyfileobj(src, dst)
            candidate = target
            break
        except FileExistsError:
            candidates = matching_archives(canonical_stem)
        except Exception:
            # Exclusive creation succeeded only if the target now exists; remove a
            # partial output while leaving the original download intact.
            if created:
                target.unlink(missing_ok=True)
            raise
    try:
        if not unchanged_source() or digest(source_path) != digest(candidate):
            raise ValueError('下载文件发生变化或复制校验失败')
    except Exception:
        if created:
            candidate.unlink(missing_ok=True)
        raise
    try:
        source_path.unlink()
    except OSError as exc:
        return {'path': str(candidate), 'sourceRemoved': False, 'warning': str(exc)}
    return {'path': str(candidate), 'sourceRemoved': True}


def main():
    header = sys.stdin.buffer.read(4)
    if len(header) != 4:
        return
    size = struct.unpack('=I', header)[0]
    if size > 65536:
        respond({'error': '请求过大'})
        return
    message = json.loads(sys.stdin.buffer.read(size).decode('utf-8'))
    if message.get('action') == 'check_existing':
        results = [find_existing(job['root'], job['stage'], job['start'], job['end']) for job in message['jobs']]
        respond({'paths': results})
        return
    if message.get('action') == 'archive_file':
        respond(archive_file(message['source'], message['root'], message['endDate']))
        return
    if message.get('action') != 'select_folder':
        respond({'error': '不支持的操作'})
        return
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    try:
        path = filedialog.askdirectory(title='选择下载根目录', mustexist=True, parent=root)
        respond({'path': path or None})
    finally:
        root.destroy()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        respond({'error': str(exc)})
