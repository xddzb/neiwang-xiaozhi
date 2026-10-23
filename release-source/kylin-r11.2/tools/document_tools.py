"""PDF inspection / region render / offline OCR. Intranet acceptance pending."""
import argparse
import json
from pathlib import Path
import sys


def main():
    p = argparse.ArgumentParser()
    p.add_argument('operation', choices=['inspect', 'render', 'ocr'])
    p.add_argument('--workspace', required=True)
    p.add_argument('--input', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--page', type=int, default=1)
    p.add_argument('--region', choices=['full', 'title'], default='title')
    p.add_argument('--dpi', type=int, default=200)
    args = p.parse_args()
    root = Path(args.workspace).resolve(strict=True)
    def scoped(value):
        path = (root/value).resolve()
        path.relative_to(root)
        return path
    source, output = scoped(args.input), scoped(args.output)
    if source.stat().st_size > 200*1024*1024:
        raise ValueError('输入超过 200 MiB')
    if output.exists() or not output.parent.is_dir():
        raise ValueError('请指定工作区内尚不存在的输出文件，父目录需存在')
    if not 72 <= args.dpi <= 400:
        raise ValueError('dpi 范围为 72..400')
    if args.operation == 'render' and output.suffix.lower() != '.png':
        raise ValueError('渲染输出必须是 .png')
    if args.operation != 'render' and output.suffix.lower() != '.json':
        raise ValueError('识别/检查输出必须是 .json')
    from PIL import Image
    import numpy as np
    offset = [0, 0]
    scale = 1.0
    pdf_page = None
    if source.suffix.lower() == '.pdf':
        import pymupdf
        with pymupdf.open(source) as doc:
            if doc.needs_pass:
                raise ValueError('需要已解密 PDF')
            if not 1 <= args.page <= len(doc):
                raise ValueError('页码越界')
            page = doc[args.page-1]
            clip = page.rect
            if args.region == 'title':
                clip = pymupdf.Rect(clip.width*.6, clip.height*.7, clip.width, clip.height)
            if args.operation == 'inspect':
                # Text API coordinates are unrotated PDF points; report rotation.
                textclip = clip * page.derotation_matrix
                result = {'pages': len(doc), 'page': args.page, 'rotation': page.rotation,
                          'text_coordinate_space': 'unrotated PDF points',
                          'words': page.get_text('words', clip=textclip),
                          'drawing_paths_on_page': len(page.get_drawings()),
                          'annotations_on_page': sum(1 for _ in page.annots()),
                          'note': '绘图路径数量不代表修改线条数量'}
                with output.open('x', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                return {'ok': True, 'output': str(output)}
            scale = args.dpi/72
            if clip.width*clip.height*scale*scale > 36_000_000:
                raise ValueError('渲染区域超过 3600 万像素，请裁剪区域或降低 dpi')
            pix = page.get_pixmap(dpi=args.dpi, clip=clip, alpha=False, colorspace=pymupdf.csRGB)
            image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            offset = [pix.x/scale, pix.y/scale]
            pdf_page = args.page
    else:
        if args.operation != 'ocr':
            raise ValueError('图片输入仅支持 ocr')
        with Image.open(source) as original:
            if original.width*original.height > 36_000_000:
                raise ValueError('图片超过 3600 万像素，请先裁剪')
            image = original.convert('RGB')
        if args.region == 'title':
            left, top = int(image.width*.6), int(image.height*.7)
            image = image.crop((left, top, image.width, image.height))
            offset = [left, top]
    if args.operation == 'render':
        with output.open('xb') as stream:
            image.save(stream, format='PNG')
        return {'ok': True, 'output': str(output), 'region': args.region}
    import rapidocr_onnxruntime
    from rapidocr_onnxruntime import RapidOCR
    models = Path(rapidocr_onnxruntime.__file__).parent/'models'
    paths = [models/n for n in ('ch_PP-OCRv4_det_infer.onnx', 'ch_ppocr_mobile_v2.0_cls_infer.onnx', 'ch_PP-OCRv4_rec_infer.onnx')]
    if not all(path.is_file() for path in paths):
        raise ValueError('随包 OCR 模型不完整，不联网下载')
    engine = RapidOCR(det_model_path=str(paths[0]), cls_model_path=str(paths[1]),
                      rec_model_path=str(paths[2]), intra_op_num_threads=2,
                      inter_op_num_threads=1, det_use_cuda=False, rec_use_cuda=False)
    items, elapsed = engine(np.asarray(image)[:, :, ::-1].copy())
    result = {'page': pdf_page, 'region': args.region,
              'coordinate_space': 'rotated PDF points' if pdf_page else 'source image pixels',
              'items': [{'text': text, 'confidence': float(score),
                         'box': [[float(x)/scale+offset[0], float(y)/scale+offset[1]] for x,y in box]}
                        for box, text, score in (items or [])]}
    with output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    return {'ok': True, 'output': str(output), 'count': len(result['items']),
            'note': '置信度不是正确率，关键图号和版本需核对；坐标用于旋转后页面，绘图前需转换'}


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        print(json.dumps(main(), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        raise SystemExit(1)
