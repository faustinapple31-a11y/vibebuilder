"""Material library: every PBR set once, shared by all worlds.  blender -b --python make_textures.py -- outdir"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wf_textures  # noqa: E402

if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:]
    files = wf_textures.build(argv[0])
    print('WF {"phase": "textures", "progress": 1, "stats": {"sets": %d}}' % len(files), flush=True)
