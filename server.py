#!/usr/bin/env python3
"""
Local server for the MyAir3 control PWA.

Serves the app's static files AND proxies requests under /proxy/ to the
Advantage Air controller. Because the browser only ever talks to this one
same-origin server, it sidesteps both mixed-content (HTTPS page -> HTTP
device) and CORS (device sending no Access-Control-Allow-Origin header) --
neither restriction applies to a browser fetching its own origin.

Usage:
    python3 server.py [--port 8080] [--target-ip 192.168.1.192] [--target-port 2025]

Then, on a phone on the same WiFi, open http://<this-machine's-LAN-IP>:8080/
"""
import argparse
import http.server
import os
import socket
import socketserver
import urllib.error
import urllib.request
from urllib.parse import parse_qsl, urlencode, urlsplit

PWA_DIR = os.path.dirname(os.path.abspath(__file__))


def build_handler(default_ip, default_port):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=PWA_DIR, **kwargs)

        def do_GET(self):
            if self.path.startswith('/proxy/'):
                self.proxy_request()
            else:
                super().do_GET()

        def proxy_request(self):
            split = urlsplit(self.path)
            query_pairs = parse_qsl(split.query, keep_blank_values=True)

            ip, port, forward_pairs = default_ip, default_port, []
            for key, value in query_pairs:
                if key == '_ip':
                    ip = value
                elif key == '_port':
                    port = value
                else:
                    forward_pairs.append((key, value))

            target_path = split.path[len('/proxy'):]  # keeps leading '/'
            forward_query = urlencode(forward_pairs)
            target_url = f'http://{ip}:{port}{target_path}'
            if forward_query:
                target_url += f'?{forward_query}'

            try:
                with urllib.request.urlopen(target_url, timeout=6) as resp:
                    body = resp.read()
                    self.send_response(resp.status)
                    self.send_header('Content-Type', resp.headers.get('Content-Type', 'text/xml'))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(body)
            except Exception as exc:  # noqa: BLE001 - report any failure back to the page
                message = f'Proxy could not reach {target_url}: {exc}'
                body = message.encode('utf-8')
                self.send_response(502)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        def log_message(self, fmt, *args):
            print('  ' + (fmt % args))

    return Handler


def local_lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--target-ip', default='192.168.1.192', help='Default aircon controller IP (the page can override this per-request)')
    parser.add_argument('--target-port', type=int, default=2025)
    args = parser.parse_args()

    handler = build_handler(args.target_ip, args.target_port)
    with socketserver.TCPServer(('0.0.0.0', args.port), handler) as httpd:
        lan_ip = local_lan_ip()
        print(f'Serving MyAir3 PWA from {PWA_DIR}')
        print(f'Proxying /proxy/* -> http://{args.target_ip}:{args.target_port}/* by default (overridable per-request)')
        print()
        print(f'  On this machine:  http://localhost:{args.port}/')
        print(f'  On your phone:    http://{lan_ip}:{args.port}/   (same WiFi as this machine and the aircon)')
        print()
        print('Press Ctrl+C to stop.')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')


if __name__ == '__main__':
    main()
