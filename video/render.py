"""Render the whole film: frames in parallel -> ffmpeg (x4 nearest upscale) + soundtrack."""
import os
import sys
import time
import subprocess
import multiprocessing as mp
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from core import W, H, FPS, NFRAMES, SCALE  # noqa: E402


def _init(name='story'):
    global story
    import importlib
    story = importlib.import_module(name)


def _render(i):
    return i, story.render_frame(i / FPS).tobytes()


def main(out_path, wav_path, workers=4, start=0, end=None, story_name='story'):
    end = NFRAMES if end is None else end
    if not os.path.exists(wav_path):
        import importlib
        importlib.import_module('audio2' if story_name == 'story2' else 'audio').write_wav(wav_path)
    cmd = ['ffmpeg', '-y', '-loglevel', 'error',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', wav_path,
           '-vf', f'scale={W * SCALE}:{H * SCALE}:flags=neighbor:out_color_matrix=bt709,format=yuv420p',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'animation', '-profile:v', 'high',
           '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
           '-c:a', 'aac', '-b:a', '256k', '-ar', '44100',
           '-shortest', '-movflags', '+faststart', out_path]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    with mp.Pool(workers, initializer=_init, initargs=(story_name,)) as pool:
        for k, (i, buf) in enumerate(pool.imap(_render, range(start, end), chunksize=4)):
            ff.stdin.write(buf)
            if k % 60 == 0:
                el = time.time() - t0
                print(f'frame {i}/{end}  {el:.0f}s  eta {el / (k + 1) * (end - start - k - 1):.0f}s', flush=True)
    ff.stdin.close()
    ff.wait()
    print('done in %.0fs' % (time.time() - t0))


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'output', 'video.mp4')
    wav = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'output', 'soundtrack.wav')
    name = sys.argv[3] if len(sys.argv) > 3 else 'story'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    main(out, wav, story_name=name)
