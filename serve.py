#!/usr/bin/env python3
"""Static server for local development.

Sends no-store on every response. The stock http.server sends no cache headers
at all, which lets browsers apply heuristic freshness and serve stale ES
modules after an edit.
"""

import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = partial(NoCacheHandler, directory='.')
    print('AQBBA prototype on http://localhost:%d' % port)
    HTTPServer(('127.0.0.1', port), handler).serve_forever()
