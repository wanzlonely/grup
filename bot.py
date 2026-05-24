import json
import re
import time
import hashlib
import threading
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter

BOT_TOKEN   = "7673309476:AAEAg4kBjtBvCAKLAN3tBjNcuhJLYr7TdDg"
CHAT_ID     = "-1003735136099"
OWNER_ID    = "8062935882"
OWNER_UN    = "@walz343"
GRUP_LINK_1 = "https://t.me/+bSfHLFkNb7Q0YzQ1"
GRUP_LINK_2 = "https://t.me/numberspyx"
BASE        = "https://www.ivasms.com"
HUB_URL     = "https://hub.orangecarrier.com"
COOKIE_FILE = "cookies.json"
TG_API      = f"https://api.telegram.org/bot{BOT_TOKEN}"
POLL_SECS   = 5
VERSION     = "2.1"

URL_SMS_RX  = f"{BASE}/portal/sms/received"
URL_GETNUM  = f"{BASE}/portal/sms/received/getsms/number"
URL_GETSMS  = f"{BASE}/portal/sms/received/getsms"
URL_GETSMS2 = f"{BASE}/portal/sms/received/getsms/number/sms"
URL_NUMBERS = f"{BASE}/portal/numbers"
URL_BULK_RT = f"{BASE}/portal/numbers/return/allnumber/bluck"
URL_EXPORT  = f"{BASE}/portal/numbers/export-number-excel"
URL_LIVE_D  = f"{BASE}/portal/live/getsms"
URL_PORTAL  = f"{BASE}/portal"
LIVE_SIO    = "https://ivasms.com:2087"

SKIP_SENDERS = {"sender","message","time","revenue","pesan","waktu","from","pengirim"}

FLAG = {
    "AFGHANISTAN":"🇦🇫","ALBANIA":"🇦🇱","ALGERIA":"🇩🇿","ANGOLA":"🇦🇴","ARGENTINA":"🇦🇷",
    "ARMENIA":"🇦🇲","AUSTRALIA":"🇦🇺","AUSTRIA":"🇦🇹","AZERBAIJAN":"🇦🇿","BAHRAIN":"🇧🇭",
    "BANGLADESH":"🇧🇩","BELARUS":"🇧🇾","BELGIUM":"🇧🇪","BENIN":"🇧🇯","BRAZIL":"🇧🇷",
    "BRUNEI":"🇧🇳","BULGARIA":"🇧🇬","BURKINA FASO":"🇧🇫","BURUNDI":"🇧🇮","CAMBODIA":"🇰🇭",
    "CAMEROON":"🇨🇲","CANADA":"🇨🇦","CHAD":"🇹🇩","CHILE":"🇨🇱","CHINA":"🇨🇳",
    "COLOMBIA":"🇨🇴","CONGO":"🇨🇩","CROATIA":"🇭🇷","CZECHIA":"🇨🇿","DENMARK":"🇩🇰",
    "ECUADOR":"🇪🇨","EGYPT":"🇪🇬","ETHIOPIA":"🇪🇹","FINLAND":"🇫🇮","FRANCE":"🇫🇷",
    "GABON":"🇬🇦","GEORGIA":"🇬🇪","GERMANY":"🇩🇪","GHANA":"🇬🇭","GREECE":"🇬🇷",
    "GUINEA":"🇬🇳","HONG KONG":"🇭🇰","HUNGARY":"🇭🇺","INDIA":"🇮🇳","INDONESIA":"🇮🇩",
    "IRAN":"🇮🇷","IRAQ":"🇮🇶","IRELAND":"🇮🇪","ISRAEL":"🇮🇱","ITALY":"🇮🇹",
    "IVORY COAST":"🇨🇮","COTE D'IVOIRE":"🇨🇮","JAPAN":"🇯🇵","JORDAN":"🇯🇴",
    "KAZAKHSTAN":"🇰🇿","KENYA":"🇰🇪","KUWAIT":"🇰🇼","LAOS":"🇱🇦","LATVIA":"🇱🇻",
    "LEBANON":"🇱🇧","LIBYA":"🇱🇾","MALAYSIA":"🇲🇾","MALI":"🇲🇱","MEXICO":"🇲🇽",
    "MOLDOVA":"🇲🇩","MONGOLIA":"🇲🇳","MOROCCO":"🇲🇦","MOZAMBIQUE":"🇲🇿","MYANMAR":"🇲🇲",
    "NEPAL":"🇳🇵","NETHERLANDS":"🇳🇱","NEW ZEALAND":"🇳🇿","NIGER":"🇳🇪","NIGERIA":"🇳🇬",
    "NORWAY":"🇳🇴","OMAN":"🇴🇲","PAKISTAN":"🇵🇰","PANAMA":"🇵🇦","PERU":"🇵🇪",
    "PHILIPPINES":"🇵🇭","POLAND":"🇵🇱","PORTUGAL":"🇵🇹","QATAR":"🇶🇦","ROMANIA":"🇷🇴",
    "RUSSIA":"🇷🇺","RWANDA":"🇷🇼","SAUDI ARABIA":"🇸🇦","SENEGAL":"🇸🇳","SERBIA":"🇷🇸",
    "SINGAPORE":"🇸🇬","SOMALIA":"🇸🇴","SOUTH AFRICA":"🇿🇦","SOUTH KOREA":"🇰🇷",
    "SPAIN":"🇪🇸","SRI LANKA":"🇱🇰","SUDAN":"🇸🇩","SWEDEN":"🇸🇪","SWITZERLAND":"🇨🇭",
    "TAIWAN":"🇹🇼","TANZANIA":"🇹🇿","THAILAND":"🇹🇭","TOGO":"🇹🇬","TUNISIA":"🇹🇳",
    "TURKEY":"🇹🇷","UGANDA":"🇺🇬","UKRAINE":"🇺🇦","UAE":"🇦🇪","UK":"🇬🇧","USA":"🇺🇸",
    "UZBEKISTAN":"🇺🇿","VENEZUELA":"🇻🇪","VIETNAM":"🇻🇳","YEMEN":"🇾🇪",
    "ZAMBIA":"🇿🇲","ZIMBABWE":"🇿🇼",
}

SENDER_MAP = {
    "whatsapp":  ("WhatsApp",  "📱"),
    "telegram":  ("Telegram",  "✈️"),
    "google":    ("Google",    "🔍"),
    "facebook":  ("Facebook",  "📘"),
    "instagram": ("Instagram", "📸"),
    "shopee":    ("Shopee",    "🛍"),
    "tokopedia": ("Tokopedia", "🛒"),
    "grab":      ("Grab",      "🚗"),
    "gojek":     ("Gojek",     "🛵"),
    "tiktok":    ("TikTok",    "🎵"),
    "twitter":   ("Twitter",   "🐦"),
    "x.com":     ("X",         "✖️"),
    "snapchat":  ("Snapchat",  "👻"),
    "line":      ("Line",      "💬"),
    "wechat":    ("WeChat",    "💚"),
    "viber":     ("Viber",     "💜"),
    "signal":    ("Signal",    "🔒"),
    "discord":   ("Discord",   "🎮"),
    "linkedin":  ("LinkedIn",  "💼"),
    "amazon":    ("Amazon",    "📦"),
    "netflix":   ("Netflix",   "🎬"),
    "spotify":   ("Spotify",   "🎧"),
    "apple":     ("Apple",     "🍎"),
    "microsoft": ("Microsoft", "🪟"),
    "yahoo":     ("Yahoo",     "🌐"),
    "paypal":    ("PayPal",    "💳"),
    "binance":   ("Binance",   "🟡"),
    "coinbase":  ("Coinbase",  "🔵"),
    "lazada":    ("Lazada",    "🏪"),
    "bukalapak": ("Bukalapak", "🛍"),
    "dana":      ("DANA",      "💙"),
    "ovo":       ("OVO",       "💜"),
    "gopay":     ("GoPay",     "🟢"),
    "linkaja":   ("LinkAja",   "🔴"),
    "steam":     ("Steam",     "🎮"),
}

COUNTRY_CLEAN = {
    "IVORY COAST":"Côte d'Ivoire","COTE D'IVOIRE":"Côte d'Ivoire",
    "SOUTH KOREA":"South Korea","HONG KONG":"Hong Kong",
    "SAUDI ARABIA":"Saudi Arabia","SOUTH AFRICA":"South Africa",
    "NEW ZEALAND":"New Zealand","BURKINA FASO":"Burkina Faso",
    "SRI LANKA":"Sri Lanka","UAE":"United Arab Emirates",
    "UK":"United Kingdom","USA":"United States",
}

csrf_token    = None
ivas_sess     = None
bot_running   = False
bot_thread    = None
loop_count    = 0
sms_seen      = set()
sms_date      = None
first_run     = True

live_seen     = set()
live_date     = None
live_counter  = Counter()

_live_sio      = None
_live_sio_lock = threading.Lock()
grup_msg_lock  = threading.Lock()

wait_cookie   = {}
wait_addrange = {}
wait_email    = {}
pending_range = {}

_tg_sess = requests.Session()
_tg_sess.headers.update({"Content-Type": "application/json"})


def server_today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def now_str():
    return datetime.now().strftime("%H:%M:%S")

def date_str():
    return datetime.now().strftime("%d %b %Y")

def esc(t):
    return str(t).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def strip_tags(h):
    return re.sub(r'<[^>]+>', '', h).strip()

def save_cookies(c):
    json.dump(c, open(COOKIE_FILE, "w"))

def load_cookies():
    try:   return json.load(open(COOKIE_FILE))
    except: return {}

def parse_cookie_export(raw):
    raw = raw.strip()
    if raw.startswith("["):
        items = json.loads(raw)
        result = {}
        for i in items:
            if i.get("name") in ("ivas_sms_session","XSRF-TOKEN","_ga","_gid","cf_clearance"):
                result[i["name"]] = i["value"]
        return result
    result = {}
    for part in raw.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            result[k.strip()] = v.strip()
    return result

def make_uid(rng, phone, ts, message):
    return hashlib.md5(f"{rng}|{phone}|{ts}|{message[:30]}".encode()).hexdigest()[:16]

def get_flag(name):
    n = name.upper().strip()
    for k, v in FLAG.items():
        if k in n: return v
    return "🌍"

def get_country(name):
    n = name.upper().strip()
    for k, v in COUNTRY_CLEAN.items():
        if k in n: return v
    for k in FLAG:
        if k in n: return k.title()
    return name.title()

def get_sender(sender):
    s = sender.lower()
    for k, (label, emoji) in SENDER_MAP.items():
        if k in s: return label, emoji
    return sender.strip() or "Unknown", "📨"

def mask_phone(phone):
    p = re.sub(r"[^0-9]", "", str(phone))
    if len(p) <= 6: return "+" + p
    cc   = p[:2]
    rest = p[2:]
    if len(rest) >= 6:
        masked = rest[:2] + "★★★★" + rest[-4:]
    else:
        masked = rest[:2] + "★★" + rest[-2:]
    return f"+{cc}{masked}"

def extract_otp(message):
    if not message: return None
    m = re.search(r'([0-9]{3,4}[-][0-9]{3,4})', message)
    if m: return re.sub(r'[^0-9]', '', m.group(1))
    for pat in [
        r'G-([0-9]{6})',
        r'[Cc]ode[\s:]+([0-9]{4,8})',
        r'OTP[^0-9]*([0-9]{4,8})',
        r'kode[^0-9]*([0-9]{4,8})',
        r'verif[a-z]*[^0-9]*([0-9]{4,8})',
        r'is[:\s]+([0-9]{4,8})',
        r'[Cc]odigo[^0-9]*([0-9]{4,8})',
    ]:
        m = re.search(pat, message, re.I)
        if m:
            val = m.group(1)
            if not re.match(r'^20[12][0-9]', val): return val
    for m in re.finditer(r'(?<![0-9])([0-9]{6})(?![0-9])', message):
        val = m.group(1)
        if not re.match(r'^20[12][0-9]', val): return val
    for m in re.finditer(r'(?<![0-9])([0-9]{4,8})(?![0-9])', message):
        val = m.group(1)
        if not re.match(r'^20[12][0-9]$', val): return val
    return None


def tg_raw(method, data, timeout=10):
    for _ in range(3):
        try:
            r = _tg_sess.post(f"{TG_API}/{method}", json=data, timeout=timeout)
            if r.ok: return r.json()
        except: time.sleep(0.3)
    return None

def tg_send(chat_id, text, markup=None):
    p = {"chat_id": str(chat_id), "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup: p["reply_markup"] = markup
    r = tg_raw("sendMessage", p)
    return r["result"]["message_id"] if r and r.get("ok") else None

def tg_edit(chat_id, mid, text, markup=None):
    p = {"chat_id": str(chat_id), "message_id": mid, "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup is not None: p["reply_markup"] = markup
    r = tg_raw("editMessageText", p)
    return r and r.get("ok")

def tg_answer(cbid, text="", alert=False):
    threading.Thread(
        target=tg_raw,
        args=("answerCallbackQuery",
              {"callback_query_id": cbid, "text": text, "show_alert": alert}),
        daemon=True,
    ).start()

def tg_group(text, markup=None):
    p = {"chat_id": CHAT_ID, "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup: p["reply_markup"] = markup
    r = tg_raw("sendMessage", p)
    return r["result"]["message_id"] if r and r.get("ok") else None

def tg_doc(chat_id, filename, data_bytes, caption=""):
    for _ in range(3):
        try:
            r = requests.post(
                f"{TG_API}/sendDocument",
                data={"chat_id": str(chat_id), "caption": caption[:1024], "parse_mode": "HTML"},
                files={"document": (filename, data_bytes, "application/octet-stream")},
                timeout=60,
            )
            if r.ok: return True
        except: time.sleep(2)
    return False

def tg_del(chat_id, mid):
    tg_raw("deleteMessage", {"chat_id": str(chat_id), "message_id": mid})


def _make_http_session(cookies):
    sess = requests.Session()
    sess.headers.update({
        "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/124.0.0.0 Safari/537.36",
        "Accept":           "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language":  "en-US,en;q=0.9",
        "Accept-Encoding":  "gzip, deflate",
        "X-Requested-With": "XMLHttpRequest",
        "Origin":           BASE,
        "Referer":          URL_SMS_RX,
        "Connection":       "keep-alive",
    })
    for name, value in cookies.items():
        sess.cookies.set(name, value, domain="www.ivasms.com")
    return sess

def _decode(r):
    enc = r.headers.get("Content-Encoding", "").lower()
    raw = r.content
    if "br" in enc:
        try:
            import brotli
            raw = brotli.decompress(raw)
        except: raw = r.content
    elif "gzip" in enc:
        import gzip as _gz
        try: raw = _gz.decompress(raw)
        except: raw = r.content
    try:    return raw.decode("utf-8")
    except: return r.text

def _post(url, data, referer=None):
    try:
        hdrs = {"Referer": referer or URL_SMS_RX,
                "Accept": "application/json, text/javascript, */*; q=0.01"}
        r = ivas_sess.post(url, data=data, headers=hdrs, timeout=20)
        print(f"[HTTP] {url.split('/')[-1]} → {r.status_code} ({len(r.content)}b)")
        if r.status_code == 419: return None
        if r.status_code not in (200, 201): return ""
        return _decode(r)
    except Exception as e:
        print(f"[HTTP] {e}")
        return ""

def refresh_csrf():
    global csrf_token
    if not ivas_sess: return False
    try:
        r = ivas_sess.get(URL_SMS_RX, timeout=15)
        if r.status_code != 200: return False
        html = _decode(r)
        if 'name="email"' in html or 'name="password"' in html: return False
        for pat in [
            r'<input[^>]+name=["\']_token["\'][^>]+value=["\']([^"\']+)["\']',
            r'<input[^>]+value=["\']([^"\']+)["\'][^>]+name=["\']_token["\']',
            r'<meta[^>]+name=["\']csrf-token["\'][^>]+content=["\']([^"\']+)["\']',
            r'"_token"\s*:\s*"([^"]+)"',
        ]:
            m = re.search(pat, html)
            if m:
                csrf_token = m.group(1).strip()
                break
        print(f"[CSRF] {'OK' if csrf_token else 'GAGAL'}")
        return bool(csrf_token)
    except Exception as e:
        print(f"[CSRF] {e}")
        return False


def _parse_ranges(html):
    ranges = []
    for pat in [
        r"toggleRange\s*\(\s*'([^']*)'\s*(?:,\s*'[^']*')?",
        r'toggleRange\s*\(\s*"([^"]*)"',
        r'data-range=["\']([^"\']+)["\']',
    ]:
        for m in re.finditer(pat, html):
            name = m.group(1).strip()
            if name and name not in ranges: ranges.append(name)
        if ranges: break
    return ranges

def _parse_phones(html):
    phones = []
    for pat in [
        r"toggleNum\w*\s*\(\s*'([^']*)'\s*,\s*'([^']*)'",
        r'data-phone=["\'](\+?[0-9]{9,15})["\']',
    ]:
        for m in re.finditer(pat, html):
            raw_ph = m.group(1).strip()
            clean  = re.sub(r'[^0-9]', '', raw_ph)
            if 8 <= len(clean) <= 15 and not any(p['clean'] == clean for p in phones):
                phones.append({'raw': raw_ph, 'clean': clean})
    if not phones:
        for m in re.finditer(
                r'<(?:span|td|div|p)[^>]*>\s*(\+?[0-9]{9,15})\s*</(?:span|td|div|p)>', html):
            raw_ph = m.group(1).strip()
            clean  = re.sub(r'[^0-9]', '', raw_ph)
            if 8 <= len(clean) <= 15 and not any(p['clean'] == clean for p in phones):
                phones.append({'raw': raw_ph, 'clean': clean})
    return phones

def _parse_sms_html(html, rng_name, phone_clean):
    results = []
    tbody_m = re.search(r'<tbody[^>]*>(.*?)</tbody>', html, re.S)
    tr_src  = tbody_m.group(1) if tbody_m else html
    for tr_m in re.finditer(r'<tr[^>]*>(.*?)</tr>', tr_src, re.S):
        tds = [strip_tags(td).strip()
               for td in re.findall(r'<td[^>]*>(.*?)</td>', tr_m.group(1), re.S)]
        if len(tds) < 3: continue
        sender, message, ts = tds[0], tds[1], tds[2]
        if sender.lower() in SKIP_SENDERS: continue
        if not message or not ts: continue
        if not re.search(r'\d{1,2}:\d{2}', ts): continue
        uid = make_uid(rng_name, phone_clean, ts, message)
        results.append({"uid": uid, "range": rng_name, "phone": phone_clean,
                        "sender": sender, "message": message, "time": ts})
    return results

def _fetch_phones_for_range(today, rng_name):
    html = _post(URL_GETNUM, {"_token": csrf_token, "start": today, "end": today, "range": rng_name})
    if not html: return []
    if "<!DOCTYPE" in html[:200] or "<html" in html[:200].lower(): return []
    return _parse_phones(html)

def _fetch_sms_for_phone(today, rng_name, ph):
    html = _post(URL_GETSMS2, {"_token": csrf_token, "start": today, "end": today,
                                "Number": ph['raw'], "Range": rng_name})
    if not html: return []
    return _parse_sms_html(html, rng_name, ph['clean'])

def fetch_all_sms():
    today = server_today()
    html  = _post(URL_GETSMS, {"_token": csrf_token, "from": today, "to": today})
    if html is None: return None
    if not html or len(html) < 50: return []
    if 'name="email"' in html or 'name="password"' in html: return None
    ranges = _parse_ranges(html)
    print(f"[FETCH] {len(ranges)} range: {ranges}")
    if not ranges: return []
    all_sms = []
    lock    = threading.Lock()

    def fetch_range(rng):
        phones  = _fetch_phones_for_range(today, rng)
        rng_sms = []
        with ThreadPoolExecutor(max_workers=6) as ex:
            futures = {ex.submit(_fetch_sms_for_phone, today, rng, ph): ph for ph in phones}
            for fut in as_completed(futures):
                try:    rng_sms.extend(fut.result())
                except: pass
        with lock: all_sms.extend(rng_sms)

    with ThreadPoolExecutor(max_workers=max(1, len(ranges))) as ex:
        list(ex.map(fetch_range, ranges))
    return all_sms


def _process_live_event(data):
    global live_date, live_seen, live_counter
    try:
        if isinstance(data, str):
            try:   data = json.loads(data)
            except: return
        if not isinstance(data, dict): return
        cli = str(data.get("cli") or data.get("sid") or "").strip().lower()
        if "whatsapp" not in cli: return
        termination_name = str(data.get("termination_name") or "").strip().upper()
        country = re.sub(r'\s*\d[\d\s]*$', '', termination_name).strip()
        country = re.sub(r'[^A-Z\s]', '', country).strip()
        if not country: return
        msg = str(data.get("message") or "")
        tid = str(data.get("termination_id") or "")
        uid = hashlib.md5(f"{tid}|{msg[:20]}".encode()).hexdigest()[:14]
        today = server_today()
        if live_date != today:
            live_seen = set(); live_date = today; live_counter = Counter()
        if uid in live_seen: return
        live_seen.add(uid)
        live_counter[country] += 1
        print(f"[LIVE] +1 {country}  total={live_counter[country]}")
    except Exception as e:
        print(f"[LIVE] parse error: {e}")

def _poll_live_page():
    print("[LIVE-POLL] HTTP polling dimulai")
    while bot_running:
        try:
            r    = ivas_sess.get(URL_LIVE_D, timeout=10)
            html = _decode(r)
            tbody_m = re.search(r'<tbody[^>]*>(.*?)</tbody>', html, re.S)
            if tbody_m:
                for tr_m in re.finditer(r'<tr[^>]*>(.*?)</tr>', tbody_m.group(1), re.S):
                    tds = [strip_tags(td).strip()
                           for td in re.findall(r'<td[^>]*>(.*?)</td>', tr_m.group(1), re.S)]
                    if len(tds) >= 3:
                        fake = {
                            "cli":              "whatsapp",
                            "termination_name": tds[1] if len(tds) > 1 else "",
                            "message":          tds[2] if len(tds) > 2 else "",
                            "termination_id":   tds[0] if tds else "",
                        }
                        _process_live_event(fake)
        except Exception as e:
            print(f"[LIVE-POLL] {e}")
        time.sleep(4)
    print("[LIVE-POLL] HTTP polling berhenti")

def _start_live_socket():
    global _live_sio
    try:
        import socketio as _sio_lib
    except ImportError:
        print("[LIVE] python-socketio tidak ada — fallback ke HTTP polling")
        threading.Thread(target=_poll_live_page, daemon=True).start()
        return
    cookies    = load_cookies()
    sess_val   = cookies.get("ivas_sms_session", "")
    xsrf_val   = cookies.get("XSRF-TOKEN", "")
    if not sess_val:
        print("[LIVE] Cookie belum ada")
        return
    cookie_hdr = f"ivas_sms_session={sess_val}; XSRF-TOKEN={xsrf_val}"
    sio = _sio_lib.Client(
        reconnection=True, reconnection_attempts=0,
        reconnection_delay=5, logger=False, engineio_logger=False,
    )

    @sio.event
    def connect():
        print("[LIVE] Socket.IO connected")

    @sio.event
    def disconnect():
        print("[LIVE] Socket.IO disconnected")

    @sio.on("send_message_test")
    def on_sms(data):
        _process_live_event(data)

    @sio.on("send_message_max_Limit_123372")
    def on_sms_limit(data):
        _process_live_event(data)

    with _live_sio_lock:
        _live_sio = sio

    for transport in (["websocket"], ["polling"]):
        try:
