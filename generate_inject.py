#!/usr/bin/env python3
"""
为 GitHub Actions pake 构建生成 --inject 文件。
生成后将路径写入 inject_paths.txt（每行一个路径）。
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATES = HERE / 'inject_templates'
SHARED_PLAYBACK = HERE / 'templates' / 'shared' / 'playback_store.js'

CHROME_FULL = '149.0.7827.201'
CHROME_MAJOR = CHROME_FULL.split('.')[0]

_AUTH_HOSTS = [
    'accounts.google.com', 'accounts.youtube.com', 'login.microsoftonline.com',
    'appleid.apple.com', 'github.com', 'facebook.com', 'twitter.com',
]
_DL_EXT = (
    'mp3|wav|flac|m4a|aac|ogg|opus|mp4|mkv|avi|mov|webm|pdf|zip|rar|7z|tar|gz|'
    'dmg|exe|apk|pkg|msi|deb|appimage|doc|docx|xls|xlsx|ppt|pptx|txt|csv|json|'
    'png|jpg|jpeg|gif|bmp|svg|webp|iso|epub|mobi'
)


def _tpl(name, mapping):
    p = TEMPLATES / name
    if not p.exists():
        print(f'[W] 模板文件不存在: {p}', file=sys.stderr)
        return ''
    code = p.read_text(encoding='utf-8')
    for k, v in mapping.items():
        code = code.replace(k, v)
    return code


def _ua(platform, ua_mode='desktop'):
    if ua_mode == 'mobile':
        return (f'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP1A.240505.005) '
                f'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{CHROME_FULL} Mobile Safari/537.36')
    if platform == 'macos':
        return (f'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                f'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{CHROME_FULL} Safari/537.36')
    if platform == 'linux':
        return (f'Mozilla/5.0 (X11; Linux x86_64) '
                f'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{CHROME_FULL} Safari/537.36')
    return (f'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            f'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{CHROME_FULL} Safari/537.36')


def gen_desktop_fix(platform, ua_mode='desktop', background_play=False):
    mobile = ua_mode in ('mobile', 'iphone', 'ipad')
    if ua_mode == 'mobile':
        nav_p, uad_p, pv = 'Linux armv8l', 'Android', '14.0.0'
    elif platform == 'macos' or ua_mode == 'mac':
        nav_p, uad_p, pv = 'MacIntel', 'macOS', '15.0.0'
    elif platform == 'linux':
        nav_p, uad_p, pv = 'Linux x86_64', 'Linux', '6.0.0'
    else:
        nav_p, uad_p, pv = 'Win32', 'Windows', '15.0.0'

    plugins = json.dumps([
        {'name': 'Chrome PDF Viewer', 'filename': 'internal-pdf-viewer', 'description': 'Portable Document Format'},
        {'name': 'Chromium PDF Viewer', 'filename': 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'description': 'Portable Document Format'},
        {'name': 'Microsoft Edge PDF Viewer', 'filename': 'internal-pdf-viewer', 'description': 'Portable Document Format'},
        {'name': 'WebKit built-in PDF', 'filename': 'internal-pdf-viewer', 'description': 'Portable Document Format'},
    ], ensure_ascii=False)
    mimes = json.dumps([
        {'type': 'application/pdf', 'suffixes': 'pdf', 'description': 'Portable Document Format'},
        {'type': 'text/pdf', 'suffixes': 'pdf', 'description': 'Portable Document Format'},
    ], ensure_ascii=False)

    return _tpl('desktop_fix.js', {
        '__W2A_CLEAN_UA_JSON__':        json.dumps(_ua(platform, ua_mode), ensure_ascii=False),
        '__W2A_PROXY_JSON__':            '{}',
        '__W2A_SPOOF_ENABLED__':         'false',
        '__W2A_FAKE_PLUGINS_JSON__':     plugins,
        '__W2A_FAKE_MIME_TYPES_JSON__':  mimes,
        '__W2A_DOWNLOAD_EXTENSIONS__':   _DL_EXT,
        '__W2A_BACKGROUND_PLAY__':       'true' if background_play else 'false',
        '__W2A_IS_MOBILE__':             'true' if mobile else 'false',
        '__W2A_TOUCH_POINTS__':          '5' if mobile else '0',
        '__W2A_HW_CONCURRENCY__':        '4' if mobile else '8',
        '__W2A_ARCH_JSON__':             json.dumps('arm' if mobile else 'x86'),
        '__W2A_BITNESS_JSON__':          json.dumps('' if mobile else '64'),
        '__W2A_MODEL_JSON__':            json.dumps('Pixel 8 Pro' if ua_mode == 'mobile' else ''),
        '__W2A_AUTH_HOSTS_JSON__':       json.dumps(_AUTH_HOSTS),
        '__W2A_CHROME_FULL_JSON__':      json.dumps(CHROME_FULL),
        '__W2A_CHROME_MAJOR_JSON__':     json.dumps(CHROME_MAJOR),
        '__W2A_UAD_PLATFORM_JSON__':     json.dumps(uad_p, ensure_ascii=False),
        '__W2A_NAV_PLATFORM_JSON__':     json.dumps(nav_p, ensure_ascii=False),
        '__W2A_PLATFORM_VERSION_JSON__': json.dumps(pv, ensure_ascii=False),
    })


def gen_desktop_ui(name, url, hide_title_bar, toolbar, always_on_top, cinema, download_mgr):
    shared = ''
    if SHARED_PLAYBACK.exists():
        shared = SHARED_PLAYBACK.read_text(encoding='utf-8').strip()
    return _tpl('desktop_ui.js', {
        '__W2A_APP_NAME_JSON__':             json.dumps(name or 'Web2App', ensure_ascii=False),
        '__W2A_LAUNCH_URL_JSON__':           json.dumps(url or '', ensure_ascii=False),
        '__W2A_ENABLE_TITLE_BAR__':          'true' if hide_title_bar else 'false',
        '__W2A_SHOW_TOOLBAR__':              'true' if toolbar else 'false',
        '__W2A_ENABLE_CINEMA__':             'true' if cinema else 'false',
        '__W2A_ENABLE_DOWNLOAD_MANAGER__':   'true' if download_mgr else 'false',
        '__W2A_DEFAULT_ALWAYS_ON_TOP__':     'true' if always_on_top else 'false',
        '__W2A_SHARED_PLAYBACK_STORE__':     shared,
    })


def gen_login(username, password):
    if not username or not password:
        return ''
    cfg = {'enabled': True, 'user': username, 'password': password}
    return _tpl('login.js', {'__W2A_LOGIN_JSON__': json.dumps(cfg, ensure_ascii=False)})


def gen_basic_auth():
    return _tpl('basic_auth.js', {'__W2A_PACKAGED_JSON__': '{}'})


def _write(path, code):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(code.strip() + '\n', encoding='utf-8')
    return path


def main():
    ap = argparse.ArgumentParser(description='生成 pake --inject 文件')
    ap.add_argument('--platform',        default='windows')
    ap.add_argument('--url',             default='')
    ap.add_argument('--name',            default='app')
    ap.add_argument('--ua-mode',         dest='ua_mode',        default='desktop')
    ap.add_argument('--hide-title-bar',  dest='hide_title_bar', action='store_true')
    ap.add_argument('--toolbar',         action='store_true')
    ap.add_argument('--always-on-top',   dest='always_on_top',  action='store_true')
    ap.add_argument('--cinema-mode',     dest='cinema_mode',    action='store_true')
    ap.add_argument('--download-manager',dest='download_manager',action='store_true')
    ap.add_argument('--background-play', dest='background_play',action='store_true')
    ap.add_argument('--username',        default='')
    ap.add_argument('--password',        default='')
    ap.add_argument('--out-dir',         dest='out_dir',        default='inject_out')
    args = ap.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = []

    fix = gen_desktop_fix(args.platform, args.ua_mode, args.background_play)
    if fix.strip():
        paths.append(str(_write(out / 'inject_desktop_fix.js', fix)))

    ui = gen_desktop_ui(
        args.name, args.url,
        args.hide_title_bar, args.toolbar, args.always_on_top,
        args.cinema_mode, args.download_manager,
    )
    if ui.strip():
        paths.append(str(_write(out / 'inject_desktop_ui.js', ui)))

    login = gen_login(args.username, args.password)
    if login.strip():
        paths.append(str(_write(out / 'inject_login.js', login)))

    auth = gen_basic_auth()
    if auth.strip():
        paths.append(str(_write(out / 'inject_basic_auth.js', auth)))

    Path('inject_paths.txt').write_text(
        '\n'.join(paths) + ('\n' if paths else ''), encoding='utf-8'
    )
    print(f'[generate_inject] 生成 {len(paths)} 个注入文件:')
    for p in paths:
        print(f'  --inject {p}')


if __name__ == '__main__':
    main()
