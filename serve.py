#!/usr/bin/env python3
"""Static server for local development.

Two deviations from the stock http.server:

- Sends no-store on every response. The stock server sends no cache headers at
  all, which lets browsers apply heuristic freshness and serve stale ES
  modules after an edit.

- Tolerates the client hanging up mid-transfer. Browser PDF viewers routinely
  abort the initial full-file download once they can render (they'd rather use
  range requests, which this simple server doesn't support). The stock server
  prints a BrokenPipeError traceback every time that happens; it's a normal
  disconnect, not a failure — the file was served fine.

Threaded, so one slow download doesn't stall every other request.
"""

import sys
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (BrokenPipeError, ConnectionResetError):
            pass  # client closed the connection early; nothing to clean up

    def handle(self):
        try:
            super().handle()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = partial(NoCacheHandler, directory='.')
    print('AQBBA prototype on http://localhost:%d' % port)
    ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()
