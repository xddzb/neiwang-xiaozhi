"""Offline PDF operations for Harness. Run --help for the JSON CLI contract."""
import argparse
import io
import json
import math
import os
from pathlib import Path
import tempfile

LIMIT = 200 * 1024 * 1024


def scoped(root, value, existing=True):
    candidate = Path(value)
    candidate = (root / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        raise ValueError('文件必须位于指定工作区内') from None
    if existing:
        if not candidate.is_file():
            raise ValueError('输入文件不存在')
        if candidate.stat().st_size > LIMIT:
            raise ValueError('单个输入文件不能超过 200 MiB')
    elif not candidate.parent.is_dir():
        raise ValueError('输出目录不存在')
    return candidate


def pages(spec, count):
    if not spec or spec == 'all':
        return list(range(count))
    result = []
    for item in spec.split(','):
        parts = item.strip().split('-')
        if len(parts) == 1:
            values = [int(parts[0])]
        elif len(parts) == 2:
            a, b = map(int, parts)
            if a > b:
                raise ValueError('页码范围必须递增')
            values = range(a, b + 1)
        else:
            raise ValueError('页码格式示例：1,3-5')
        for n in values:
            if not 1 <= n <= count:
                raise ValueError(f'页码必须在 1 到 {count} 之间')
            if n - 1 not in result:
                result.append(n - 1)
    if not result:
        raise ValueError('请指定页码')
    return result


def font_name():
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    folder = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts'
    for filename in ('msyh.ttc', 'simsun.ttc'):
        try:
            pdfmetrics.registerFont(TTFont('LocalChinese', str(folder / filename), subfontIndex=0))
            return 'LocalChinese'
        except Exception:
            pass
    raise ValueError('未找到可嵌入的中文字体，请安装 Windows 中文字体（微软雅黑或宋体）')


def execute(args):
    from pypdf import PdfReader, PdfWriter
    root = Path(args.workspace).resolve(strict=True)
    if not root.is_dir():
        raise ValueError('工作区必须是目录')
    paths = [scoped(root, p) for p in args.input]
    if args.operation != 'merge' and len(paths) != 1:
        raise ValueError('只有 merge 支持多个输入文件')
    readers = [PdfReader(p) for p in paths]
    if any(r.is_encrypted for r in readers):
        raise ValueError('本版不处理加密 PDF，请提供已解密的副本')
    count = len(readers[0].pages)
    if args.operation == 'info':
        return {'ok': True, 'pages': count, 'bytes': paths[0].stat().st_size,
                'text_sample': readers[0].pages[0].extract_text()[:2000] if count else ''}
    if not args.output:
        raise ValueError('编辑操作必须指定 --output')
    output = scoped(root, args.output, existing=False)
    if output.suffix.lower() != '.pdf':
        raise ValueError('输出文件必须以 .pdf 结尾')
    if output.exists() or output in paths:
        raise ValueError('请另存为尚不存在的文件名，不能覆盖原件或现有结果')
    chosen = pages(args.pages, count)
    writer = PdfWriter()
    if args.operation == 'merge':
        for reader in readers:
            writer.append(reader)
        expected = sum(len(r.pages) for r in readers)
    elif args.operation in ('extract', 'delete'):
        chosen = chosen if args.operation == 'extract' else [n for n in range(count) if n not in chosen]
        if not chosen:
            raise ValueError('不能删除全部页面')
        writer.append(readers[0], pages=chosen)
        expected = len(chosen)
    else:
        writer.clone_document_from_reader(readers[0])
        expected = count
        if args.operation == 'rotate':
            for n in chosen:
                writer.pages[n].rotate(args.angle)
        elif args.operation == 'note':
            from pypdf.annotations import Text
            if not args.text.strip():
                raise ValueError('批注内容不能为空')
            for n in chosen:
                page = writer.pages[n]
                page.transfer_rotation_to_content()
                height = float(page.mediabox.height)
                writer.add_annotation(n, Text(rect=(24, height-48, 48, height-24), text=args.text, open=False))
        elif args.operation == 'text':
            from reportlab.pdfgen import canvas
            from reportlab.pdfbase.pdfmetrics import stringWidth
            if not args.text.strip():
                raise ValueError('添加文字不能为空')
            font = font_name()
            if not all(math.isfinite(v) for v in (args.size, args.x, args.y)):
                raise ValueError('位置和字号必须是有限数值')
            if not 4 <= args.size <= 144:
                raise ValueError('字号必须在 4 到 144 之间')
            for n in chosen:
                page = writer.pages[n]
                page.transfer_rotation_to_content()
                width, height = float(page.mediabox.width), float(page.mediabox.height)
                lines = args.text.splitlines()
                if (args.x < 0 or args.y < args.size or
                    args.y + (len(lines)-1)*args.size*1.5 > height - args.size or
                    max(stringWidth(line, font, args.size) for line in lines) + args.x > width):
                    raise ValueError('文字超出页面范围，请调整位置、字号或分行')
                stream = io.BytesIO()
                drawing = canvas.Canvas(stream, pagesize=(width, height))
                drawing.setFont(font, args.size)
                for i, line in enumerate(lines):
                    drawing.drawString(args.x, height-args.y-i*args.size*1.5, line)
                drawing.save()
                stream.seek(0)
                page.merge_page(PdfReader(stream).pages[0])
    fd, temporary = tempfile.mkstemp(prefix='.pdf-saving-', suffix='.pdf', dir=output.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            writer.write(stream)
        check = PdfReader(temporary, strict=True)
        if len(check.pages) != expected:
            raise ValueError('保存后页数校验失败')
        # Render every output page to verify the saved structure is readable.
        import pypdfium2 as pdfium
        with pdfium.PdfDocument(temporary) as document:
            for i in range(len(document)):
                page = document[i]
                try:
                    bitmap = page.render(scale=min(0.5, 1000/max(page.get_size())))
                    try:
                        if bitmap.width <= 0 or bitmap.height <= 0:
                            raise ValueError('保存后页面渲染校验失败')
                    finally:
                        bitmap.close()
                finally:
                    page.close()
        # Windows rename fails if a destination appeared during validation.
        os.rename(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return {'ok': True, 'output': str(output), 'pages': expected,
            'verified': '重新打开、页数检查、逐页渲染通过',
            'scope': '页面操作/批注/新增文字；不修改原正文、不做安全涂黑，已有数字签名可能失效'}


def parser():
    p = argparse.ArgumentParser(description='本地 PDF 工具：工作区内另存，单输入不超过 200 MiB；页码从 1 开始')
    p.add_argument('operation', choices=['info', 'merge', 'extract', 'delete', 'rotate', 'note', 'text'])
    p.add_argument('--workspace', required=True)
    p.add_argument('--input', nargs='+', required=True)
    p.add_argument('--output')
    p.add_argument('--pages', default='all', help='all 或 1,3-5；extract 也支持重排，如 3,1,2')
    p.add_argument('--angle', type=int, choices=[90, 180, 270], default=90)
    p.add_argument('--text', default='')
    p.add_argument('--x', type=float, default=36, help='文字距左边点数')
    p.add_argument('--y', type=float, default=48, help='文字基线距上边点数')
    p.add_argument('--size', type=float, default=16)
    return p


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        print(json.dumps(execute(parser().parse_args()), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        raise SystemExit(1)
